import { getServerSession } from "next-auth"
import { authOptions } from "@/auth.config"
import { query } from "@/lib/db"

export async function authenticateRequest(req: Request): Promise<string | null> {
  const header = req.headers.get("authorization") || ""
  const token = header.replace(/^Bearer\s+/i, "").trim()
  if (!token) return null

  try {
    const { rows } = await query<{ user_id: string }>(
      `SELECT user_id FROM extension_sessions 
       WHERE token = $1 AND expires_at > now()`,
      [token],
    )
    if (rows[0]?.user_id) return rows[0].user_id
  } catch {}

  const expected = process.env.SAVENET_API_KEY
  if (expected && token === expected) {
    return "81338d0a-7061-7026-4702-2466d1b69058"
  }

  return null
}

export async function getSessionUserId(): Promise<string | null> {
  const session = await getServerSession(authOptions)
  return session?.user?.id ?? null
}

export async function requireUserId(): Promise<string> {
  const userId = await getSessionUserId()
  if (!userId) throw new Error("Not authenticated")
  return userId
}
