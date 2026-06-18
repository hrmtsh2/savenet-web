export type Platform = "instagram" | "x"

export interface Category {
  id: number
  user_id: string
  name: string
  description: string | null
  enable_entity_resolution: boolean
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
  created_at: string
  updated_at: string
}

// Post joined with category + entity details for display
export interface PostWithRelations extends Post {
  category_name: string | null
  entity_name: string | null
  entity_location: string | null
}

export interface CategoryWithCount extends Category {
  post_count: number
}

export type MessageRole = "user" | "assistant"

export interface Conversation {
  id: number
  user_id: string
  category_id: number | null
  title: string | null
  created_at: string
}

export interface ConversationListItem {
  id: number
  title: string | null
  category_id: number | null
  category_name: string | null
  created_at: string
}

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

// Cached web-search enrichment payload for an entity
export interface EntityEnrichmentData {
  priceRange: string | null
  mustTry: string | null
  sentiment: string | null
  notes: string | null
}

// A candidate post pulled from the vector search, with optional enrichment
export interface RecommendationCandidate {
  id: number
  post_url: string
  thumbnail_url: string | null
  summary: string | null
  enriched_text: string | null
  platform: Platform
  entity_id: number | null
  entity_name: string | null
  entity_location: string | null
  distance: number
  enrichment?: EntityEnrichmentData | null
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
  raw?: {
    permalink?: string
    scopeText?: string
    tweetTimestamp?: string
    /**
     * Optional list of image URLs scraped from the post DOM. When thumbnailUrl
     * is not provided (common for Instagram), the server asks Gemini to pick the
     * best main thumbnail from these candidates at ingest time.
     */
    candidateImages?: string[]
    [key: string]: unknown
  }
}
