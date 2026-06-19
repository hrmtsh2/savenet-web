import { query } from "@/lib/db"
import { SignJWT } from "jose"

const secret = new TextEncoder().encode(process.env.NEXTAUTH_SECRET!)
const cognitoDomain = "https://ap-south-1gevfg0ops.auth.ap-south-1.amazoncognito.com"
const extensionClientId = process.env.COGNITO_EXTENSION_CLIENT_ID!
const extensionRedirectUri = `https://achceaepckifblghhnbedcladddiailp.chromiumapp.org/`

export async function POST(req: Request) {
  let body: { code?: string; codeVerifier?: string }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 })
  }

  if (!body.code) {
    return Response.json({ error: "Missing code or codeVerifier" }, { status: 400 })
  }

  // Exchange auth code for Cognito tokens
  const tokenRes = await fetch(`${cognitoDomain}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: extensionClientId,
      redirect_uri: extensionRedirectUri,
      code: body.code,
      code_verifier: body.codeVerifier
    }),
  })

  if (!tokenRes.ok) {
    const err = await tokenRes.text()
    console.error("[extension-token] Cognito token exchange failed:", err)
    return Response.json({ error: "Token exchange failed" }, { status: 401 })
  }

  const tokens = await tokenRes.json()

  // Decode the ID token to get the user's sub and email
  const [, payloadB64] = (tokens.id_token as string).split(".")
  const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString())
  const sub: string = payload.sub
  const email: string = payload.email ?? ""

  // Upsert user row (same as the NextAuth jwt callback does for web logins)
  await query(
    `INSERT INTO users (id, email)
     VALUES ($1, $2)
     ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email`,
    [sub, email],
  )

  // Mint a simple signed JWT the extension will use as its Bearer token.
  // This avoids sending Cognito's own tokens (which are large and rotate)
  // and gives us a stable, verifiable token we control.
  const savenetToken = await new SignJWT({ sub, email })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secret)

  return Response.json({ token: savenetToken, email })
}