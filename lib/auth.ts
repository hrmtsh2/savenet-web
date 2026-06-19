import { getServerSession } from "next-auth"
import { authOptions } from "@/auth.config"
import { jwtVerify } from "jose"

// Stubbed auth: a Bearer API key maps to a user id.
// Used by /api/posts/capture and other Bearer-token endpoints (the browser
// extension has no session to send, so it stays on this path).
const SECRET = new TextEncoder().encode(process.env.NEXTAUTH_SECRET!)

export async function authenticateRequest(req: Request): Promise<string | null> {
  const header = req.headers.get("authorization") || ""
  const token = header.replace(/^Bearer\s+/i, "").trim()
  if (!token) return null

  // First try verifying as a SaveNet JWT (issued by /api/auth/extension-token)
  try {
    const { payload } = await jwtVerify(token, SECRET)
    if (typeof payload.sub === "string") return payload.sub
  } catch {
    // Not a valid JWT — fall through to legacy API key check
  }

  // Legacy static API key fallback (for existing dev/testing setup)
  const expected = process.env.SAVENET_API_KEY
  if (expected && token === expected) {
    // Return your own Cognito sub here so legacy captures go to your account
    return "81338d0a-7061-7026-4702-2466d1b69058"
  }

  return null
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
  if (!userId) throw new Error("Not authenticated")
  return userId
}