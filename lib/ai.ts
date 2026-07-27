import { embed, generateText, Output } from "ai"
import { google } from "@ai-sdk/google"
import { z } from "zod"
import { finishAiRun, resolveTextModel, startAiRun } from "@/lib/ai-settings"
import type { MessageRole, RecommendationCandidate } from "@/lib/types"

const defaultTextModel = google("gemini-2.5-flash")
const defaultEmbeddingModel = google.embedding("gemini-embedding-001")
const defaultEmbeddingDimensions = 768

export interface CallMeter {
  ocr: number
  embedding: number
  synthesis: number
  thumbnailPick: number
}

export function createCallMeter(): CallMeter {
  return { ocr: 0, embedding: 0, synthesis: 0, thumbnailPick: 0 }
}

export function totalCalls(meter: CallMeter): number {
  return meter.ocr + meter.embedding + meter.synthesis + meter.thumbnailPick
}

export async function ocrImage(imageUrl: string, meter?: CallMeter): Promise<string> {
  try {
    if (meter) meter.ocr += 1
    const { text } = await generateText({
      model: defaultTextModel,
      messages: [{
        role: "user",
        content: [
          { type: "text", text: "Extract readable text (if any), and describe meaningful visual content in brief. Return plain text only." },
          { type: "image", image: new URL(imageUrl) },
        ],
      }],
    })
    return text.trim()
  } catch (error) {
    console.log("[savenet] OCR failed:", (error as Error).message)
    return ""
  }
}

export async function embedText(text: string, meter?: CallMeter): Promise<number[]> {
  if (meter) meter.embedding += 1
  const { embedding } = await embed({
    model: defaultEmbeddingModel,
    value: text,
    providerOptions: { google: { outputDimensionality: defaultEmbeddingDimensions } },
  })
  return embedding
}

const thumbnailSchema = z.object({ best_image_url: z.string().nullable() })

export async function pickThumbnail(
  input: { candidates: string[]; caption?: string; authorHandles?: string[]; mediaType?: string | null },
  meter?: CallMeter,
): Promise<string | null> {
  const candidates = input.candidates.filter((url) => /^https?:\/\//i.test(url))
  if (candidates.length === 0) return null
  if (candidates.length === 1) return candidates[0]
  try {
    if (meter) meter.thumbnailPick += 1
    const { experimental_output } = await generateText({
      model: defaultTextModel,
      experimental_output: Output.object({ schema: thumbnailSchema }),
      system: "Choose the primary post media from the supplied URLs. Avoid profile images, icons, sprites, emoji, and tracking pixels. Return a supplied URL or null.",
      prompt: [
        input.caption ? `Caption: ${input.caption}` : "",
        input.mediaType ? `Media type: ${input.mediaType}` : "",
        input.authorHandles?.length ? `Author handles: ${input.authorHandles.join(", ")}` : "",
        "Candidate image URLs:",
        ...candidates.map((url, index) => `${index + 1}. ${url}`),
      ].filter(Boolean).join("\n"),
    })
    return experimental_output.best_image_url && candidates.includes(experimental_output.best_image_url)
      ? experimental_output.best_image_url
      : null
  } catch (error) {
    console.log("[savenet] thumbnail selection failed:", (error as Error).message)
    return candidates[0]
  }
}

export interface SynthesisResult {
  reply: string
  citedPostIds: number[]
}

export async function synthesizeRecommendation(
  input: {
    userId: string
    history: { role: MessageRole; content: string }[]
    candidates: RecommendationCandidate[]
    userMessage: string
    categoryName: string
  },
  meter?: CallMeter,
): Promise<SynthesisResult> {
  if (meter) meter.synthesis += 1
  const candidateBlocks = input.candidates.map((candidate) => {
    const lines = [
      `[POST_REF:${candidate.id}] ${candidate.entity_name || candidate.summary?.slice(0, 60) || `Post ${candidate.id}`} [${candidate.platform}]`,
      candidate.captured_at ? `Saved on: ${new Date(candidate.captured_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}` : "",
      candidate.summary ? `Summary: ${candidate.summary}` : candidate.enriched_text ? `Details: ${candidate.enriched_text}` : "",
      candidate.entity_name ? `Entity: ${candidate.entity_name}${candidate.entity_location ? `, ${candidate.entity_location}` : ""}` : "",
    ]
    if (candidate.further_reading?.length) {
      lines.push("Further reading:")
      for (const item of candidate.further_reading) lines.push(`- ${item.title || item.url}: ${item.url}`)
    }
    return lines.filter(Boolean).join("\n")
  }).join("\n\n")
  const historyText = input.history.map((message) => `${message.role === "user" ? "User" : "Assistant"}: ${message.content}`).join("\n")
  const selectedModel = await resolveTextModel(input.userId, "chat")
  const startedAt = Date.now()
  const runId = await startAiRun({ userId: input.userId, feature: "chat", provider: selectedModel.provider, modelId: selectedModel.model_id, credentialSource: selectedModel.credential_source })

  try {
    const result = await generateText({
      model: selectedModel.model,
      experimental_output: Output.object({
        schema: z.object({
          reply: z.string().describe("A concise, helpful markdown reply. Do not include raw post IDs or citation markers."),
          cited_post_ids: z.array(z.number()).describe("Only POST_REF IDs directly mentioned in the reply."),
        }),
      }),
      system: [
        `You are SaveNet's recommendation assistant for the user's "${input.categoryName}" saved posts.`, 
        "Recommend only from the supplied candidates. Never invent options.",
        "Explain why each recommendation fits. If none fit, say so clearly.",
        "Use further-reading links when relevant, but do not include raw post IDs in the reply."
      ].join(" "),
      prompt: [historyText ? `Conversation so far:\n${historyText}\n` : "", `Candidate saved posts:\n${candidateBlocks || "(none)"}\n`, `User's latest message:\n${input.userMessage}`].join("\n"),
    })
    await finishAiRun({ id: runId, status: "succeeded", startedAt, usage: result.usage })
    const validIds = new Set(input.candidates.map((candidate) => candidate.id))
    return { reply: result.experimental_output.reply, citedPostIds: result.experimental_output.cited_post_ids.filter((id) => validIds.has(id)) }
  } catch (error) {
    await finishAiRun({ id: runId, status: "failed", startedAt, error })
    throw error
  }
}

export function deriveConversationTitle(message: string): string {
  const trimmed = message.trim().replace(/\s+/g, " ")
  return trimmed.length <= 60 ? trimmed : `${trimmed.slice(0, 57)}…`
}
