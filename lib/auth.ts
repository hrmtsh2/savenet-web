import { getServerSession } from "next-auth"
import { authOptions } from "@/auth.config"

// Stubbed auth: a Bearer API key maps to a user id.
// Used by /api/posts/capture and other Bearer-token endpoints (the browser
// extension has no session to send, so it stays on this path).
export const DEFAULT_USER_ID = "demo-user"

export function userIdFromApiKey(_key: string): string {
  return DEFAULT_USER_ID
}

export function authenticateRequest(req: Request): string | null {
  const expected = process.env.SAVENET_API_KEY
  if (!expected) return null
  const header = req.headers.get("authorization") || ""
  const token = header.replace(/^Bearer\s+/i, "").trim()
  if (!token || token !== expected) return null
  return userIdFromApiKey(token)
}

// Session-based auth: used by pages and server actions for the logged-in
// web app user. Resolves the Cognito `sub` set on the session in auth.config.ts.
export async function getSessionUserId(): Promise<string | null> {
  const session = await getServerSession(authOptions)
  return session?.user?.id ?? null
}

/** Like getSessionUserId, but throws if there's no session - use in pages
 * and server actions that require a logged-in user. */
export async function requireUserId(): Promise<string> {
  const userId = await getSessionUserId()
  if (!userId) {
    throw new Error("Not authenticated")
  }
  return userId
}