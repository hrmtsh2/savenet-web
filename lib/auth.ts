// Stubbed auth: a Bearer API key maps to a user id.
// Pages use DEFAULT_USER_ID, and a valid API key resolves to the same user
// so captured posts show up in the library.
// TODO: Real auth can replace this later.

export const DEFAULT_USER_ID = "demo-user"

/**
 * Maps a validated API key to a user id. For now every valid key resolves to
 * the demo user, but the indirection keeps the door open for per-key users.
 */
export function userIdFromApiKey(_key: string): string {
  return DEFAULT_USER_ID
}

/**
 * Validates the Authorization header and returns the user id, or null if the
 * request is not authenticated.
 */
export function authenticateRequest(req: Request): string | null {
  const expected = process.env.SAVENET_API_KEY
  if (!expected) {
    // Misconfiguration: no key set on the server.
    return null
  }
  const header = req.headers.get("authorization") || ""
  const token = header.replace(/^Bearer\s+/i, "").trim()
  if (!token || token !== expected) return null
  return userIdFromApiKey(token)
}
