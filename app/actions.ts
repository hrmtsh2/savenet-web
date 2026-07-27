"use server"

import { revalidatePath } from "next/cache"
import { query } from "@/lib/db"
import { requireUserId } from "@/lib/auth"
import { getConversation, getMessages, getPostsByIds } from "@/lib/queries"
import { runChatTurn, ChatError, type ChatTurnResult } from "@/lib/chat"
import { encryptApiKey, keyHint } from "@/lib/ai-credentials"
import { queueEntityAgentRun } from "@/lib/agents"
import { queueAutoLabelRun } from "@/lib/agents"
import { getDigestConfig, sendDigest } from "@/lib/digests"
import type { LabelMatch } from "@/lib/types"

export async function sendChatMessage(input: {
  conversationId?: number | null
  categoryId?: number | null
  categoryIds: number[] | null
  labelMatch?: LabelMatch
  message: string
}): Promise<{ ok: true; result: ChatTurnResult } | { ok: false; error: string }> {
  try {
    const result = await runChatTurn(await requireUserId(), input)
    revalidatePath("/chat")
    return { ok: true, result }
  } catch (err) {
    if (err instanceof ChatError) return { ok: false, error: err.message }
    console.log("[savenet] send chat error:", (err as Error).message)
    return { ok: false, error: "Something went wrong generating a recommendation." }
  }
}

export async function loadConversation(conversationId: number) {
  const userId = await requireUserId()
  const conversation = await getConversation(userId, conversationId)
  if (!conversation) return { ok: false as const, error: "Conversation not found" }
  const messages = await getMessages(conversationId)
  const ids = Array.from(new Set(messages.flatMap((message) => message.referenced_post_ids)))
  const posts = await getPostsByIds(userId, ids)
  const postsById = Object.fromEntries(posts.map((post) => [post.id, {
    id: post.id, postUrl: post.post_url, thumbnailUrl: post.thumbnail_url, summary: post.summary, platform: post.platform,
  }]))
  return { ok: true as const, conversation, messages, postsById }
}

export async function saveChatModelPreference(input: {
  credentialSource: "platform" | "byok"
  modelId: string
  apiKey?: string
}) {
  const userId = await requireUserId()
  const modelId = input.modelId.trim()
  if (input.credentialSource !== "platform" && input.credentialSource !== "byok") return { error: "Invalid credential source." }
  if (input.credentialSource === "byok" && (!modelId || modelId.length > 160 || !/^[a-zA-Z0-9._:/-]+$/.test(modelId))) {
    return { error: "Enter a valid model ID." }
  }
  const provider = input.credentialSource === "platform" ? "google" : "openrouter"
  const selectedModelId = input.credentialSource === "platform" ? "gemini-2.5-flash" : modelId

  if (input.credentialSource === "byok") {
    const apiKey = input.apiKey?.trim()
    const { rows: existing } = await query<{ provider: string }>(
      "SELECT provider FROM ai_provider_credentials WHERE user_id = $1 AND provider = $2",
      [userId, provider],
    )
    if (!existing[0] && !apiKey) return { error: "Enter an API key for this provider." }
    if (apiKey) {
      if (apiKey.length < 8 || apiKey.length > 1000) return { error: "Enter a valid API key." }
      try {
        await query(
          `INSERT INTO ai_provider_credentials (user_id, provider, encrypted_api_key, key_hint)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (user_id, provider) DO UPDATE
           SET encrypted_api_key = EXCLUDED.encrypted_api_key, key_hint = EXCLUDED.key_hint, updated_at = now()`,
          [userId, provider, encryptApiKey(apiKey), keyHint(apiKey)],
        )
      } catch (error) {
        console.log("[savenet] could not save BYOK credential:", (error as Error).message)
        return { error: "Could not securely save that API key. Check the server encryption key." }
      }
    }
  }

  await query(
    `INSERT INTO ai_model_preferences (user_id, feature, provider, model_id, credential_source)
     VALUES ($1, 'chat', $2, $3, $4)
     ON CONFLICT (user_id, feature) DO UPDATE
     SET provider = EXCLUDED.provider, model_id = EXCLUDED.model_id,
         credential_source = EXCLUDED.credential_source, updated_at = now()`,
    [userId, provider, selectedModelId, input.credentialSource],
  )
  revalidatePath("/settings")
  return { ok: true as const }
}

export async function saveEntityAgentConfig(input: {
  labelId: number
  enabled: boolean
  instructions: string
  allowWebResearch: boolean
}) {
  const userId = await requireUserId()
  const labelId = Number(input.labelId)
  const instructions = input.instructions.trim()
  if (!Number.isInteger(labelId) || labelId < 1) return { error: "Invalid label." }
  if (!instructions) return { error: "Add instructions for this agent." }
  if (instructions.length > 4_000) return { error: "Instructions must be 4,000 characters or fewer." }

  const { rows: labels } = await query<{ id: number }>(
    "SELECT id FROM categories WHERE id = $1 AND user_id = $2",
    [labelId, userId],
  )
  if (!labels[0]) return { error: "Label not found." }

  const updated = await query<{ id: number }>(
    `UPDATE agent_configs
     SET enabled = $3, instructions = $4, allow_web_research = $5, updated_at = now()
     WHERE user_id = $1 AND kind = 'entity_enrichment' AND label_id = $2
     RETURNING id`,
    [userId, labelId, input.enabled, instructions, input.allowWebResearch],
  )
  if (!updated.rows[0]) {
    await query(
      `INSERT INTO agent_configs (user_id, kind, label_id, enabled, instructions, allow_web_research)
       VALUES ($1, 'entity_enrichment', $2, $3, $4, $5)`,
      [userId, labelId, input.enabled, instructions, input.allowWebResearch],
    )
  }
  revalidatePath("/categories")
  return { ok: true as const }
}

export async function queueExistingEntityAgentPosts(configId: number) {
  const userId = await requireUserId()
  const result = await queueEntityAgentRun(userId, Number(configId), "retroactive")
  if (!result) return { error: "Enable and save this entity agent first." }
  revalidatePath("/categories")
  return { ok: true as const, totalItems: result.totalItems }
}

export async function autoLabelFilteredPosts(input: { sourceLabelIds: number[]; labelMatch: LabelMatch; searchQuery?: string; destinationLabelIds: number[]; instructions: string }) {
  const userId = await requireUserId()
  try {
    const result = await queueAutoLabelRun({ userId, ...input })
    revalidatePath("/library")
    return { ok: true as const, totalItems: result.totalItems }
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not start auto-labelling." }
  }
}

export async function saveDigestConfig(input: { enabled: boolean; instructions: string; labelIds: number[] }) {
  const userId = await requireUserId()
  const instructions = input.instructions.trim().slice(0, 4000)
  const labelIds = [...new Set(input.labelIds.filter((id) => Number.isInteger(id) && id > 0))]
  await query(
    `INSERT INTO digest_configs (user_id, enabled, instructions, label_ids)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id) DO UPDATE SET enabled = EXCLUDED.enabled, instructions = EXCLUDED.instructions, label_ids = EXCLUDED.label_ids, updated_at = now()`,
    [userId, input.enabled, instructions, labelIds],
  )
  revalidatePath("/settings")
  return { ok: true as const }
}

export async function sendDigestPreview() {
  const userId = await requireUserId()
  const config = await getDigestConfig(userId)
  if (!config) return { error: "Save the digest configuration first." }
  try {
    await sendDigest(config)
    return { ok: true as const }
  } catch (error) {
    console.error("[savenet] digest test failed:", error)
    return { error: error instanceof Error ? error.message : "Could not send digest." }
  }
}

export async function createCategory(formData: FormData) {
  const userId = await requireUserId()
  const name = String(formData.get("name") || "").trim()
  if (!name) return { error: "Name is required" }
  await query(
    `INSERT INTO categories (user_id, name, description, enable_entity_resolution, enable_web_enrichment, auto_created)
     VALUES ($1, $2, NULL, false, false, false)
     ON CONFLICT (user_id, lower(name)) DO NOTHING`,
    [userId, name],
  )
  revalidatePath("/categories")
  revalidatePath("/library")
  revalidatePath("/chat")
  return { ok: true as const }
}

export async function deleteCategory(labelId: number) {
  const userId = await requireUserId()
  if (!Number.isInteger(labelId) || labelId < 1) return { error: "Invalid label." }

  const { rows } = await query<{ id: number }>(
    `WITH removed_assignments AS (
       DELETE FROM post_labels pl
       USING categories c
       WHERE pl.label_id = c.id AND c.id = $1 AND c.user_id = $2
     )
     DELETE FROM categories
     WHERE id = $1 AND user_id = $2
     RETURNING id`,
    [labelId, userId],
  )
  if (!rows[0]) return { error: "Label not found." }

  revalidatePath("/categories")
  revalidatePath("/library")
  revalidatePath("/chat")
  return { ok: true as const }
}

export async function deletePost(formData: FormData) {
  const userId = await requireUserId()
  const id = Number(formData.get("id"))
  if (!id) return { error: "Missing id" }
  await query("DELETE FROM posts WHERE id = $1 AND user_id = $2", [id, userId])
  revalidatePath("/library")
  revalidatePath("/categories")
  revalidatePath("/chat")
  return { ok: true as const }
}

export async function addLabelToPosts(input: { labelId: number; postIds: number[] }) {
  const userId = await requireUserId()
  const labelId = Number(input.labelId)
  const postIds = [...new Set(input.postIds.map(Number).filter(Number.isInteger))]
  if (!Number.isInteger(labelId) || labelId < 1 || postIds.length === 0) return { error: "Choose a label and at least one post." }

  const { rows: labels } = await query<{ id: number }>(
    "SELECT id FROM categories WHERE id = $1 AND user_id = $2",
    [labelId, userId],
  )
  if (!labels[0]) return { error: "Label not found." }

  const result = await query(
    `INSERT INTO post_labels (post_id, label_id)
     SELECT p.id, $2
     FROM posts p
     WHERE p.user_id = $1 AND p.id = ANY($3::int[])
     ON CONFLICT DO NOTHING
     RETURNING post_id`,
    [userId, labelId, postIds],
  )
  revalidatePath("/library")
  revalidatePath("/categories")
  return { ok: true as const, added: result.rows.length }
}

export async function addLabelToFilteredPosts(input: { labelId: number; sourceLabelIds?: number[]; labelMatch?: LabelMatch; searchQuery?: string }) {
  const userId = await requireUserId()
  const labelId = Number(input.labelId)
  const sourceLabelIds = [...new Set((input.sourceLabelIds ?? []).filter((id) => Number.isInteger(id) && id > 0))]
  const labelMatch = input.labelMatch === "all" ? "all" : "any"
  const searchQuery = input.searchQuery?.trim().slice(0, 200) || null
  if (!Number.isInteger(labelId) || labelId < 1) return { error: "Choose a label." }

  const { rows: labels } = await query<{ id: number }>(
    "SELECT id FROM categories WHERE id = $1 AND user_id = $2",
    [labelId, userId],
  )
  if (!labels[0]) return { error: "Label not found." }

  const result = await query(
    `INSERT INTO post_labels (post_id, label_id)
     SELECT p.id, $4
     FROM posts p
     WHERE p.user_id = $1
       AND ${labelMatch === "all"
         ? `(cardinality($2::int[]) = 0 OR (SELECT count(DISTINCT pl.label_id) FROM post_labels pl WHERE pl.post_id = p.id AND pl.label_id = ANY($2::int[])) = cardinality($2::int[]))`
         : `(cardinality($2::int[]) = 0 OR EXISTS (SELECT 1 FROM post_labels pl WHERE pl.post_id = p.id AND pl.label_id = ANY($2::int[])))`}
       AND ($3::text IS NULL OR to_tsvector('simple',
         coalesce(p.caption, '') || ' ' || coalesce(p.author_handle, '') || ' ' ||
         coalesce(p.author_name, '') || ' ' || coalesce(p.summary, '') || ' ' ||
         coalesce(p.enriched_text, '') || ' ' || coalesce(p.source_url, '') || ' ' || coalesce(p.post_url, '')
       ) @@ websearch_to_tsquery('simple', $3))
     ON CONFLICT DO NOTHING
     RETURNING post_id`,
    [userId, sourceLabelIds, searchQuery, labelId],
  )
  revalidatePath("/library")
  revalidatePath("/categories")
  return { ok: true as const, added: result.rows.length }
}

export async function createLabelAndAddToFilteredPosts(input: { name: string; sourceLabelIds?: number[]; labelMatch?: LabelMatch; searchQuery?: string }) {
  const userId = await requireUserId()
  const name = input.name.trim().slice(0, 100)
  const sourceLabelIds = [...new Set((input.sourceLabelIds ?? []).filter((id) => Number.isInteger(id) && id > 0))]
  const labelMatch = input.labelMatch === "all" ? "all" : "any"
  const searchQuery = input.searchQuery?.trim().slice(0, 200) || null
  if (!name) return { error: "Enter a label name." }

  const result = await query<{ post_id: number }>(
    `WITH label AS (
       INSERT INTO categories (user_id, name, description, enable_entity_resolution, enable_web_enrichment, auto_created)
       VALUES ($1, $2, NULL, false, false, false)
       ON CONFLICT (user_id, lower(name)) DO UPDATE SET name = categories.name
       RETURNING id
     )
     INSERT INTO post_labels (post_id, label_id)
     SELECT p.id, label.id
     FROM posts p CROSS JOIN label
     WHERE p.user_id = $1
       AND ${labelMatch === "all"
         ? `(cardinality($3::int[]) = 0 OR (SELECT count(DISTINCT pl.label_id) FROM post_labels pl WHERE pl.post_id = p.id AND pl.label_id = ANY($3::int[])) = cardinality($3::int[]))`
         : `(cardinality($3::int[]) = 0 OR EXISTS (SELECT 1 FROM post_labels pl WHERE pl.post_id = p.id AND pl.label_id = ANY($3::int[])))`}
       AND ($4::text IS NULL OR to_tsvector('simple',
         coalesce(p.caption, '') || ' ' || coalesce(p.author_handle, '') || ' ' ||
         coalesce(p.author_name, '') || ' ' || coalesce(p.summary, '') || ' ' ||
         coalesce(p.enriched_text, '') || ' ' || coalesce(p.source_url, '') || ' ' || coalesce(p.post_url, '')
       ) @@ websearch_to_tsquery('simple', $4))
     ON CONFLICT DO NOTHING
     RETURNING post_id`,
    [userId, name, sourceLabelIds, searchQuery],
  )
  revalidatePath("/library")
  revalidatePath("/categories")
  revalidatePath("/chat")
  return { ok: true as const, added: result.rows.length }
}

export async function deleteFilteredPosts(input: { labelIds?: number[]; labelMatch?: LabelMatch; searchQuery?: string }) {
  const userId = await requireUserId()
  const labelIds = [...new Set((input.labelIds ?? []).filter((id) => Number.isInteger(id) && id > 0))]
  const labelMatch = input.labelMatch === "all" ? "all" : "any"
  const searchQuery = input.searchQuery?.trim().slice(0, 200) || null
  const labelFilter = labelMatch === "all"
    ? `(cardinality($2::int[]) = 0 OR p.id IN (
        SELECT pl.post_id FROM post_labels pl WHERE pl.label_id = ANY($2::int[])
        GROUP BY pl.post_id HAVING count(DISTINCT pl.label_id) = cardinality($2::int[])
      ))`
    : `(cardinality($2::int[]) = 0 OR p.id IN (
        SELECT pl.post_id FROM post_labels pl WHERE pl.label_id = ANY($2::int[])
      ))`

  const result = await query(
    `DELETE FROM posts p
     WHERE p.user_id = $1
       AND ${labelFilter}
       AND ($3::text IS NULL OR to_tsvector('simple',
         coalesce(p.caption, '') || ' ' || coalesce(p.author_handle, '') || ' ' ||
         coalesce(p.author_name, '') || ' ' || coalesce(p.summary, '') || ' ' ||
         coalesce(p.enriched_text, '') || ' ' || coalesce(p.source_url, '') || ' ' || coalesce(p.post_url, '')
       ) @@ websearch_to_tsquery('simple', $3))
     RETURNING p.id`,
    [userId, labelIds, searchQuery],
  )
  revalidatePath("/library")
  revalidatePath("/categories")
  revalidatePath("/chat")
  return { ok: true as const, deleted: result.rows.length }
}
