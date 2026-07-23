import { getCategories } from "./queries"
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
  categoryIds?: number[] | null
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

export async function runChatTurn(userId: string, input: ChatTurnInput): Promise<ChatTurnResult> {
  const message = input.message?.trim()
  if (!message) throw new ChatError("message is required", 400)

  const meter = createCallMeter()
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

  const history = await getMessages(conversation.id)
  await addMessage(conversation.id, "user", message)

  const queryEmbedding = await embedText(message, meter)
  const searchCategoryIds = input.categoryIds?.length ? input.categoryIds : [categoryId]
  const candidates = await searchSimilarPosts(userId, searchCategoryIds, queryEmbedding, 8)

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

  const { reply, citedPostIds } = await synthesizeRecommendation(
    {
      history: history.map((m) => ({ role: m.role, content: m.content })),
      candidates,
      userMessage: message,
      categoryName,
    },
    meter,
  )

  await addMessage(conversation.id, "assistant", reply, citedPostIds)

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
