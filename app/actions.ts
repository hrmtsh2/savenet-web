"use server"

import { revalidatePath } from "next/cache"
import { query } from "@/lib/db"
import { requireUserId } from "@/lib/auth"
import { getConversation, getMessages, getPostsByIds } from "@/lib/queries"
import { runChatTurn, ChatError, type ChatTurnResult } from "@/lib/chat"

export async function sendChatMessage(input: {
  conversationId?: number | null
  categoryId?: number | null
  categoryIds: number[] | null
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
