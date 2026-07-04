import { query } from "@/lib/db"

const cognitoDomain = "https://ap-south-1gevfg0ops.auth.ap-south-1.amazoncognito.com"
const extensionClientId = process.env.COGNITO_EXTENSION_CLIENT_ID!
const extensionRedirectUri = `https://kmbfnbpogmgfmlohnajkpmeicocpedof.chromiumapp.org`

export async function POST(req: Request) {
  let body: { code?: string; codeVerifier?: string }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 })
  }

  if (!body.code || !body.codeVerifier) {
    return Response.json({ error: "Missing code or codeVerifier" }, { status: 400 })
  }

  const tokenRes = await fetch(`${cognitoDomain}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: extensionClientId,
      redirect_uri: extensionRedirectUri,
      code: body.code,
      code_verifier: body.codeVerifier,
    }),
  })

  if (!tokenRes.ok) {
    const err = await tokenRes.text()
    console.error("[extension-token] Cognito token exchange failed:", err)
    return Response.json({ error: "Token exchange failed" }, { status: 401 })
  }

  const tokens = await tokenRes.json()
  console.log("[extension-token] token keys:", Object.keys(tokens))

  const idToken = tokens.id_token as string
  const parts = idToken.split(".")
  const payloadJson = Buffer.from(parts[1], "base64").toString("utf8")
  const payload = JSON.parse(payloadJson)

  console.log("[extension-token] decoded payload keys:", Object.keys(payload))
  console.log("[extension-token] sub:", payload.sub, "type:", typeof payload.sub)
  console.log("[extension-token] email:", payload.email)

  const sub = payload.sub as string
  const email = (payload.email ?? "") as string

  if (!sub || typeof sub !== "string") {
    console.error("[extension-token] sub missing from ID token payload:", payload)
    return Response.json({ error: "Could not resolve user identity" }, { status: 500 })
  }

  // Upsert user row
  await query(
    `INSERT INTO users (id, email)
     VALUES ($1, $2)
     ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email`,
    [sub, email],
  )

  // Generate a simple opaque session token — no JWT complexity
  const sessionToken = crypto.randomUUID() + "-" + crypto.randomUUID()

  await query(
    `INSERT INTO extension_sessions (token, user_id, email)
     VALUES ($1, $2, $3)`,
    [sessionToken, sub, email],
  )

  console.log("[extension-token] session created for sub:", sub)

  return Response.json({ token: sessionToken, email })
}