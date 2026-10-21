import { getStoredThumbnail } from "@/lib/thumbnails"
import { query } from "@/lib/db"
import { getSessionUserId } from "@/lib/auth"

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await getSessionUserId()
  if (!userId) return new Response("Unauthorized", { status: 401 })

  const postId = Number((await params).id)
  if (!Number.isInteger(postId) || postId < 1) return new Response("Not found", { status: 404 })
  const { rows } = await query<{ thumbnail_s3_key: string | null }>(
    "SELECT thumbnail_s3_key FROM posts WHERE id = $1 AND user_id = $2",
    [postId, userId],
  )
  const key = rows[0]?.thumbnail_s3_key
  if (!key) return new Response("Not found", { status: 404 })

  try {
    const object = await getStoredThumbnail(key)
    if (!object.Body) return new Response("Not found", { status: 404 })
    const bytes = await object.Body.transformToByteArray()
    return new Response(bytes, {
      headers: {
        "Content-Type": object.ContentType || "image/jpeg",
        "Cache-Control": "private, max-age=31536000, immutable",
        "Content-Length": String(bytes.byteLength),
      },
    })
  } catch (error) {
    console.log("[savenet] stored thumbnail read failed:", (error as Error).message)
    return new Response("Not found", { status: 404 })
  }
}
