import { authenticateRequest } from "@/lib/auth"
import { query } from "@/lib/db"

export async function GET(req: Request) {
  const userId = await authenticateRequest(req)
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const { rows } = await query<{ id: number; name: string }>(
    `SELECT id, name
     FROM categories
     WHERE user_id = $1 AND auto_created = false
     ORDER BY lower(name), id`,
    [userId],
  )
  return Response.json({ labels: rows })
}
