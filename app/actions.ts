"use server"

import { revalidatePath } from "next/cache"
import { query } from "@/lib/db"
import { requireUserId } from "@/lib/auth"
import { getConversation, getMessages, getPostsByIds } from "@/lib/queries"
import { runChatTurn, ChatError, type ChatTurnResult } from "@/lib/chat"
import type { LabelMatch } from "@/lib/types"

export async function sendChatMessage(input: {
  conversationId?: number | null
  categoryId?: number | null
  categoryIds: number[] | null
  labelMatch?: LabelMatch
  message: string
}): Promise<{ ok: true; result: ChatTurnResult } | { ok: false; error: string }> {
  try {
    const result = await runChatTurn(await requireUserId(), input)
    revalidatePath("/chat")
    return { ok: true, result }
  } catch (err) {
    if (err instanceof ChatError) return { ok: false, error: err.message }
    console.log("[savenet] send chat error:", (err as Error).message)
    return { ok: false, error: "Something went wrong generating a recommendation." }
  }
}

export async function loadConversation(conversationId: number) {
  const userId = await requireUserId()
  const conversation = await getConversation(userId, conversationId)
  if (!conversation) return { ok: false as const, error: "Conversation not found" }
  const messages = await getMessages(conversationId)
  const ids = Array.from(new Set(messages.flatMap((message) => message.referenced_post_ids)))
  const posts = await getPostsByIds(userId, ids)
  const postsById = Object.fromEntries(posts.map((post) => [post.id, {
    id: post.id, postUrl: post.post_url, thumbnailUrl: post.thumbnail_url, summary: post.summary, platform: post.platform,
  }]))
  return { ok: true as const, conversation, messages, postsById }
}

export async function createCategory(formData: FormData) {
  const userId = await requireUserId()
  const name = String(formData.get("name") || "").trim()
  if (!name) return { error: "Name is required" }
  await query(
    `INSERT INTO categories (user_id, name, description, enable_entity_resolution, enable_web_enrichment, auto_created)
     VALUES ($1, $2, NULL, false, false, false)
     ON CONFLICT (user_id, lower(name)) DO NOTHING`,
    [userId, name],
  )
  revalidatePath("/categories")
  revalidatePath("/library")
  revalidatePath("/chat")
  return { ok: true as const }
}

export async function deletePost(formData: FormData) {
  const userId = await requireUserId()
  const id = Number(formData.get("id"))
  if (!id) return { error: "Missing id" }
  await query("DELETE FROM posts WHERE id = $1 AND user_id = $2", [id, userId])
  revalidatePath("/library")
  revalidatePath("/categories")
  revalidatePath("/chat")
  return { ok: true as const }
}

export async function addLabelToPosts(input: { labelId: number; postIds: number[] }) {
  const userId = await requireUserId()
  const labelId = Number(input.labelId)
  const postIds = [...new Set(input.postIds.map(Number).filter(Number.isInteger))]
  if (!Number.isInteger(labelId) || labelId < 1 || postIds.length === 0) return { error: "Choose a label and at least one post." }

  const { rows: labels } = await query<{ id: number }>(
    "SELECT id FROM categories WHERE id = $1 AND user_id = $2",
    [labelId, userId],
  )
  if (!labels[0]) return { error: "Label not found." }

  const result = await query(
    `INSERT INTO post_labels (post_id, label_id)
     SELECT p.id, $2
     FROM posts p
     WHERE p.user_id = $1 AND p.id = ANY($3::int[])
     ON CONFLICT DO NOTHING
     RETURNING post_id`,
    [userId, labelId, postIds],
  )
  revalidatePath("/library")
  revalidatePath("/categories")
  return { ok: true as const, added: result.rows.length }
}

export async function addLabelToFilteredPosts(input: { labelId: number; sourceLabelIds?: number[]; labelMatch?: LabelMatch; searchQuery?: string }) {
  const userId = await requireUserId()
  const labelId = Number(input.labelId)
  const sourceLabelIds = [...new Set((input.sourceLabelIds ?? []).filter((id) => Number.isInteger(id) && id > 0))]
  const labelMatch = input.labelMatch === "all" ? "all" : "any"
  const searchQuery = input.searchQuery?.trim().slice(0, 200) || null
  if (!Number.isInteger(labelId) || labelId < 1) return { error: "Choose a label." }

  const { rows: labels } = await query<{ id: number }>(
    "SELECT id FROM categories WHERE id = $1 AND user_id = $2",
    [labelId, userId],
  )
  if (!labels[0]) return { error: "Label not found." }

  const result = await query(
    `INSERT INTO post_labels (post_id, label_id)
     SELECT p.id, $4
     FROM posts p
     WHERE p.user_id = $1
       AND ${labelMatch === "all"
         ? `(cardinality($2::int[]) = 0 OR (SELECT count(DISTINCT pl.label_id) FROM post_labels pl WHERE pl.post_id = p.id AND pl.label_id = ANY($2::int[])) = cardinality($2::int[]))`
         : `(cardinality($2::int[]) = 0 OR EXISTS (SELECT 1 FROM post_labels pl WHERE pl.post_id = p.id AND pl.label_id = ANY($2::int[])))`}
       AND ($3::text IS NULL OR to_tsvector('simple',
         coalesce(p.caption, '') || ' ' || coalesce(p.author_handle, '') || ' ' ||
         coalesce(p.author_name, '') || ' ' || coalesce(p.summary, '') || ' ' ||
         coalesce(p.enriched_text, '') || ' ' || coalesce(p.source_url, '') || ' ' || coalesce(p.post_url, '')
       ) @@ websearch_to_tsquery('simple', $3))
     ON CONFLICT DO NOTHING
     RETURNING post_id`,
    [userId, sourceLabelIds, searchQuery, labelId],
  )
  revalidatePath("/library")
  revalidatePath("/categories")
  return { ok: true as const, added: result.rows.length }
}

export async function deleteFilteredPosts(input: { labelIds?: number[]; labelMatch?: LabelMatch; searchQuery?: string }) {
  const userId = await requireUserId()
  const labelIds = [...new Set((input.labelIds ?? []).filter((id) => Number.isInteger(id) && id > 0))]
  const labelMatch = input.labelMatch === "all" ? "all" : "any"
  const searchQuery = input.searchQuery?.trim().slice(0, 200) || null
  const labelFilter = labelMatch === "all"
    ? `(cardinality($2::int[]) = 0 OR p.id IN (
        SELECT pl.post_id FROM post_labels pl WHERE pl.label_id = ANY($2::int[])
        GROUP BY pl.post_id HAVING count(DISTINCT pl.label_id) = cardinality($2::int[])
      ))`
    : `(cardinality($2::int[]) = 0 OR p.id IN (
        SELECT pl.post_id FROM post_labels pl WHERE pl.label_id = ANY($2::int[])
      ))`

  const result = await query(
    `DELETE FROM posts p
     WHERE p.user_id = $1
       AND ${labelFilter}
       AND ($3::text IS NULL OR to_tsvector('simple',
         coalesce(p.caption, '') || ' ' || coalesce(p.author_handle, '') || ' ' ||
         coalesce(p.author_name, '') || ' ' || coalesce(p.summary, '') || ' ' ||
         coalesce(p.enriched_text, '') || ' ' || coalesce(p.source_url, '') || ' ' || coalesce(p.post_url, '')
       ) @@ websearch_to_tsquery('simple', $3))
     RETURNING p.id`,
    [userId, labelIds, searchQuery],
  )
  revalidatePath("/library")
  revalidatePath("/categories")
  revalidatePath("/chat")
  return { ok: true as const, deleted: result.rows.length }
}
