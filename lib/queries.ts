import { query, toVectorLiteral } from "./db"
import type {
  Category,
  CategoryWithCount,
  PostWithRelations,
  Conversation,
  ConversationListItem,
  Message,
  RecommendationCandidate,
  EntityEnrichmentData,
} from "./types"

const DEFAULT_CATEGORIES: Array<Pick<Category, "name" | "description" | "enable_entity_resolution" | "enable_web_enrichment">> = [
  {
    name: "Food & Travel",
    description: "restaurants, cafes, travel spots, things to visit or eat",
    enable_entity_resolution: true,
    enable_web_enrichment: true,
  },
  {
    name: "Resources",
    description: "tutorials, tools, discounts, learning material",
    enable_entity_resolution: false,
    enable_web_enrichment: true,
  },
  {
    name: "Media",
    description: "movie/book/album/show recommendations",
    enable_entity_resolution: false,
    enable_web_enrichment: true
  },
  {
    name: "Other",
    description: null as unknown as string,
    enable_entity_resolution: false,
    enable_web_enrichment: true
  },
]

/** Ensure the user has their seed categories. Idempotent. */
export async function ensureSeedCategories(userId: string): Promise<void> {
  const { rows } = await query<{ count: string }>("SELECT count(*)::text AS count FROM categories WHERE user_id = $1", [
    userId,
  ])
  if (Number(rows[0]?.count ?? "0") > 0) return

  for (const c of DEFAULT_CATEGORIES) {
    await query(
      `INSERT INTO categories (user_id, name, description, enable_entity_resolution, enable_web_enrichment, auto_created)
       VALUES ($1, $2, $3, $4, $5, false)
       ON CONFLICT (user_id, lower(name)) DO NOTHING`,
      [userId, c.name, c.description ?? null, c.enable_entity_resolution, c.enable_web_enrichment],
    )
  }
}

export async function getCategories(userId: string): Promise<Category[]> {
  const { rows } = await query<Category>(
    `SELECT id, user_id, name, description, enable_entity_resolution, auto_created, created_at
     FROM categories WHERE user_id = $1 ORDER BY created_at ASC, id ASC`,
    [userId],
  )
  return rows
}

export async function getCategoriesWithCounts(userId: string): Promise<CategoryWithCount[]> {
  const { rows } = await query<CategoryWithCount>(
    `SELECT c.id, c.user_id, c.name, c.description, c.enable_entity_resolution, c.auto_created, c.created_at,
            count(p.id)::int AS post_count
     FROM categories c
     LEFT JOIN posts p ON p.category_id = c.id AND p.user_id = c.user_id
     WHERE c.user_id = $1
     GROUP BY c.id
     ORDER BY c.created_at ASC, c.id ASC`,
    [userId],
  )
  return rows
}

export async function getUncategorizedCount(userId: string): Promise<number> {
  const { rows } = await query<{ count: string }>(
    "SELECT count(*)::text AS count FROM posts WHERE user_id = $1 AND category_id IS NULL",
    [userId],
  )
  return Number(rows[0]?.count ?? "0")
}

export async function getPostsForUser(userId: string): Promise<PostWithRelations[]> {
  const { rows } = await query<PostWithRelations>(
    `SELECT p.id, p.user_id, p.platform, p.platform_post_id, p.post_url, p.caption,
            p.author_handle, p.author_name, p.thumbnail_url, p.media_type, p.captured_at,
            p.further_reading, p.source_url, p.raw, p.category_id, p.summary, p.enriched_text, p.entity_id,
            p.created_at, p.updated_at,
            c.name AS category_name,
            e.name AS entity_name, e.location AS entity_location
     FROM posts p
     LEFT JOIN categories c ON c.id = p.category_id
     LEFT JOIN entities e ON e.id = p.entity_id
     WHERE p.user_id = $1
     ORDER BY p.created_at DESC, p.id DESC`,
    [userId],
  )
  return rows
}

/* ------------------------------------------------------------------ */
/* Chat / recommendation queries                                       */
/* ------------------------------------------------------------------ */

export async function createConversation(
  userId: string,
  categoryId: number,
  title: string | null,
): Promise<Conversation> {
  const { rows } = await query<Conversation>(
    `INSERT INTO conversations (user_id, category_id, title)
     VALUES ($1, $2, $3)
     RETURNING id, user_id, category_id, title, created_at`,
    [userId, categoryId, title],
  )
  return rows[0]
}

/** Fetch a conversation scoped to its owner, or null. */
export async function getConversation(userId: string, conversationId: number): Promise<Conversation | null> {
  const { rows } = await query<Conversation>(
    `SELECT id, user_id, category_id, title, created_at
     FROM conversations WHERE id = $1 AND user_id = $2`,
    [conversationId, userId],
  )
  return rows[0] ?? null
}

export async function listConversations(userId: string): Promise<ConversationListItem[]> {
  const { rows } = await query<ConversationListItem>(
    `SELECT conv.id, conv.title, conv.category_id, c.name AS category_name, conv.created_at
     FROM conversations conv
     LEFT JOIN categories c ON c.id = conv.category_id
     WHERE conv.user_id = $1
     ORDER BY conv.created_at DESC, conv.id DESC`,
    [userId],
  )
  return rows
}

export async function getMessages(conversationId: number): Promise<Message[]> {
  const { rows } = await query<Message>(
    `SELECT id, conversation_id, role, content, referenced_post_ids, created_at
     FROM messages WHERE conversation_id = $1
     ORDER BY created_at ASC, id ASC`,
    [conversationId],
  )
  return rows
}

export async function addMessage(
  conversationId: number,
  role: "user" | "assistant",
  content: string,
  referencedPostIds: number[] = [],
): Promise<Message> {
  const { rows } = await query<Message>(
    `INSERT INTO messages (conversation_id, role, content, referenced_post_ids)
     VALUES ($1, $2, $3, $4)
     RETURNING id, conversation_id, role, content, referenced_post_ids, created_at`,
    [conversationId, role, content, referencedPostIds],
  )
  return rows[0]
}

/**
 * Vector similarity search (cosine distance) over a user's posts within a
 * single category. Returns the top N candidates with the data needed for
 * synthesis. Relies on the hnsw (vector_cosine_ops) index.
 */
export async function searchSimilarPosts(
  userId: string,
  categoryId: number,
  embedding: number[],
  limit = 8,
): Promise<RecommendationCandidate[]> {
  const { rows } = await query<RecommendationCandidate>(
    `SELECT p.id, p.post_url, p.thumbnail_url, p.captured_at, p.summary, p.enriched_text, p.platform,
            p.entity_id, e.name AS entity_name, e.location AS entity_location,
            (p.embedding <=> $3::vector) AS distance
     FROM posts p
     LEFT JOIN entities e ON e.id = p.entity_id
     WHERE p.user_id = $1 AND p.category_id = $2 AND p.embedding IS NOT NULL
     ORDER BY p.embedding <=> $3::vector
     LIMIT $4`,
    [userId, categoryId, toVectorLiteral(embedding), limit],
  )
  return rows
}

/** Return cached enrichment data for an entity if newer than maxAgeDays. */
export async function getFreshEnrichment(
  entityId: number,
  maxAgeDays = 21,
): Promise<EntityEnrichmentData | null> {
  const { rows } = await query<{ data: EntityEnrichmentData }>(
    `SELECT data FROM entity_enrichment
     WHERE entity_id = $1 AND source = 'web_search'
       AND fetched_at > now() - ($2 || ' days')::interval
     ORDER BY fetched_at DESC
     LIMIT 1`,
    [entityId, String(maxAgeDays)],
  )
  return rows[0]?.data ?? null
}

/** Upsert fresh web-search enrichment for an entity. */
export async function saveEnrichment(entityId: number, data: EntityEnrichmentData): Promise<void> {
  await query(
    `INSERT INTO entity_enrichment (entity_id, source, data, fetched_at)
     VALUES ($1, 'web_search', $2, now())`,
    [entityId, JSON.stringify(data)],
  )
}

export async function getPostsByIds(userId: string, ids: number[]): Promise<PostWithRelations[]> {
  if (ids.length === 0) return []
  const { rows } = await query<PostWithRelations>(
    `SELECT p.id, p.user_id, p.platform, p.platform_post_id, p.post_url, p.caption,
            p.author_handle, p.author_name, p.thumbnail_url, p.media_type, p.captured_at,
            p.source_url, p.raw, p.category_id, p.summary, p.enriched_text, p.entity_id,
            p.created_at, p.updated_at,
            c.name AS category_name,
            e.name AS entity_name, e.location AS entity_location
     FROM posts p
     LEFT JOIN categories c ON c.id = p.category_id
     LEFT JOIN entities e ON e.id = p.entity_id
     WHERE p.user_id = $1 AND p.id = ANY($2)`,
    [userId, ids],
  )
  return rows
}
