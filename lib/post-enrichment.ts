import { google } from "@ai-sdk/google"
import { generateText, Output } from "ai"
import { z } from "zod"
import { query, toVectorLiteral } from "@/lib/db"
import { embedText } from "@/lib/ai"
import { finishAiRun, resolveTextModel, startAiRun } from "@/lib/ai-settings"

const enrichmentSchema = z.object({
  entities: z.array(z.object({
    name: z.string(),
    type: z.string().nullable(),
    location: z.string().nullable(),
    details: z.record(z.string(), z.string()).default({}),
  })),
  research_summary: z.string().nullable(),
})

type EnrichmentJob = {
  post_id: number
  user_id: string
  caption: string | null
  summary: string | null
  enriched_text: string | null
  post_url: string
}

async function claimJob(): Promise<EnrichmentJob | null> {
  const { rows } = await query<EnrichmentJob>(
    `WITH next_job AS (
       SELECT post_id
       FROM post_enrichment_jobs
       WHERE status = 'queued'
       ORDER BY updated_at, post_id
       LIMIT 1
       FOR UPDATE SKIP LOCKED
     ), claimed AS (
       UPDATE post_enrichment_jobs job
       SET status = 'running', updated_at = now()
       FROM next_job
       WHERE job.post_id = next_job.post_id
       RETURNING job.post_id, job.user_id
     )
     SELECT claimed.post_id, claimed.user_id, post.caption, post.summary,
            post.enriched_text, post.post_url
     FROM claimed
     JOIN posts post ON post.id = claimed.post_id`,
  )
  return rows[0] ?? null
}

export async function processNextPostEnrichment() {
  const job = await claimJob()
  if (!job) return { processed: false as const }

  let telemetryId: number | null = null
  const startedAt = Date.now()
  try {
    const model = await resolveTextModel(job.user_id, "chat")
    telemetryId = await startAiRun({
      userId: job.user_id,
      feature: "entity_agent",
      provider: model.provider,
      modelId: model.model_id,
      credentialSource: model.credential_source,
    })
    const result = await generateText({
      model: model.model,
      tools: { google_search: google.tools.googleSearch({}) },
      experimental_output: Output.object({ schema: enrichmentSchema }),
      system: [
        "Extract real-world entities and useful structured facts from the saved post.",
        "Use Google Search to verify or enrich entities when the post identifies a real-world place, book, movie, research paper, product, event, or similar subject.",
        "Prefer authoritative sources. Do not invent facts. Return an empty entity list when no useful entity is present.",
      ].join(" "),
      prompt: [
        job.caption ? `Caption:\n${job.caption}` : "",
        job.summary ? `Summary:\n${job.summary}` : "",
        job.enriched_text ? `Captured context:\n${job.enriched_text}` : "",
        `Original post: ${job.post_url}`,
      ].filter(Boolean).join("\n\n"),
    })
    const output = result.experimental_output
    const entityText = output.entities.length
      ? `Entities:\n${output.entities.map((entity) => {
          const details = Object.entries(entity.details).map(([key, value]) => `${key}: ${value}`).join(", ")
          return `- ${entity.name}${entity.type ? ` (${entity.type})` : ""}${entity.location ? `, ${entity.location}` : ""}${details ? ` — ${details}` : ""}`
        }).join("\n")}`
      : ""
    const researchText = output.research_summary ? `Research:\n${output.research_summary}` : ""
    const sources = result.sources
      .filter((source) => source.sourceType === "url")
      .map((source) => ({ title: source.title || null, url: source.url }))
      .slice(0, 8)
    const sourceText = sources.length ? `Further reading:\n${sources.map((source) => `- ${source.title || source.url}: ${source.url}`).join("\n")}` : ""
    const consolidatedText = [job.enriched_text, entityText, researchText, sourceText].filter(Boolean).join("\n\n")
    const embedding = await embedText(consolidatedText)
    await query(
      `UPDATE posts
       SET enriched_text = $1, embedding = $2::vector, further_reading = $3::jsonb, updated_at = now()
       WHERE id = $4 AND user_id = $5`,
      [consolidatedText, toVectorLiteral(embedding), JSON.stringify(sources.map((source) => ({ ...source, snippet: null, extractedData: null }))), job.post_id, job.user_id],
    )
    await query(
      "UPDATE post_enrichment_jobs SET status = 'succeeded', completed_at = now(), updated_at = now() WHERE post_id = $1",
      [job.post_id],
    )
    await finishAiRun({ id: telemetryId, status: "succeeded", startedAt, usage: result.usage })
    return { processed: true as const, postId: job.post_id }
  } catch (error) {
    if (telemetryId) await finishAiRun({ id: telemetryId, status: "failed", startedAt, error })
    await query(
      "UPDATE post_enrichment_jobs SET status = 'failed', error_message = $2, updated_at = now() WHERE post_id = $1",
      [job.post_id, error instanceof Error ? error.message.slice(0, 500) : "Enrichment failed"],
    )
    return { processed: true as const, postId: job.post_id, failed: true as const }
  }
}
