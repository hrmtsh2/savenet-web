import { query } from "./db"
import type { Category, CategoryWithCount, PostWithRelations } from "./types"

const DEFAULT_CATEGORIES: Array<Pick<Category, "name" | "description" | "enable_entity_resolution">> = [
  {
    name: "Food & Travel",
    description: "restaurants, cafes, travel spots, things to visit or eat",
    enable_entity_resolution: true,
  },
  {
    name: "Resources",
    description: "tutorials, tools, discounts, learning material",
    enable_entity_resolution: false,
  },
  {
    name: "Media",
    description: "movie/book/album/show recommendations",
    enable_entity_resolution: false,
  },
  {
    name: "Other",
    description: null as unknown as string,
    enable_entity_resolution: false,
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
      `INSERT INTO categories (user_id, name, description, enable_entity_resolution, auto_created)
       VALUES ($1, $2, $3, $4, false)
       ON CONFLICT (user_id, lower(name)) DO NOTHING`,
      [userId, c.name, c.description ?? null, c.enable_entity_resolution],
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
            p.source_url, p.raw, p.category_id, p.summary, p.enriched_text, p.entity_id,
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
