import { authenticateRequest } from "@/lib/auth"
import { runChatTurn, ChatError } from "@/lib/chat"

interface ChatBody {
  conversationId?: number | null
  categoryId?: number | null
  categoryIds?: number[] | null
  labelMatch?: "any" | "all"
  message?: string
}

export async function POST(req: Request) {
  const userId = await authenticateRequest(req)
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 })

  let body: ChatBody
  try {
    body = (await req.json()) as ChatBody
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  try {
    const result = await runChatTurn(userId, {
      conversationId: body.conversationId,
      categoryId: body.categoryId,
      categoryIds: body.categoryIds,
      labelMatch: body.labelMatch,
      message: body.message ?? "",
    })
    return Response.json(result)
  } catch (err) {
    if (err instanceof ChatError) {
      return Response.json({ error: err.message }, { status: err.status })
    }
    console.log("[v0] chat error:", (err as Error).message)
    return Response.json({ error: (err as Error).message }, { status: 500 })
  }
}
