import { generateText, embed, Output } from "ai"
import { google } from "@ai-sdk/google"
import { z } from "zod"
import type { Category, EntityEnrichmentData, RecommendationCandidate, MessageRole, FurtherReadingItem } from "./types"

// Call Gemini directly with the user's GOOGLE_GENERATIVE_AI_API_KEY (GCP Tier 1
// prepaid credits) instead of the rate-limited shared AI Gateway.
const TEXT_MODEL = google("gemini-2.5-flash")
const EMBEDDING_MODEL = google.embedding("gemini-embedding-001")
const EMBEDDING_DIMENSIONS = 768 // must match the posts.embedding vector(768) column

/**
 * Tracks how many billable model calls a single operation makes, broken down by
 * type. Pass one meter through an operation (e.g. a capture or a re-sort run)
 * and read the totals afterward so AI usage is transparent to the user.
 */
export interface CallMeter {
  classification: number
  ocr: number
  embedding: number
  placeExtraction: number
  webSearch: number
  synthesis: number
  thumbnailPick: number
}

export function createCallMeter(): CallMeter {
  return {
    classification: 0,
    ocr: 0,
    embedding: 0,
    placeExtraction: 0,
    webSearch: 0,
    synthesis: 0,
    thumbnailPick: 0,
  }
}

export function totalCalls(meter: CallMeter): number {
  return (
    meter.classification +
    meter.ocr +
    meter.embedding +
    meter.placeExtraction +
    meter.webSearch +
    meter.synthesis +
    meter.thumbnailPick
  )
}

export interface ClassificationResult {
  categoryId: number | null
  newCategory: { name: string; description: string } | null
  summary: string
}

const classificationSchema = z.object({
  category_id: z
    .number()
    .nullable()
    .describe("The id of the best-fitting existing category, or null if none fit well."),
  new_category: z
    .object({
      name: z.string(),
      description: z.string(),
    })
    .nullable()
    .describe("A new category to create when no existing category fits well, otherwise null."),
  summary: z
    .string()
    .describe(
      "A description mining both caption and scope text, including place names, locations, or disambiguating details revealed in comments.",
    ),
})

/**
 * Classify a post against the user's categories and produce a mining summary.
 */
export async function classifyPost(
  input: {
    caption: string
    scopeText?: string
    categories: Pick<Category, "id" | "name" | "description">[]
  },
  meter?: CallMeter,
): Promise<ClassificationResult> {
  const categoryList = input.categories
    .map((c) => `- id ${c.id}: ${c.name}${c.description ? ` — ${c.description}` : ""}`)
    .join("\n")

  if (meter) meter.classification += 1
  const { experimental_output } = await generateText({
    model: TEXT_MODEL,
    experimental_output: Output.object({ schema: classificationSchema }),
    system: [
      "You are an assistant that files saved social media posts into categories.",
      "Pick the single best-fitting existing category by id.",
      "Pick the single best-fitting existing category by id. Be generous with existing categories — prefer fitting a post into an existing one even if the fit is imperfect.",
      "Only propose a new_category if the post absolutely cannot be reasonably placed in ANY existing category. A post about a specific niche topic should still go into a broad existing category rather than spawning a new one, unless no existing category can be applicable.",
      "If none of the existing categories fit well, return null for category_id and propose a new_category with a concise name and a short description.",
      "If an existing category fits, return its id and set new_category to null.",
      "Always produce a 'summary': a useful description mining BOTH the caption and the scope text (which may include comments).",
      "Include place names, locations, or disambiguating details revealed in comments.",
      "Ignore UI chrome such as like-counts, 'Reply', 'View replies', 'Translate', timestamps, and follower counts.",
    ].join(" "),
    prompt: [
      "Existing categories:",
      categoryList || "(none)",
      "",
      `Caption:\n${input.caption || "(empty)"}`,
      input.scopeText ? `\nScope text (may include comments):\n${input.scopeText}` : "",
    ].join("\n"),
  })

  return {
    categoryId: experimental_output.category_id,
    newCategory: experimental_output.new_category,
    summary: experimental_output.summary,
  }
}

/**
 * Run OCR / visual description on a thumbnail image and return extracted text.
 */
export async function ocrImage(imageUrl: string, meter?: CallMeter): Promise<string> {
  try {
    if (meter) meter.ocr += 1
    const { text } = await generateText({
      model: TEXT_MODEL,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Extract all readable text from this image and briefly describe any meaningful visual content (places, products, signage). Return plain text only. If there is nothing useful, return an empty string.",
            },
            { type: "image", image: new URL(imageUrl) },
          ],
        },
      ],
    })
    return text.trim()
  } catch (err) {
    console.log("[v0] ocrImage failed:", (err as Error).message)
    return ""
  }
}

/**
 * Generate an embedding for the enriched text.
 */
export async function embedText(text: string, meter?: CallMeter): Promise<number[]> {
  if (meter) meter.embedding += 1
  const { embedding } = await embed({
    model: EMBEDDING_MODEL,
    value: text,
    providerOptions: {
      google: { outputDimensionality: EMBEDDING_DIMENSIONS },
    },
  })
  return embedding
}

export interface ExtractedEntity {
  name: string
  /** Location/disambiguator: city for a place, league for a team, etc. May be null. */
  location: string | null
  /** Inferred kind, e.g. place, sports_team, person, product, organization, work. */
  entityType: string
}

const entitySchema = z.object({
  has_entity: z.boolean().describe("Whether a specific, named primary entity is referenced."),
  name: z
    .string()
    .nullable()
    .describe("The canonical name of the single most relevant entity, e.g. 'Arsenal F.C.' or 'La Carnitaria'."),
  entity_type: z
    .string()
    .nullable()
    .describe(
      "A short snake_case type for the entity inferred from the category context, e.g. place, sports_team, person, product, organization, work, event.",
    ),
  location: z
    .string()
    .nullable()
    .describe(
      "A disambiguating qualifier: city/neighborhood for a place, league/sport for a team, role/field for a person. Null if not applicable.",
    ),
})

/**
 * Extract the single most relevant entity from a summary for entity resolution.
 * The KIND of entity to look for is inferred from the owning category, so a
 * "Sports News" post can resolve a team or athlete while a "Food & Travel" post
 * resolves a restaurant. Gemini-only resolution (no external lookup yet).
 */
export async function extractEntity(
  input: { summary: string; categoryName: string; categoryDescription?: string | null },
  meter?: CallMeter,
): Promise<ExtractedEntity | null> {
  if (meter) meter.placeExtraction += 1
  const { experimental_output } = await generateText({
    model: TEXT_MODEL,
    experimental_output: Output.object({ schema: entitySchema }),
    system: [
      "Extract the single most relevant named entity referenced in the text, for grouping related saved posts.",
      "First infer what KINDS of entities matter for this category from its name and description, then extract one.",
      "Examples by category: a food/travel category → a specific place (restaurant, cafe, venue); a sports category → a team, athlete, or competition; a tech/news category → a company, product, or person; a books/film category → a specific work or creator.",
      "Choose a concise snake_case entity_type that fits what you found (e.g. place, sports_team, person, product, organization, work, event).",
      "Set has_entity to false only when no specific named entity is present (e.g. a generic tip with no subject).",
    ].join(" "),
    prompt: [
      `Category: ${input.categoryName}${input.categoryDescription ? ` — ${input.categoryDescription}` : ""}`,
      "",
      `Post summary:\n${input.summary}`,
    ].join("\n"),
  })

  if (!experimental_output.has_entity || !experimental_output.name) return null
  return {
    name: experimental_output.name,
    location: experimental_output.location,
    entityType: experimental_output.entity_type || "other",
  }
}

/**
 * Build a normalized dedup key from an entity's type + name + location, so
 * entities of different kinds (a team vs a place) never collide on name alone.
 */
export function buildResolutionKey(entityType: string, name: string, location: string | null): string {
  return [entityType, name, location ?? ""]
    .join("|")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
}

/* ------------------------------------------------------------------ */
/* Thumbnail resolution                                                */
/* ------------------------------------------------------------------ */

const thumbnailSchema = z.object({
  best_image_url: z
    .string()
    .nullable()
    .describe("The single best URL representing the post's main visual, or null if none of the candidates qualify."),
  reason: z.string().describe("Brief reason for the choice (for debugging)."),
})

/**
 * Pick the most representative thumbnail from a list of candidate image URLs the
 * extension scraped out of the post DOM. Instagram makes this hard (multiple
 * authors, carousels, video posters), so we let Gemini reason over the candidates
 * plus hints rather than relying on brittle positional DOM logic.
 *
 * This does NOT fetch the images — it only reasons over URLs + hints, so it's a
 * cheap text call. Returns a chosen URL (one of the candidates) or null.
 */
export async function pickThumbnail(
  input: {
    candidates: string[]
    caption?: string
    authorHandles?: string[]
    mediaType?: string | null
  },
  meter?: CallMeter,
): Promise<string | null> {
  const candidates = (input.candidates ?? []).filter((u) => typeof u === "string" && /^https?:\/\//i.test(u))
  if (candidates.length === 0) return null
  if (candidates.length === 1) return candidates[0]

  try {
    if (meter) meter.thumbnailPick += 1
    const { experimental_output } = await generateText({
      model: TEXT_MODEL,
      experimental_output: Output.object({ schema: thumbnailSchema }),
      system: [
        "You are choosing the main thumbnail image for a saved social media post from a list of candidate image URLs scraped from the post's HTML.",
        "Prefer the primary post media (the photo, or the first slide of a carousel, or a video's poster frame).",
        "AVOID profile/avatar images of the author(s), follower/suggested-user avatars, sprites, emoji, icons, and tracking pixels.",
        "Heuristics: profile pictures are often small/square and contain the author handle in the URL path; main media URLs are usually larger content-delivery URLs.",
        "You MUST return one of the provided candidate URLs verbatim, or null if every candidate looks like an avatar/icon rather than post media.",
      ].join(" "),
      prompt: [
        input.caption ? `Caption: ${input.caption}` : "",
        input.mediaType ? `Media type hint: ${input.mediaType}` : "",
        input.authorHandles?.length ? `Author handle(s) (likely appear in avatar URLs): ${input.authorHandles.join(", ")}` : "",
        "",
        "Candidate image URLs:",
        ...candidates.map((u, i) => `${i + 1}. ${u}`),
      ]
        .filter(Boolean)
        .join("\n"),
    })

    const chosen = experimental_output.best_image_url
    // Only trust a choice that is actually one of the candidates.
    if (chosen && candidates.includes(chosen)) return chosen
    return null
  } catch (err) {
    console.log("[v0] pickThumbnail failed:", (err as Error).message)
    // Fall back to the first candidate so we at least show something.
    return candidates[0]
  }
}

const entityImageSchema = z.object({
  image_url: z
    .string()
    .nullable()
    .describe("A direct, publicly accessible image URL (ending in .jpg/.jpeg/.png/.webp) for the place, or null."),
})

/**
 * Best-effort fallback: when a post has no usable thumbnail, ask Gemini (with
 * Google Search grounding) to find a representative public image URL for the
 * resolved entity/place. This is unreliable by nature — the model may not find
 * a direct image file — so callers MUST treat null as "no image" and render a
 * placeholder instead.
 */
export async function findEntityImage(
  name: string,
  location: string | null,
  meter?: CallMeter,
): Promise<string | null> {
  const where = location ? `${name} (${location})` : name
  try {
    if (meter) meter.webSearch += 1
    const { text } = await generateText({
      model: TEXT_MODEL,
      tools: { google_search: google.tools.googleSearch({}) },
      system:
        "You find a single representative, publicly accessible image for a real-world place using web search. " +
        "Return ONLY a direct image URL that ends in .jpg, .jpeg, .png, or .webp on a publicly accessible host. " +
        "Do not return a webpage URL, a search page, or anything that requires login. " +
        "If you cannot find a direct image URL, reply with exactly: NONE",
      prompt: `Find one representative photo for: ${where}`,
    })

    const match = text.match(/https?:\/\/\S+\.(?:jpg|jpeg|png|webp)(?:\?\S+)?/i)
    return match ? match[0] : null
  } catch (err) {
    console.log("[v0] findEntityImage failed:", (err as Error).message)
    return null
  }
}

/* ------------------------------------------------------------------ */
/* Chat recommendation AI                                              */
/* ------------------------------------------------------------------ */

/**
 * Use Gemini with Google Search grounding to look up current, real-world info
 * about a place: price range, must-try items, and review sentiment. Returns a
 * structured payload (fields may be null when not found). Grounding tools can't
 * be combined with structured output, so we parse the model's plain-text reply.
 */
export async function enrichEntityWeb(
  name: string,
  location: string | null,
  meter?: CallMeter,
): Promise<EntityEnrichmentData> {
  if (meter) meter.webSearch += 1
  const where = location ? `${name} (${location})` : name
  try {
    const { text } = await generateText({
      model: TEXT_MODEL,
      tools: { google_search: google.tools.googleSearch({}) },
      system:
        "You research real-world places using live web search. Be concise and factual. " +
        "Reply using EXACTLY these four labeled lines and nothing else:\n" +
        "PRICE: <typical price range or 'unknown'>\n" +
        "MUSTTRY: <comma-separated standout items/dishes or 'unknown'>\n" +
        "SENTIMENT: <one short sentence on overall review sentiment>\n" +
        "NOTES: <one short line of any other useful current detail or 'none'>",
      prompt: `Look up current information about: ${where}`,
    })

    const pick = (label: string): string | null => {
      const m = text.match(new RegExp(`^${label}:\\s*(.+)$`, "im"))
      const v = m?.[1]?.trim()
      if (!v || /^(unknown|none|n\/a)$/i.test(v)) return null
      return v
    }

    return {
      priceRange: pick("PRICE"),
      mustTry: pick("MUSTTRY"),
      sentiment: pick("SENTIMENT"),
      notes: pick("NOTES"),
    }
  } catch (err) {
    console.log("[v0] enrichEntityWeb failed:", (err as Error).message)
    return { priceRange: null, mustTry: null, sentiment: null, notes: null }
  }
}

/**
 * Extract URLs from caption/tweet text.
 */
export function extractUrls(text: string): string[] {
  const urlRegex = /https?:\/\/[^\s"<>]+/g
  const matches = text.match(urlRegex) || []
  // Deduplicate and filter out obviously useless URLs (Instagram/X own domains)
  return [...new Set(matches)].filter(
    (url) =>
      !url.includes("instagram.com") &&
      !url.includes("x.com") &&
      !url.includes("twitter.com") &&
      !url.includes("t.co/") === false // keep t.co since those are real shortened links
  )
}

const urlExtractionSchema = z.object({
  title: z.string().nullable().describe("Page title or article headline"),
  snippet: z.string().nullable().describe("A 1-2 sentence summary of the page content"),
  extracted_data: z
    .record(z.string(), z.string().nullable())
    .nullable()
    .describe(
      "Structured key-value pairs relevant to the category. " +
      "For restaurants/food: { price, menuHighlights, cuisine, location }. " +
      "For articles/papers: { keyPoints, authors, publishedDate }. " +
      "For products: { price, availability, rating, seller }. " +
      "Only include keys that have actual values."
    ),
})

/**
 * Visit a URL and extract structured information relevant to the post's category.
 */
export async function fetchAndExtractUrl(
  url: string,
  categoryName: string,
  categoryDescription: string | null,
  meter?: CallMeter,
): Promise<FurtherReadingItem | null> {
  if (meter) meter.webSearch += 1
  try {
    const { experimental_output } = await generateText({
      model: TEXT_MODEL,
      experimental_output: Output.object({ schema: urlExtractionSchema }),
      system: [
        `You are extracting useful information from a webpage for a user's "${categoryName}" saved post collection.`,
        categoryDescription ? `Category description: ${categoryDescription}` : "",
        "Visit the provided URL and extract the title, a brief summary, and any structured data relevant to this category.",
        "For food/restaurant pages: extract price range, menu highlights, cuisine type, location.",
        "For articles/papers/tutorials: extract key points, authors, publication date.",
        "For product pages: extract price, availability, rating, seller.",
        "If the page is inaccessible or has no useful content, return null for all fields.",
      ].filter(Boolean).join(" "),
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: `Please visit and extract information from this URL: ${url}` },
          ],
        },
      ],
    })

    if (!experimental_output.title && !experimental_output.snippet) return null

    return {
      url,
      title: experimental_output.title,
      snippet: experimental_output.snippet,
      extractedData: experimental_output.extracted_data as Record<string, string | null> | null,
    }
  } catch (err) {
    console.log("[ai] fetchAndExtractUrl failed for", url, (err as Error).message)
    return null
  }
}

export interface SynthesisResult {
  reply: string
  citedPostIds: number[]
}

/**
 * Synthesize a recommendation from the candidate saved posts. The model must
 * recommend ONLY from the provided candidates, explain the fit, and cite each
 * recommendation's source post id. Returns the reply plus the ids actually cited.
 */
export async function synthesizeRecommendation(
  input: {
    history: { role: MessageRole; content: string }[]
    candidates: RecommendationCandidate[]
    userMessage: string
    categoryName: string
  },
  meter?: CallMeter,
): Promise<SynthesisResult> {
  if (meter) meter.synthesis += 1

  const candidateBlocks = input.candidates
    .map((c) => {
      const label = c.entity_name || c.summary?.slice(0, 60) || `Post ${c.id}`
      const lines = [
        `[POST_REF:${c.id}] ${label} [${c.platform}]`,
        c.captured_at ? `Saved on: ${new Date(c.captured_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}` : "",
        c.summary ? `Summary: ${c.summary}` : c.enriched_text ? `Details: ${c.enriched_text}` : "",
        c.entity_name ? `Place: ${c.entity_name}${c.entity_location ? `, ${c.entity_location}` : ""}` : "",
      ]
      if (c.enrichment) {
        if (c.enrichment.priceRange) lines.push(`Live price: ${c.enrichment.priceRange}`)
        if (c.enrichment.mustTry) lines.push(`Must-try: ${c.enrichment.mustTry}`)
        if (c.enrichment.sentiment) lines.push(`Reviews: ${c.enrichment.sentiment}`)
        if (c.enrichment.notes) lines.push(`Note: ${c.enrichment.notes}`)
      }
      if (c.further_reading && c.further_reading.length > 0) {
        lines.push("Further reading:")
        for (const item of c.further_reading) {
          const dataStr = item.extractedData
            ? Object.entries(item.extractedData)
                .filter(([, v]) => v)
                .map(([k, v]) => `${k}: ${v}`)
                .join(", ")
            : ""
          lines.push(
            `  - ${item.title || item.url}${item.snippet ? `: ${item.snippet}` : ""}${dataStr ? ` (${dataStr})` : ""} → ${item.url}`
          )
        }
      }
      return lines.filter(Boolean).join("\n")
    })
    .join("\n\n")

  const historyText = input.history
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
    .join("\n")

  const result = await generateText({
    model: TEXT_MODEL,
    experimental_output: Output.object({
      schema: z.object({
        reply: z
          .string()
          .describe(
            "A helpful, conversational recommendation written in markdown. " +
            "Refer to places and posts by their name or description — do NOT include raw post IDs or [#number] citations in the reply text. " +
            "The reply should read naturally, as if written by a knowledgeable friend."
          ),
        cited_post_ids: z
          .array(z.number())
          .describe(
            "The POST_REF ids of ONLY the posts you explicitly recommended or directly referenced in your reply. " +
            "Do NOT include posts you merely considered or rejected. " +
            "Only include an id if the corresponding place/post is clearly mentioned in your reply text."
          ),
      }),
    }),
    system: [
      `You are SaveNet's recommendation assistant for the user's "${input.categoryName}" saved posts.`,
      "Recommend ONLY from the candidate posts provided below — each is tagged with [POST_REF:<id>] for your reference.",
      "When a candidate has 'Further reading' links with extracted data (menus, prices, product details), use that data to answer specific questions like 'what's cheapest' or 'what's on the menu'. Surface the relevant links in your reply.",
      "Never invent options that are not among the candidates.",
      "If none of the candidates fit the user's request, say so honestly rather than making something up.",
      "For each recommendation, explain WHY it fits the user's stated preferences.",
      "Do NOT include raw post IDs or [#number] tags in your reply — write naturally using place/post names.",
      "Prefer candidates with live web data when relevant (price, must-try, reviews). Keep the tone friendly and concise.",
      "In cited_post_ids, include ONLY the POST_REF ids of posts you explicitly recommended in the reply — not ones you considered and skipped.",
    ].join(" "),
    prompt: [
      historyText ? `Conversation so far:\n${historyText}\n` : "",
      `Candidate saved posts:\n${candidateBlocks || "(none)"}\n`,
      `User's latest message:\n${input.userMessage}`,
    ].join("\n"),
  })

  const out = result.experimental_output
  const validIds = new Set(input.candidates.map((c) => c.id))
  const citedPostIds = (out.cited_post_ids ?? []).filter((id) => validIds.has(id))
  return { reply: out.reply, citedPostIds }
}

/** Short helper to title a new conversation from the user's first message. */
export function deriveConversationTitle(message: string): string {
  const trimmed = message.trim().replace(/\s+/g, " ")
  if (trimmed.length <= 60) return trimmed
  return trimmed.slice(0, 57) + "…"
}
