import { query } from "@/lib/db"
import { finishAiRun, resolveTextModel, startAiRun } from "@/lib/ai-settings"
import { embedText } from "@/lib/ai"
import { generateText, Output } from "ai"
import { z } from "zod"

export type AgentKind = "entity_enrichment" | "auto_labeller" | "digest"
export type AgentRunStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled"

export type AgentConfig = {
  id: number
  user_id: string
  kind: AgentKind
  label_id: number | null
  enabled: boolean
  instructions: string
  allow_web_research: boolean
  created_at: string
  updated_at: string
}

export type AgentRun = {
  id: number
  config_id: number
  user_id: string
  trigger: "retroactive" | "capture" | "manual" | "schedule"
  status: AgentRunStatus
  provider: string | null
  model_id: string | null
  credential_source: string | null
  total_items: number
  completed_items: number
  failed_items: number
  error_message: string | null
  created_at: string
  started_at: string | null
  completed_at: string | null
}

export async function getEntityAgentConfig(userId: string, labelId: number) {
  const { rows } = await query<AgentConfig>(
    `SELECT id, user_id, kind, label_id, enabled, instructions, allow_web_research, created_at, updated_at
     FROM agent_configs
     WHERE user_id = $1 AND kind = 'entity_enrichment' AND label_id = $2`,
    [userId, labelId],
  )
  return rows[0] ?? null
}

export async function listEntityAgentConfigs(userId: string) {
  const { rows } = await query<AgentConfig>(
    `SELECT id, user_id, kind, label_id, enabled, instructions, allow_web_research, created_at, updated_at
     FROM agent_configs
     WHERE user_id = $1 AND kind = 'entity_enrichment'`,
    [userId],
  )
  return rows
}

export async function listAgentRuns(userId: string, configId?: number) {
  const { rows } = await query<AgentRun>(
    `SELECT id, config_id, user_id, trigger, status, provider, model_id, credential_source,
            total_items, completed_items, failed_items, error_message, created_at, started_at, completed_at
     FROM agent_runs
     WHERE user_id = $1 AND ($2::int IS NULL OR config_id = $2)
     ORDER BY created_at DESC`,
    [userId, configId ?? null],
  )
  return rows
}

export async function queueEntityAgentRun(userId: string, configId: number, trigger: "retroactive" | "capture", postId?: number) {
  const { rows: configs } = await query<AgentConfig>(
    `SELECT id, user_id, kind, label_id, enabled, instructions, allow_web_research, created_at, updated_at
     FROM agent_configs WHERE id = $1 AND user_id = $2 AND kind = 'entity_enrichment' AND enabled = true`,
    [configId, userId],
  )
  const config = configs[0]
  if (!config || config.label_id == null) return null
  const model = await resolveTextModel(userId, "chat")
  const { rows: runs } = await query<{ id: number }>(
    `INSERT INTO agent_runs (config_id, user_id, trigger, provider, model_id, credential_source)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [config.id, userId, trigger, model.provider, model.model_id, model.credential_source],
  )
  const runId = runs[0].id
  const result = await query<{ post_id: number }>(
    `INSERT INTO agent_run_items (run_id, post_id)
     SELECT $1, p.id
     FROM posts p
     JOIN post_labels pl ON pl.post_id = p.id
     WHERE p.user_id = $2 AND pl.label_id = $3
       AND ($4::int IS NULL OR p.id = $4)
     ON CONFLICT DO NOTHING
     RETURNING post_id`,
    [runId, userId, config.label_id, postId ?? null],
  )
  await query("UPDATE agent_runs SET total_items = $2 WHERE id = $1", [runId, result.rows.length])
  if (result.rows.length === 0) {
    await query("UPDATE agent_runs SET status = 'succeeded', completed_at = now() WHERE id = $1", [runId])
  }
  return { runId, totalItems: result.rows.length }
}

export async function queueCaptureEntityAgents(userId: string, postId: number, labelIds: number[]) {
  if (labelIds.length === 0) return []
  const { rows: configs } = await query<{ id: number }>(
    `SELECT id FROM agent_configs
     WHERE user_id = $1 AND kind = 'entity_enrichment' AND enabled = true AND label_id = ANY($2::int[])`,
    [userId, labelIds],
  )
  return Promise.all(configs.map((config) => queueEntityAgentRun(userId, config.id, "capture", postId)))
}

export async function queueAutoLabelRun(input: {
  userId: string
  sourceLabelIds: number[]
  labelMatch: "any" | "all"
  searchQuery?: string
  destinationLabelIds: number[]
  instructions: string
}) {
  const destinationLabelIds = [...new Set(input.destinationLabelIds.filter((id) => Number.isInteger(id) && id > 0))]
  const sourceLabelIds = [...new Set(input.sourceLabelIds.filter((id) => Number.isInteger(id) && id > 0))]
  const searchQuery = input.searchQuery?.trim().slice(0, 200) || null
  const instructions = input.instructions.trim().slice(0, 2000)
  if (destinationLabelIds.length === 0) throw new Error("Choose at least one destination label.")
  const { rows: labels } = await query<{ id: number; name: string }>(
    "SELECT id, name FROM categories WHERE user_id = $1 AND id = ANY($2::int[])",
    [input.userId, destinationLabelIds],
  )
  if (labels.length !== destinationLabelIds.length) throw new Error("One or more labels were not found.")
  const model = await resolveTextModel(input.userId, "chat")
  const { rows: configs } = await query<{ id: number }>(
    `INSERT INTO agent_configs (user_id, kind, enabled, instructions)
     VALUES ($1, 'auto_labeller', true, $2) RETURNING id`,
    [input.userId, instructions],
  )
  const context = { destinationLabels: labels, sourceLabelIds, labelMatch: input.labelMatch, searchQuery }
  const { rows: runs } = await query<{ id: number }>(
    `INSERT INTO agent_runs (config_id, user_id, trigger, provider, model_id, credential_source, context)
     VALUES ($1, $2, 'manual', $3, $4, $5, $6) RETURNING id`,
    [configs[0].id, input.userId, model.provider, model.model_id, model.credential_source, JSON.stringify(context)],
  )
  const labelFilter = input.labelMatch === "all"
    ? `(cardinality($2::int[]) = 0 OR p.id IN (SELECT pl.post_id FROM post_labels pl WHERE pl.label_id = ANY($2::int[]) GROUP BY pl.post_id HAVING count(DISTINCT pl.label_id) = cardinality($2::int[])))`
    : `(cardinality($2::int[]) = 0 OR p.id IN (SELECT pl.post_id FROM post_labels pl WHERE pl.label_id = ANY($2::int[])))`
  const items = await query<{ post_id: number }>(
    `INSERT INTO agent_run_items (run_id, post_id)
     SELECT $4, p.id FROM posts p
     WHERE p.user_id = $1 AND ${labelFilter}
       AND ($3::text IS NULL OR to_tsvector('simple', coalesce(p.caption, '') || ' ' || coalesce(p.author_handle, '') || ' ' || coalesce(p.author_name, '') || ' ' || coalesce(p.summary, '') || ' ' || coalesce(p.enriched_text, '') || ' ' || coalesce(p.source_url, '') || ' ' || coalesce(p.post_url, '')) @@ websearch_to_tsquery('simple', $3))
     RETURNING post_id`,
    [input.userId, sourceLabelIds, searchQuery, runs[0].id],
  )
  await query("UPDATE agent_runs SET total_items = $2, status = CASE WHEN $2 = 0 THEN 'succeeded' ELSE 'queued' END, completed_at = CASE WHEN $2 = 0 THEN now() ELSE NULL END WHERE id = $1", [runs[0].id, items.rows.length])
  return { runId: runs[0].id, totalItems: items.rows.length }
}

type ClaimedEntityItem = {
  itemId: number
  runId: number
  userId: string
  instructions: string
  postId: number
  caption: string | null
  summary: string | null
  enrichedText: string | null
}

const entityOutputSchema = z.object({
  entities: z.array(z.object({
    name: z.string(),
    type: z.string().nullable(),
    location: z.string().nullable(),
    details: z.record(z.string(), z.string()).default({}),
  })),
  notes: z.string().nullable(),
})

async function claimEntityItem(): Promise<ClaimedEntityItem | null> {
  const { rows } = await query<ClaimedEntityItem>(
    `WITH next_item AS (
       SELECT item.id
       FROM agent_run_items item
       JOIN agent_runs run ON run.id = item.run_id
       JOIN agent_configs config ON config.id = run.config_id
       WHERE item.status = 'queued' AND run.status IN ('queued', 'running')
         AND config.kind = 'entity_enrichment' AND config.enabled = true
       ORDER BY item.created_at
       LIMIT 1
       FOR UPDATE SKIP LOCKED
     ), claimed AS (
       UPDATE agent_run_items item
       SET status = 'running'
       FROM next_item
       WHERE item.id = next_item.id
       RETURNING item.id, item.run_id, item.post_id
     ), started AS (
       UPDATE agent_runs run
       SET status = 'running', started_at = COALESCE(started_at, now())
       FROM claimed
       WHERE run.id = claimed.run_id
     )
     SELECT claimed.id AS "itemId", claimed.run_id AS "runId", run.user_id AS "userId",
            config.instructions, claimed.post_id AS "postId", post.caption,
            post.summary, post.enriched_text AS "enrichedText"
     FROM claimed
     JOIN agent_runs run ON run.id = claimed.run_id
     JOIN agent_configs config ON config.id = run.config_id
     JOIN posts post ON post.id = claimed.post_id`,
  )
  return rows[0] ?? null
}

async function completeEntityItem(item: ClaimedEntityItem, output: z.infer<typeof entityOutputSchema>) {
  const documentText = JSON.stringify(output)
  const embedding = await embedText(documentText)
  await query(
    `UPDATE agent_run_items
     SET status = 'succeeded', output = $2, document_text = $3, embedding = $4::vector, completed_at = now()
     WHERE id = $1`,
    [item.itemId, JSON.stringify(output), documentText, `[${embedding.join(",")}]`],
  )
  await finishAgentRun(item.runId)
}

async function failEntityItem(item: ClaimedEntityItem, error: unknown) {
  const message = error instanceof Error ? error.message.slice(0, 500) : "Unknown agent error"
  await query(
    "UPDATE agent_run_items SET status = 'failed', error_message = $2, completed_at = now() WHERE id = $1",
    [item.itemId, message],
  )
  await finishAgentRun(item.runId)
}

async function finishAgentRun(runId: number) {
  await query(
    `UPDATE agent_runs run
     SET completed_items = totals.completed, failed_items = totals.failed,
         status = CASE WHEN totals.remaining = 0 AND totals.failed > 0 THEN 'failed'
                       WHEN totals.remaining = 0 THEN 'succeeded'
                       ELSE 'running' END,
         completed_at = CASE WHEN totals.remaining = 0 THEN now() ELSE NULL END
     FROM (
       SELECT run_id,
              count(*) FILTER (WHERE status = 'succeeded')::int AS completed,
              count(*) FILTER (WHERE status = 'failed')::int AS failed,
              count(*) FILTER (WHERE status IN ('queued', 'running'))::int AS remaining
       FROM agent_run_items WHERE run_id = $1 GROUP BY run_id
     ) totals
     WHERE run.id = totals.run_id`,
    [runId],
  )
}

export async function processNextEntityAgentItem() {
  const item = await claimEntityItem()
  if (!item) return { processed: false as const }
  let telemetryRunId: number | null = null
  let startedAt = 0
  try {
    const model = await resolveTextModel(item.userId, "chat")
    startedAt = Date.now()
    telemetryRunId = await startAiRun({
      userId: item.userId,
      feature: "entity_agent",
      provider: model.provider,
      modelId: model.model_id,
      credentialSource: model.credential_source,
    })
    const result = await generateText({
      model: model.model,
      experimental_output: Output.object({ schema: entityOutputSchema }),
      system: [
        "You extract useful entities and structured facts from a saved post.",
        "Follow the user's instructions exactly. Do not invent facts absent from the post.",
        "Return an empty entity list when no relevant entity is present.",
        `User instructions: ${item.instructions}`,
      ].join(" "),
      prompt: [
        item.caption ? `Caption:\n${item.caption}` : "",
        item.summary ? `Summary:\n${item.summary}` : "",
        item.enrichedText ? `Captured context:\n${item.enrichedText}` : "",
      ].filter(Boolean).join("\n\n"),
    })
    await finishAiRun({ id: telemetryRunId, status: "succeeded", startedAt, usage: result.usage })
    await completeEntityItem(item, result.experimental_output)
    return { processed: true as const, runId: item.runId, postId: item.postId }
  } catch (error) {
    if (telemetryRunId) {
      await finishAiRun({ id: telemetryRunId, status: "failed", startedAt, error })
    }
    await failEntityItem(item, error)
    return { processed: true as const, runId: item.runId, postId: item.postId, failed: true as const }
  }
}

type ClaimedAutoItem = {
  itemId: number
  runId: number
  userId: string
  postId: number
  instructions: string
  context: { destinationLabels: { id: number; name: string }[] }
  caption: string | null
  summary: string | null
  enrichedText: string | null
}

const autoLabelSchema = z.object({ label_ids: z.array(z.number()) })

async function claimAutoItem(): Promise<ClaimedAutoItem | null> {
  const { rows } = await query<ClaimedAutoItem>(
    `WITH next_item AS (
       SELECT item.id FROM agent_run_items item
       JOIN agent_runs run ON run.id = item.run_id JOIN agent_configs config ON config.id = run.config_id
       WHERE item.status = 'queued' AND run.status IN ('queued', 'running') AND config.kind = 'auto_labeller'
       ORDER BY item.created_at LIMIT 1 FOR UPDATE SKIP LOCKED
     ), claimed AS (
       UPDATE agent_run_items item SET status = 'running' FROM next_item WHERE item.id = next_item.id
       RETURNING item.id, item.run_id, item.post_id
     ), started AS (
       UPDATE agent_runs run SET status = 'running', started_at = COALESCE(started_at, now())
       FROM claimed WHERE run.id = claimed.run_id
     )
     SELECT claimed.id AS "itemId", claimed.run_id AS "runId", run.user_id AS "userId", claimed.post_id AS "postId",
            config.instructions, run.context, post.caption, post.summary, post.enriched_text AS "enrichedText"
     FROM claimed JOIN agent_runs run ON run.id = claimed.run_id JOIN agent_configs config ON config.id = run.config_id JOIN posts post ON post.id = claimed.post_id`,
  )
  return rows[0] ?? null
}

export async function processNextAutoLabelItem() {
  const item = await claimAutoItem()
  if (!item) return { processed: false as const }
  try {
    const model = await resolveTextModel(item.userId, "chat")
    const allowedIds = new Set(item.context.destinationLabels.map((label) => label.id))
    const result = await generateText({
      model: model.model,
      experimental_output: Output.object({ schema: autoLabelSchema }),
      system: `Assign zero or more supplied labels to this saved post. Never invent label IDs. Don't force a label onto a post when you have low/no conviction. ${item.instructions || ""}`,
      prompt: `Allowed labels:\n${item.context.destinationLabels.map((label) => `${label.id}: ${label.name}`).join("\n")}\n\nPost:\n${item.caption || item.summary || item.enrichedText || "(empty)"}`,
    })
    const labelIds = result.experimental_output.label_ids.filter((id) => allowedIds.has(id))
    if (labelIds.length) {
      await query("INSERT INTO post_labels (post_id, label_id) SELECT $1, unnest($2::int[]) ON CONFLICT DO NOTHING", [item.postId, labelIds])
    }
    await query("UPDATE agent_run_items SET status = 'succeeded', output = $2, completed_at = now() WHERE id = $1", [item.itemId, JSON.stringify({ labelIds })])
    await finishAgentRun(item.runId)
    return { processed: true as const }
  } catch (error) {
    await failEntityItem(item as ClaimedEntityItem, error)
    return { processed: true as const, failed: true as const }
  }
}
