import { deleteStoredThumbnail } from "@/lib/thumbnails"
import { query } from "@/lib/db"

const checkInterval = "30 days"
const maxResponseBytes = 128 * 1024

type CandidatePost = {
  id: number
  user_id: string
  platform: "instagram" | "x"
  post_url: string
  thumbnail_s3_key: string | null
}

type Availability = "available" | "deleted" | "retry"

function unavailableMarker(platform: CandidatePost["platform"], body: string) {
  const text = body.toLocaleLowerCase()
  if (platform === "instagram") {
    return text.includes("sorry, this page isn't available") ||
      text.includes("this page isn't available") ||
      text.includes("page not found")
  }
  return text.includes("this page is not available") ||
    text.includes("this post is unavailable")
}

async function checkPost(post: CandidatePost): Promise<Availability> {
  try {
    const response = await fetch(post.post_url, {
      headers: { "User-Agent": "SaveNet privacy retention checker/1.0" },
      redirect: "follow",
      signal: AbortSignal.timeout(15_000),
    })
    if (response.status === 404 || response.status === 410) return "deleted"
    if (!response.ok || !response.body) return "retry"

    const reader = response.body.getReader()
    const chunks: Uint8Array[] = []
    let size = 0
    while (size < maxResponseBytes) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value) continue
      const remaining = maxResponseBytes - size
      const chunk = value.byteLength > remaining ? value.slice(0, remaining) : value
      chunks.push(chunk)
      size += chunk.byteLength
      if (size >= maxResponseBytes) break
    }
    await reader.cancel()
    const body = new TextDecoder().decode(Buffer.concat(chunks))
    return unavailableMarker(post.platform, body) ? "deleted" : "available"
  } catch (error) {
    console.log(`[savenet] could not check ${post.platform} post ${post.id}:`, (error as Error).message)
    return "retry"
  }
}

async function deletePost(post: CandidatePost) {
  if (post.thumbnail_s3_key) await deleteStoredThumbnail(post.thumbnail_s3_key)
  const { rows } = await query<{ id: number }>(
    "DELETE FROM posts WHERE id = $1 AND user_id = $2 RETURNING id",
    [post.id, post.user_id],
  )
  return rows.length > 0
}

export async function checkDeletedPosts(limit = 25) {
  const { rows: candidates } = await query<CandidatePost>(
    `SELECT id, user_id, platform, post_url, thumbnail_s3_key
     FROM posts
     WHERE platform IN ('instagram', 'x')
       AND (platform_checked_at IS NULL OR platform_checked_at < now() - $1::interval)
     ORDER BY platform_checked_at NULLS FIRST, id
     LIMIT $2`,
    [checkInterval, limit],
  )

  let checked = 0
  let deleted = 0
  let retried = 0
  for (const post of candidates) {
    const availability = await checkPost(post)
    if (availability === "retry") {
      retried += 1
      continue
    }
    if (availability === "deleted") {
      try {
        if (await deletePost(post)) deleted += 1
      } catch (error) {
        console.log(`[savenet] could not delete deleted post ${post.id}:`, (error as Error).message)
        retried += 1
        continue
      }
    } else {
      await query("UPDATE posts SET platform_checked_at = now() WHERE id = $1", [post.id])
    }
    checked += 1
  }
  return { candidates: candidates.length, checked, deleted, retried }
}
