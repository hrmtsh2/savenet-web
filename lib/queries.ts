import { query, toVectorLiteral } from "./db"
import type {
  Category,
  CategoryWithCount,
  PostWithRelations,
  Conversation,
  ConversationListItem,
  Message,
  RecommendationCandidate,
  LabelMatch,
} from "./types"

const SOURCE_LABELS = {
  instagram: "Instagram",
  x: "X",
  browser_bookmark: "Browser Bookmark",
  reading_list: "Reading List",
} as const

export async function getOrCreateLabel(userId: string, name: string, system = false): Promise<Category> {
  const { rows } = await query<Category>(
    `INSERT INTO categories (user_id, name, description, enable_entity_resolution, enable_web_enrichment, auto_created)
     VALUES ($1, $2, NULL, false, false, $3)
     ON CONFLICT (user_id, lower(name)) DO UPDATE SET name = categories.name
     RETURNING id, user_id, name, description, enable_entity_resolution, enable_web_enrichment, auto_created, created_at`,
    [userId, name, system],
  )
  return rows[0]
}

export async function attachLabels(postId: number, userId: string, names: Array<{ name: string; system?: boolean }>) {
  const unique = new Map(names.map((label) => [label.name.trim().toLocaleLowerCase(), label]))
  for (const label of unique.values()) {
    if (!label.name.trim()) continue
    const saved = await getOrCreateLabel(userId, label.name.trim(), Boolean(label.system))
    await query(
      `INSERT INTO post_labels (post_id, label_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [postId, saved.id],
    )
  }
}

export async function attachExistingLabels(postId: number, userId: string, labelIds: number[]) {
  const uniqueIds = [...new Set(labelIds.filter((id) => Number.isInteger(id) && id > 0))]
  if (uniqueIds.length === 0) return
  await query(
    `INSERT INTO post_labels (post_id, label_id)
     SELECT $1, c.id
     FROM categories c
     WHERE c.user_id = $2 AND c.id = ANY($3::int[])
     ON CONFLICT DO NOTHING`,
    [postId, userId, uniqueIds],
  )
}

export function sourceLabelFor(platform: keyof typeof SOURCE_LABELS) {
  return SOURCE_LABELS[platform]
}

export async function getCategories(userId: string): Promise<Category[]> {
  const { rows } = await query<Category>(
    `SELECT id, user_id, name, description, enable_entity_resolution, enable_web_enrichment, auto_created, created_at
     FROM categories WHERE user_id = $1 ORDER BY created_at ASC, id ASC`,
    [userId],
  )
  return rows
}

export async function getCategoriesWithCounts(userId: string): Promise<CategoryWithCount[]> {
  const { rows } = await query<CategoryWithCount>(
    `SELECT c.id, c.user_id, c.name, c.description, c.enable_entity_resolution, c.enable_web_enrichment, c.auto_created, c.created_at,
            count(pl.post_id)::int AS post_count
     FROM categories c
     LEFT JOIN post_labels pl ON pl.label_id = c.id
     WHERE c.user_id = $1
     GROUP BY c.id
     ORDER BY c.created_at ASC, c.id ASC`,
    [userId],
  )
  return rows
}

export type { LabelMatch } from "./types"

function labelFilterSql(labelMatch: LabelMatch, labelParam: string) {
  if (labelMatch === "all") {
    return `(cardinality(${labelParam}::int[]) = 0 OR p.id IN (
      SELECT pl.post_id
      FROM post_labels pl
      WHERE pl.label_id = ANY(${labelParam}::int[])
      GROUP BY pl.post_id
      HAVING count(DISTINCT pl.label_id) = cardinality(${labelParam}::int[])
    ))`
  }
  return `(cardinality(${labelParam}::int[]) = 0 OR p.id IN (
    SELECT pl.post_id FROM post_labels pl WHERE pl.label_id = ANY(${labelParam}::int[])
  ))`
}

export async function getPostsCount(userId: string, labelIds: number[] = [], labelMatch: LabelMatch = "any", searchQuery?: string): Promise<number> {
  const { rows } = await query<{ count: string }>(
    `SELECT count(*)::text AS count
     FROM posts p
     WHERE p.user_id = $1
       AND ${labelFilterSql(labelMatch, "$2")}
       AND ($3::text IS NULL OR to_tsvector('simple',
         coalesce(p.caption, '') || ' ' || coalesce(p.author_handle, '') || ' ' ||
         coalesce(p.author_name, '') || ' ' || coalesce(p.summary, '') || ' ' ||
         coalesce(p.enriched_text, '') || ' ' || coalesce(p.source_url, '') || ' ' || coalesce(p.post_url, '')
       ) @@ websearch_to_tsquery('simple', $3))`,
    [userId, labelIds, searchQuery ?? null],
  )
  return Number(rows[0]?.count ?? "0")
}

export async function getPostsForUser(
  userId: string,
  { labelIds = [], labelMatch = "any", limit, offset, searchQuery }: { labelIds?: number[]; labelMatch?: LabelMatch; limit: number; offset: number; searchQuery?: string },
): Promise<PostWithRelations[]> {
  const { rows } = await query<PostWithRelations>(
    `SELECT p.id, p.user_id, p.platform, p.platform_post_id, p.post_url, p.caption,
            p.author_handle, p.author_name,
            CASE WHEN p.thumbnail_s3_key IS NOT NULL THEN '/api/posts/' || p.id || '/thumbnail' ELSE p.thumbnail_url END AS thumbnail_url,
            p.media_type, p.captured_at,
            p.further_reading, p.source_url, p.raw, p.category_id, p.summary, p.enriched_text, p.entity_id,
            p.created_at, p.updated_at,
            c.name AS category_name,
            COALESCE(labels.labels, '[]'::json) AS labels,
            e.name AS entity_name, e.location AS entity_location
     FROM posts p
     LEFT JOIN categories c ON c.id = p.category_id
     LEFT JOIN LATERAL (
       SELECT json_agg(json_build_object('id', label.id, 'name', label.name, 'system', label.auto_created)
         ORDER BY label.name) AS labels
       FROM post_labels pl
       JOIN categories label ON label.id = pl.label_id
       WHERE pl.post_id = p.id
     ) labels ON true
     LEFT JOIN entities e ON e.id = p.entity_id
     WHERE p.user_id = $1
       AND ${labelFilterSql(labelMatch, "$2")}
       AND ($3::text IS NULL OR to_tsvector('simple',
         coalesce(p.caption, '') || ' ' || coalesce(p.author_handle, '') || ' ' ||
         coalesce(p.author_name, '') || ' ' || coalesce(p.summary, '') || ' ' ||
         coalesce(p.enriched_text, '') || ' ' || coalesce(p.source_url, '') || ' ' || coalesce(p.post_url, '')
       ) @@ websearch_to_tsquery('simple', $3))
     ORDER BY p.created_at DESC, p.id DESC
     LIMIT $4 OFFSET $5`,
    [userId, labelIds, searchQuery ?? null, limit, offset],
  )
  return rows
}

// Chat recommendation queries

export async function createConversation(
  userId: string,
  categoryId: number,
  title: string | null,
  labelIds: number[] = [categoryId],
  labelMatch: LabelMatch = "any",
): Promise<Conversation> {
  const { rows } = await query<Conversation>(
    `INSERT INTO conversations (user_id, category_id, title, label_ids, label_match)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, user_id, category_id, label_ids, label_match, title, created_at`,
    [userId, categoryId, title, labelIds, labelMatch],
  )
  return rows[0]
}

// Fetch a conversation owned by userId. Or null.
export async function getConversation(userId: string, conversationId: number): Promise<Conversation | null> {
  const { rows } = await query<Conversation>(
    `SELECT id, user_id, category_id, label_ids, label_match, title, created_at
     FROM conversations WHERE id = $1 AND user_id = $2`,
    [conversationId, userId],
  )
  return rows[0] ?? null
}

export async function listConversations(userId: string): Promise<ConversationListItem[]> {
  const { rows } = await query<ConversationListItem>(
    `SELECT conv.id, conv.title, conv.category_id, conv.label_ids, conv.label_match, c.name AS category_name, conv.created_at
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

// Vector similarity search within the selected labels, over an HNSW index constructed using the user's posts.
export async function searchSimilarPosts(
  userId: string,
  categoryIds: number[],
  labelMatch: LabelMatch,
  embedding: number[],
  limit = 8,
): Promise<RecommendationCandidate[]> {
  const { rows } = await query<RecommendationCandidate>(
    `SELECT p.id, p.post_url,
            CASE WHEN p.thumbnail_s3_key IS NOT NULL THEN '/api/posts/' || p.id || '/thumbnail' ELSE p.thumbnail_url END AS thumbnail_url,
            p.captured_at, p.summary, p.enriched_text, p.platform,
            p.entity_id, e.name AS entity_name, e.location AS entity_location,
            (p.embedding <=> $3::vector) AS distance
     FROM posts p
     LEFT JOIN entities e ON e.id = p.entity_id
     WHERE p.user_id = $1
       AND p.embedding IS NOT NULL
       AND ${labelFilterSql(labelMatch, "$2")}
     ORDER BY p.embedding <=> $3::vector
     LIMIT $4`,
    [userId, categoryIds, toVectorLiteral(embedding), limit],
  )
  return rows
}

export async function getPostsByIds(userId: string, ids: number[]): Promise<PostWithRelations[]> {
  if (ids.length === 0) return []
  const { rows } = await query<PostWithRelations>(
    `SELECT p.id, p.user_id, p.platform, p.platform_post_id, p.post_url, p.caption,
            p.author_handle, p.author_name,
            CASE WHEN p.thumbnail_s3_key IS NOT NULL THEN '/api/posts/' || p.id || '/thumbnail' ELSE p.thumbnail_url END AS thumbnail_url,
            p.media_type, p.captured_at,
            p.source_url, p.raw, p.category_id, p.summary, p.enriched_text, p.entity_id,
            p.created_at, p.updated_at,
            c.name AS category_name,
            COALESCE(labels.labels, '[]'::json) AS labels,
            e.name AS entity_name, e.location AS entity_location
     FROM posts p
     LEFT JOIN categories c ON c.id = p.category_id
     LEFT JOIN LATERAL (
       SELECT json_agg(json_build_object('id', label.id, 'name', label.name, 'system', label.auto_created)
         ORDER BY label.name) AS labels
       FROM post_labels pl JOIN categories label ON label.id = pl.label_id
       WHERE pl.post_id = p.id
     ) labels ON true
     LEFT JOIN entities e ON e.id = p.entity_id
     WHERE p.user_id = $1 AND p.id = ANY($2)`,
    [userId, ids],
  )
  return rows
}
