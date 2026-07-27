export type Platform = "instagram" | "x" | "browser_bookmark" | "reading_list"

export interface Category {
  id: number
  user_id: string
  name: string
  description: string | null
  enable_entity_resolution: boolean
  enable_web_enrichment: boolean
  auto_created: boolean
  created_at: string
}

export interface Entity {
  id: number
  place_id: string | null
  resolution_key: string
  name: string
  location: string | null
  resolved_at: string
}

export interface FurtherReadingItem {
  url: string
  title: string | null
  snippet: string | null
  extractedData: Record<string, string | null> | null
  // e.g. { price: "₹450", menuHighlights: "Biryani, Kebab" }
}

export interface Post {
  id: number
  user_id: string
  platform: Platform
  platform_post_id: string | null
  post_url: string
  caption: string | null
  author_handle: string | null
  author_name: string | null
  thumbnail_url: string | null
  media_type: string | null
  captured_at: string | null
  source_url: string | null
  raw: Record<string, unknown> | null
  category_id: number | null
  summary: string | null
  enriched_text: string | null
  entity_id: number | null
  further_reading: FurtherReadingItem[] | null
  created_at: string
  updated_at: string
}

// Post joined with category + entity details for display
export interface PostWithRelations extends Post {
  category_name: string | null
  labels: Label[]
  entity_name: string | null
  entity_location: string | null
}

/** A label is stored in the legacy `categories` table during the transition. */
export interface Label {
  id: number
  name: string
  system: boolean
}

export interface CategoryWithCount extends Category {
  post_count: number
}

export type MessageRole = "user" | "assistant"

export interface Conversation {
  id: number
  user_id: string
  category_id: number | null
  label_ids: number[]
  label_match: LabelMatch
  title: string | null
  created_at: string
}

export interface ConversationListItem {
  id: number
  title: string | null
  category_id: number | null
  label_ids: number[]
  label_match: LabelMatch
  category_name: string | null
  created_at: string
}

export type LabelMatch = "any" | "all"

export interface Message {
  id: number
  conversation_id: number
  role: MessageRole
  content: string
  referenced_post_ids: number[]
  created_at: string
}

// A post returned to the client alongside an assistant reply
export interface ReferencedPost {
  id: number
  postUrl: string
  thumbnailUrl: string | null
  summary: string | null
  platform: Platform
}

// A candidate post pulled from the vector search
export interface RecommendationCandidate {
  id: number
  post_url: string
  thumbnail_url: string | null
  summary: string | null
  enriched_text: string | null
  platform: Platform
  captured_at: string | null
  further_reading: FurtherReadingItem[] | null
  entity_id: number | null
  entity_name: string | null
  entity_location: string | null
  distance: number
}

// Shape of the capture endpoint request body
export interface CapturePayload {
  platform: Platform
  platformPostId?: string
  postUrl: string
  caption?: string
  authorHandle?: string
  authorName?: string
  thumbnailUrl?: string
  mediaType?: string
  capturedAt?: string
  sourceUrl?: string
  labelIds?: number[]
  raw?: {
    permalink?: string
    scopeText?: string
    tweetTimestamp?: string
    candidateImages?: string[]
    [key: string]: unknown
  }
}
