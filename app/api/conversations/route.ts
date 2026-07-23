import { authenticateRequest } from "@/lib/auth"
import { listConversations } from "@/lib/queries"

// GET /api/conversations — list the user's conversations for history/sidebar.
export async function GET(req: Request) {
  const userId = await authenticateRequest(req)
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const conversations = await listConversations(userId)
    return Response.json({ conversations })
  } catch (err) {
    console.log("[v0] list conversations error:", (err as Error).message)
    return Response.json({ error: (err as Error).message }, { status: 500 })
  }
}
