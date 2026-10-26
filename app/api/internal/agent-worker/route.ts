import { processNextAutoLabelItem, processNextEntityAgentItem } from "@/lib/agents"
import { processNextPostEnrichment } from "@/lib/post-enrichment"

function authorised(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  return request.headers.get("authorization") === `Bearer ${secret}`
}

export async function GET(request: Request) {
  if (!authorised(request)) return Response.json({ error: "Unauthorized" }, { status: 401 })
  const enrichmentResult = await processNextPostEnrichment()
  if (enrichmentResult.processed) return Response.json(enrichmentResult)
  const entityResult = await processNextEntityAgentItem()
  return Response.json(entityResult.processed ? entityResult : await processNextAutoLabelItem())
}
