import { getSessionUserId } from "@/lib/auth"
import { getLibraryVersion } from "@/lib/queries"
import type { LabelMatch } from "@/lib/types"

export async function GET(req: Request) {
  const userId = await getSessionUserId()
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const url = new URL(req.url)
  const labelIds = [...new Set((url.searchParams.get("labels") ?? "")
    .split(",")
    .map(Number)
    .filter((id) => Number.isInteger(id) && id > 0))]
  const labelMatch: LabelMatch = url.searchParams.get("match") === "all" ? "all" : "any"
  const searchQuery = url.searchParams.get("q")?.trim().slice(0, 200) || undefined

  return Response.json({
    version: await getLibraryVersion(userId, labelIds, labelMatch, searchQuery),
  })
}
