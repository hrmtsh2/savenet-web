import { authenticateRequest } from "@/lib/auth"
import { getConversation, getMessages } from "@/lib/queries"

// GET /api/conversations/:id — full message history for resuming a conversation.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await authenticateRequest(req)
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const conversationId = Number(id)
  if (!conversationId) return Response.json({ error: "Invalid id" }, { status: 400 })

  try {
    const conversation = await getConversation(userId, conversationId)
    if (!conversation) return Response.json({ error: "Conversation not found" }, { status: 404 })

    const messages = await getMessages(conversationId)
    return Response.json({ conversation, messages })
  } catch (err) {
    console.log("[v0] conversation detail error:", (err as Error).message)
    return Response.json({ error: (err as Error).message }, { status: 500 })
  }
}
