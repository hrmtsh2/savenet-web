import { authenticateRequest } from "@/lib/auth"
import { trackServerAnalytics } from "@/lib/analytics-server"

const allowedEvents = new Set([
  "extension_popup_opened",
  "extension_capture_started",
])

export async function POST(req: Request) {
  const userId = await authenticateRequest(req)
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 })

  let body: { event?: string; properties?: Record<string, unknown> }
  try {
    body = await req.json() as typeof body
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 })
  }
  if (!body.event || !allowedEvents.has(body.event)) {
    return Response.json({ error: "Unsupported analytics event" }, { status: 400 })
  }

  const properties = Object.fromEntries(
    Object.entries(body.properties ?? {}).filter(([, value]) => (
      value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean"
    )),
  ) as Record<string, string | number | boolean | null>
  await trackServerAnalytics(body.event, userId, properties)
  return Response.json({ ok: true })
}
