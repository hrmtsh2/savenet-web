import { generateText, embed, Output } from "ai"
import { z } from "zod"
import type { Category } from "./types"

const TEXT_MODEL = "google/gemini-2.5-flash"
const EMBEDDING_MODEL = "google/text-embedding-005" // 768 dimensions

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

// classifies posts against the categories provided by the user
// and provides a mining summary
export async function classifyPost(input: {
  caption: string
  scopeText?: string
  categories: Pick<Category, "id" | "name" | "description">[]
}): Promise<ClassificationResult> {
  const categoryList = input.categories
    .map((c) => `- id ${c.id}: ${c.name}${c.description ? ` — ${c.description}` : ""}`)
    .join("\n")

  const { experimental_output } = await generateText({
    model: TEXT_MODEL,
    experimental_output: Output.object({ schema: classificationSchema }),
    system: [
      "You are an assistant that files saved social media posts into categories.",
      "Pick the single best-fitting existing category by id.",
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

// run ocr/visual description of the thumbnail image and return the extracted text
// note: tried extracting thumbnails for ig posts, but wasn't consistent across posts with multiple authors/video posts.
// so this is only relevant for twitter image/video posts.
export async function ocrImage(imageUrl: string): Promise<string> {
  try {
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

// generate embedding for the enriched text
export async function embedText(text: string): Promise<number[]> {
  const { embedding } = await embed({
    model: EMBEDDING_MODEL,
    value: text,
  })
  return embedding
}

export interface ExtractedPlace {
  name: string
  location: string | null
}

const placeSchema = z.object({
  has_place: z.boolean().describe("Whether a specific real-world place is referenced."),
  name: z.string().nullable().describe("The name of the place, e.g. a restaurant or venue."),
  location: z.string().nullable().describe("City, neighborhood, or address details if known."),
})

// extract place name + location from a summary for resolving the exact real world entity (say, a restaurant/shop)
// TODO: since it is Gemini-only for now, look into using Google Places
export async function extractPlace(summary: string): Promise<ExtractedPlace | null> {
  const { experimental_output } = await generateText({
    model: TEXT_MODEL,
    experimental_output: Output.object({ schema: placeSchema }),
    system:
      "Extract the single most relevant real-world place (restaurant, cafe, shop, attraction, venue) referenced in the text. If no specific named place is present, set has_place to false.",
    prompt: summary,
  })

  if (!experimental_output.has_place || !experimental_output.name) return null
  return {
    name: experimental_output.name,
    location: experimental_output.location,
  }
}

// build a deduplication key from the place name and location, and normalise it
export function buildResolutionKey(name: string, location: string | null): string {
  return [name, location ?? ""]
    .join("|")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
}
