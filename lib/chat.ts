import { ensureSeedCategories, getCategories } from "./queries"
import {
  createConversation,
  getConversation,
  getMessages,
  addMessage,
  searchSimilarPosts,
  getFreshEnrichment,
  saveEnrichment,
} from "./queries"
import {
  embedText,
  enrichEntityWeb,
  synthesizeRecommendation,
  deriveConversationTitle,
  createCallMeter,
  totalCalls,
} from "./ai"
import type { ReferencedPost, RecommendationCandidate } from "./types"

export interface ChatTurnInput {
  conversationId?: number | null
  categoryId?: number | null
  message: string
}

export interface ChatTurnResult {
  conversationId: number
  reply: string
  referencedPosts: ReferencedPost[]
  modelCalls: number
}

export class ChatError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

/**
 * Runs a single chat turn: resolve/create the conversation, persist the user
 * message, vector-search the category's posts, enrich entities via cached or
 * fresh web search, synthesize a recommendation from the candidates, and persist
 * the assistant reply. Shared by the API route (Bearer auth) and the UI server
 * action (session user), so the logic lives in one place.
 */
export async function runChatTurn(userId: string, input: ChatTurnInput): Promise<ChatTurnResult> {
  const message = input.message?.trim()
  if (!message) throw new ChatError("message is required", 400)

  const meter = createCallMeter()
  await ensureSeedCategories(userId)

  // 1. Resolve (or create) the conversation, scoped to a category.
  let conversation = null
  if (input.conversationId != null) {
    conversation = await getConversation(userId, input.conversationId)
    if (!conversation) throw new ChatError("Conversation not found", 404)
  } else {
    if (input.categoryId == null) {
      throw new ChatError("categoryId is required to start a conversation", 400)
    }
    const categories = await getCategories(userId)
    if (!categories.some((c) => c.id === input.categoryId)) {
      throw new ChatError("Category not found", 404)
    }
    conversation = await createConversation(userId, input.categoryId, deriveConversationTitle(message))
  }

  if (conversation.category_id == null) {
    throw new ChatError("Conversation has no category", 400)
  }
  const categoryId = conversation.category_id
  const categories = await getCategories(userId)
  const categoryName = categories.find((c) => c.id === categoryId)?.name ?? "Saved posts"

  // 2. Load history, then persist the new user message.
  const history = await getMessages(conversation.id)
  await addMessage(conversation.id, "user", message)

  // 3. Embed the user's message and run in-category vector similarity search.
  const queryEmbedding = await embedText(message, meter)
  const candidates = await searchSimilarPosts(userId, categoryId, queryEmbedding, 8)

  // 4. Attach fresh (cached <21d) or newly fetched web enrichment per entity.
  const seenEntities = new Map<number, RecommendationCandidate["enrichment"]>()
  for (const c of candidates) {
    if (c.entity_id == null || !c.entity_name) continue
    if (seenEntities.has(c.entity_id)) {
      c.enrichment = seenEntities.get(c.entity_id)
      continue
    }
    let data = await getFreshEnrichment(c.entity_id, 21)
    if (!data) {
      data = await enrichEntityWeb(c.entity_name, c.entity_location, meter)
      await saveEnrichment(c.entity_id, data)
    }
    c.enrichment = data
    seenEntities.set(c.entity_id, data)
  }

  // 5. Synthesize a recommendation strictly from the candidate posts.
  const { reply, citedPostIds } = await synthesizeRecommendation(
    {
      history: history.map((m) => ({ role: m.role, content: m.content })),
      candidates,
      userMessage: message,
      categoryName,
    },
    meter,
  )

  // 6. Persist the assistant reply with the cited post ids.
  await addMessage(conversation.id, "assistant", reply, citedPostIds)

  // 7. Build the referenced-post payload, preserving citation order.
  const byId = new Map(candidates.map((c) => [c.id, c]))
  const referencedPosts: ReferencedPost[] = citedPostIds
    .map((id) => byId.get(id))
    .filter((c): c is RecommendationCandidate => Boolean(c))
    .map((c) => ({
      id: c.id,
      postUrl: c.post_url,
      thumbnailUrl: c.thumbnail_url,
      summary: c.summary,
      platform: c.platform,
    }))

  return {
    conversationId: conversation.id,
    reply,
    referencedPosts,
    modelCalls: totalCalls(meter),
  }
}
