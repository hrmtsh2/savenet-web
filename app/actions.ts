"use server"

import { revalidatePath } from "next/cache"
import { query, toVectorLiteral } from "@/lib/db"
import { requireUserId } from "@/lib/auth"
import { ensureSeedCategories, getCategories, getConversation, getMessages, getPostsByIds } from "@/lib/queries"
import { classifyPost, embedText, extractEntity, buildResolutionKey, createCallMeter, totalCalls, type CallMeter } from "@/lib/ai"
import { runChatTurn, ChatError, type ChatTurnResult } from "@/lib/chat"
import type { Category } from "@/lib/types"

/**
 * UI entry point for a chat turn. Runs the same orchestration as POST /api/chat
 * but for the logged-in session user, so the browser doesn't need the API key.
 */
export async function sendChatMessage(input: {
  conversationId?: number | null
  categoryId?: number | null
  categoryIds: number[] | null
  message: string
}): Promise<{ ok: true; result: ChatTurnResult } | { ok: false; error: string }> {
  try {
    const userId = await requireUserId()
    const result = await runChatTurn(userId, input)
    revalidatePath("/chat")
    return { ok: true, result }
  } catch (err) {
    if (err instanceof ChatError) return { ok: false, error: err.message }
    console.log("[v0] sendChatMessage error:", (err as Error).message)
    return { ok: false, error: "Something went wrong generating a recommendation." }
  }
}

/** Load a conversation's messages plus any posts cited within it, for the UI. */
export async function loadConversation(conversationId: number) {
  const userId = await requireUserId()
  const conversation = await getConversation(userId, conversationId)
  if (!conversation) return { ok: false as const, error: "Conversation not found" }

  const messages = await getMessages(conversationId)
  const ids = Array.from(new Set(messages.flatMap((m) => m.referenced_post_ids)))
  const posts = await getPostsByIds(userId, ids)
  const postsById = Object.fromEntries(
    posts.map((p) => [
      p.id,
      { id: p.id, postUrl: p.post_url, thumbnailUrl: p.thumbnail_url, summary: p.summary, platform: p.platform },
    ]),
  )
  return { ok: true as const, conversation, messages, postsById }
}

export async function createCategory(formData: FormData) {
  const userId = await requireUserId()
  const name = String(formData.get("name") || "").trim()
  const description = String(formData.get("description") || "").trim()
  const enableEntityResolution = formData.get("enable_entity_resolution") === "on"
  if (!name) return { error: "Name is required" }

  await ensureSeedCategories(userId)
  await query(
    `INSERT INTO categories (user_id, name, description, enable_entity_resolution, auto_created)
     VALUES ($1, $2, $3, $4, false)
     ON CONFLICT (user_id, lower(name)) DO NOTHING`,
    [userId, name, description || null, enableEntityResolution],
  )
  revalidatePath("/categories")
  revalidatePath("/library")
  return { ok: true }
}

export async function updateCategory(formData: FormData) {
  const userId = await requireUserId()
  const id = Number(formData.get("id"))
  const name = String(formData.get("name") || "").trim()
  const description = String(formData.get("description") || "").trim()
  const enableEntityResolution = formData.get("enable_entity_resolution") === "on"
  if (!id || !name) return { error: "Name is required" }

  await query(
    `UPDATE categories
     SET name = $1, description = $2, enable_entity_resolution = $3
     WHERE id = $4 AND user_id = $5`,
    [name, description || null, enableEntityResolution, id, userId],
  )
  revalidatePath("/categories")
  revalidatePath("/library")
  return { ok: true }
}

/**
 * Retroactively run entity resolution on existing posts in a category. Entity
 * resolution otherwise only runs at capture time, so this lets a user apply it
 * to posts saved before they enabled it. Only fills posts missing an entity
 * (or all of them when reresolve=true). Returns how many entities were resolved
 * and how many model calls it cost.
 */
export async function backfillEntityResolution(categoryId: number, reresolve = false) {
  const userId = await requireUserId()
  const categories = await getCategories(userId)
  const category = categories.find((c) => c.id === categoryId)
  if (!category) return { ok: false as const, error: "Category not found" }
  if (!category.enable_entity_resolution)
    return { ok: false as const, error: "Enable entity resolution for this category first" }

  const { rows: posts } = await query<{ id: number; summary: string | null; entity_id: number | null }>(
    `SELECT id, summary, entity_id FROM posts
     WHERE user_id = $1 AND category_id = $2 AND summary IS NOT NULL
       ${reresolve ? "" : "AND entity_id IS NULL"}`,
    [userId, categoryId],
  )

  const meter = createCallMeter()
  let resolved = 0
  for (const post of posts) {
    if (!post.summary) continue
    const entity = await extractEntity(
      { summary: post.summary, categoryName: category.name, categoryDescription: category.description },
      meter,
    )
    if (!entity) continue
    const resolutionKey = buildResolutionKey(entity.entityType, entity.name, entity.location)
    const row = await query<{ id: number }>(
      `INSERT INTO entities (resolution_key, name, location, entity_type)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (resolution_key) DO UPDATE SET
         name = EXCLUDED.name,
         location = COALESCE(EXCLUDED.location, entities.location),
         entity_type = EXCLUDED.entity_type
       RETURNING id`,
      [resolutionKey, entity.name, entity.location, entity.entityType],
    )
    await query("UPDATE posts SET entity_id = $1, updated_at = now() WHERE id = $2 AND user_id = $3", [
      row.rows[0].id,
      post.id,
      userId,
    ])
    resolved += 1
  }

  revalidatePath("/categories")
  revalidatePath("/library")
  return { ok: true as const, scanned: posts.length, resolved, modelCalls: totalCalls(meter) }
}

export async function deleteCategory(formData: FormData) {
  const userId = await requireUserId()
  const id = Number(formData.get("id"))
  if (!id) return { error: "Missing id" }
  // Posts move to Uncategorized via ON DELETE SET NULL.
  await query("DELETE FROM categories WHERE id = $1 AND user_id = $2", [id, userId])
  revalidatePath("/categories")
  revalidatePath("/library")
  return { ok: true }
}

export async function deletePost(formData: FormData) {
  const userId = await requireUserId()
  const id = Number(formData.get("id"))
  if (!id) return { error: "Missing id" }
  await query("DELETE FROM posts WHERE id = $1 AND user_id = $2", [id, userId])
  revalidatePath("/library")
  revalidatePath("/categories")
  return { ok: true }
}

export async function mergeCategories(formData: FormData) {
  const userId = await requireUserId()
  const fromId = Number(formData.get("from_id"))
  const toId = Number(formData.get("to_id"))
  if (!fromId || !toId || fromId === toId) return { error: "Pick two different categories" }

  // Reassign posts from A to B, then delete A.
  await query("UPDATE posts SET category_id = $1, updated_at = now() WHERE category_id = $2 AND user_id = $3", [
    toId,
    fromId,
    userId,
  ])
  await query("DELETE FROM categories WHERE id = $1 AND user_id = $2", [fromId, userId])
  revalidatePath("/categories")
  revalidatePath("/library")
  return { ok: true }
}

type PostRow = { id: number; caption: string | null; raw: { scopeText?: string } | null }

/**
 * Classify a single post against the given category set and persist the result.
 * - allowAutoCreate=true: if nothing fits, the model may propose a new category.
 * - allowAutoCreate=false: constrain to the existing set; a no-fit post becomes
 *   uncategorized (category_id = null), respecting the user's curated set.
 * Mutates `categories` in place when a new category is created so subsequent
 * posts in the same run can reuse it.
 */
async function classifyAndAssign(
  userId: string,
  post: PostRow,
  categories: Category[],
  allowAutoCreate: boolean,
  meter?: CallMeter,
): Promise<"assigned" | "uncategorized"> {
  const caption = post.caption ?? ""
  const scopeText = typeof post.raw?.scopeText === "string" ? post.raw.scopeText : undefined

  const classification = await classifyPost(
    {
      caption,
      scopeText,
      categories: categories.map((c) => ({ id: c.id, name: c.name, description: c.description })),
    },
    meter,
  )

  let assigned: Category | undefined
  if (classification.categoryId != null) {
    assigned = categories.find((c) => c.id === classification.categoryId)
  }
  if (!assigned && allowAutoCreate && classification.newCategory) {
    const created = await query<Category>(
      `INSERT INTO categories (user_id, name, description, enable_entity_resolution, auto_created)
       VALUES ($1, $2, $3, false, true)
       ON CONFLICT (user_id, lower(name)) DO UPDATE SET description = EXCLUDED.description
       RETURNING id, user_id, name, description, enable_entity_resolution, auto_created, created_at`,
      [userId, classification.newCategory.name, classification.newCategory.description],
    )
    assigned = created.rows[0]
    categories.push(assigned)
  }

  const enrichedText = `${caption} ${classification.summary}`.trim()
  const embedding = await embedText(enrichedText, meter)

  await query(
    `UPDATE posts SET category_id = $1, summary = $2, enriched_text = $3, embedding = $4::vector, updated_at = now()
     WHERE id = $5 AND user_id = $6`,
    [assigned?.id ?? null, classification.summary, enrichedText, toVectorLiteral(embedding), post.id, userId],
  )

  return assigned ? "assigned" : "uncategorized"
}

/**
 * Re-sort only the posts that are currently uncategorized into the existing
 * category set. May auto-create a new category when nothing fits.
 */
export async function resortUncategorized() {
  const userId = await requireUserId()
  await ensureSeedCategories(userId)
  const categories = await getCategories(userId)

  const { rows: posts } = await query<PostRow>(
    "SELECT id, caption, raw FROM posts WHERE user_id = $1 AND category_id IS NULL",
    [userId],
  )

  const meter = createCallMeter()
  let sorted = 0
  for (const post of posts) {
    const result = await classifyAndAssign(userId, post, categories, true, meter)
    if (result === "assigned") sorted += 1
  }

  revalidatePath("/categories")
  revalidatePath("/library")
  return { ok: true, sorted, modelCalls: totalCalls(meter) }
}

/**
 * Re-evaluate EVERY post against the user's current (newly curated) category
 * set. Constrained to existing categories — posts that no longer fit any
 * category fall back to uncategorized. Use this after adding/removing
 * categories so the whole library reflects the new preferences.
 */
export async function recategorizeAll() {
  const userId = await requireUserId()
  await ensureSeedCategories(userId)
  const categories = await getCategories(userId)

  const { rows: posts } = await query<PostRow>(
    "SELECT id, caption, raw FROM posts WHERE user_id = $1 ORDER BY created_at ASC",
    [userId],
  )

  const meter = createCallMeter()
  let moved = 0
  let uncategorized = 0
  for (const post of posts) {
    const result = await classifyAndAssign(userId, post, categories, false, meter)
    if (result === "assigned") moved += 1
    else uncategorized += 1
  }

  revalidatePath("/categories")
  revalidatePath("/library")
  return { ok: true, total: posts.length, moved, uncategorized, modelCalls: totalCalls(meter) }
}