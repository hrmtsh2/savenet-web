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
    [key: string]: unknown
  }
}
