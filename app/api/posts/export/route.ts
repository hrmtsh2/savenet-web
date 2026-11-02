import { authenticateRequest, getSessionUserId } from "@/lib/auth"
import { getPostsCount, getPostsForUser } from "@/lib/queries"
import type { LabelMatch } from "@/lib/types"

export async function GET(req: Request) {
  const userId = await getSessionUserId() ?? await authenticateRequest(req)
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const url = new URL(req.url)
  const labelIds = [...new Set((url.searchParams.get("labels") ?? "")
    .split(",")
    .map(Number)
    .filter((id) => Number.isInteger(id) && id > 0))]
  const labelMatch: LabelMatch = url.searchParams.get("match") === "all" ? "all" : "any"
  const searchQuery = url.searchParams.get("q")?.trim().slice(0, 200) || undefined
  const total = await getPostsCount(userId, labelIds, labelMatch, searchQuery)
  const posts = total > 0
    ? await getPostsForUser(userId, {
        labelIds,
        labelMatch,
        limit: total,
        offset: 0,
        searchQuery,
      })
    : []
  const exportedPosts = posts.map((post) => ({
    ...post,
    raw: Object.fromEntries(Object.entries(post.raw ?? {}).filter(([key]) => key !== "candidateImages")),
  }))

  return Response.json({
    exportedAt: new Date().toISOString(),
    filters: {
      labelIds,
      labelMatch,
      searchQuery: searchQuery ?? null,
    },
    posts: exportedPosts,
  })
}
