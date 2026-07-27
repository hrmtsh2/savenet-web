import { getCategories } from "./queries"
import {
  createConversation,
  getConversation,
  getMessages,
  addMessage,
  searchSimilarPosts,
} from "./queries"
import {
  embedText,
  synthesizeRecommendation,
  deriveConversationTitle,
  createCallMeter,
  totalCalls,
} from "./ai"
import type { LabelMatch, ReferencedPost, RecommendationCandidate } from "./types"

export interface ChatTurnInput {
  conversationId?: number | null
  categoryId?: number | null
  categoryIds?: number[] | null
  labelMatch?: LabelMatch
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
  const requestedLabelIds = [...new Set((input.categoryIds ?? []).filter((id) => Number.isInteger(id) && id > 0))]
  const requestedLabelMatch: LabelMatch = input.labelMatch === "all" ? "all" : "any"
  let conversation = null
  if (input.conversationId != null) {
    conversation = await getConversation(userId, input.conversationId)
    if (!conversation) throw new ChatError("Conversation not found", 404)
  } else {
    if (input.categoryId == null) {
      throw new ChatError("categoryId is required to start a conversation", 400)
    }
    const categories = await getCategories(userId)
    const labelIds = requestedLabelIds.length ? requestedLabelIds : [input.categoryId]
    if (!labelIds.every((id) => categories.some((category) => category.id === id))) {
      throw new ChatError("Category not found", 404)
    }
    conversation = await createConversation(userId, input.categoryId, deriveConversationTitle(message), labelIds, requestedLabelMatch)
  }

  if (conversation.category_id == null) {
    throw new ChatError("Conversation has no category", 400)
  }
  const categoryId = conversation.category_id
  const categories = await getCategories(userId)
  const searchCategoryIds = conversation.label_ids?.length ? conversation.label_ids : [categoryId]
  const searchLabelMatch: LabelMatch = conversation.label_match === "all" ? "all" : "any"
  const categoryName = categories
    .filter((category) => searchCategoryIds.includes(category.id))
    .map((category) => category.name)
    .join(", ") || "Saved posts"

  const history = await getMessages(conversation.id)
  await addMessage(conversation.id, "user", message)

  const queryEmbedding = await embedText(message, meter)
  const candidates = await searchSimilarPosts(userId, searchCategoryIds, searchLabelMatch, queryEmbedding, 8)

  const { reply, citedPostIds } = await synthesizeRecommendation(
    {
      userId,
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
