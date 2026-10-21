import { authenticateRequest } from "@/lib/auth"
import { createCallMeter, embedText, ocrImage, pickThumbnail, totalCalls } from "@/lib/ai"
import { fetchXOembed } from "@/lib/capture"
import { query, toVectorLiteral } from "@/lib/db"
import { attachExistingLabels, attachLabels, sourceLabelFor } from "@/lib/queries"
import { queueCaptureEntityAgents } from "@/lib/agents"
import { storeThumbnail, thumbnailKey } from "@/lib/thumbnails"
import type { CapturePayload } from "@/lib/types"

export const maxDuration = 60

export async function POST(req: Request) {
  const userId = await authenticateRequest(req)
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 })

  let body: CapturePayload
  try {
    body = await req.json() as CapturePayload
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 })
  }
  if (!body.postUrl || !body.platform) return Response.json({ error: "platform and postUrl are required" }, { status: 400 })
  if (!(["instagram", "x", "browser_bookmark", "reading_list"] as const).includes(body.platform)) {
    return Response.json({ error: "invalid platform" }, { status: 400 })
  }

  const meter = createCallMeter()
  try {
    const caption = body.caption ?? ""
    let scopeText = typeof body.raw?.scopeText === "string" ? body.raw.scopeText : undefined
    let thumbnailUrl = body.thumbnailUrl ?? ""
    const candidateImages = Array.isArray(body.raw?.candidateImages)
      ? body.raw.candidateImages.filter((url): url is string => typeof url === "string")
      : []
    if (!thumbnailUrl && candidateImages.length) {
      const picked = await pickThumbnail({
        candidates: candidateImages,
        caption,
        authorHandles: body.authorHandle ? [body.authorHandle] : undefined,
        mediaType: body.mediaType ?? null,
      }, meter)
      if (picked) thumbnailUrl = picked
    }

    const { rows: savedPosts } = await query<{ id: number }>(
      `INSERT INTO posts (
         user_id, platform, platform_post_id, post_url, caption, author_handle,
         author_name, thumbnail_url, media_type, captured_at, source_url, raw
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT (user_id, post_url) DO UPDATE SET
         platform = EXCLUDED.platform, platform_post_id = EXCLUDED.platform_post_id,
         caption = EXCLUDED.caption, author_handle = EXCLUDED.author_handle,
         author_name = EXCLUDED.author_name, thumbnail_url = EXCLUDED.thumbnail_url,
         media_type = EXCLUDED.media_type, captured_at = EXCLUDED.captured_at,
         source_url = EXCLUDED.source_url, raw = EXCLUDED.raw, updated_at = now()
       RETURNING id`,
      [userId, body.platform, body.platformPostId ?? null, body.postUrl, caption || null, body.authorHandle ?? null, body.authorName ?? null, thumbnailUrl || null, body.mediaType ?? null, body.capturedAt ?? null, body.sourceUrl ?? null, body.raw ? JSON.stringify(body.raw) : null],
    )
    const postId = savedPosts[0].id
    const storedThumbnailKey = thumbnailUrl ? thumbnailKey(userId, postId) : null
    const thumbnailStored = storedThumbnailKey ? await storeThumbnail(thumbnailUrl, storedThumbnailKey) : false

    if (body.platform === "x" && (!caption || caption.length < 60)) {
      const oembed = await fetchXOembed(body.postUrl)
      if (oembed) scopeText = `${scopeText || ""} ${oembed}`.trim().slice(0, 4000)
    }

    const collectionName = typeof body.raw?.collectionName === "string" ? body.raw.collectionName.trim() : ""
    await attachLabels(postId, userId, [
      { name: sourceLabelFor(body.platform), system: true },
      ...(body.platform === "instagram" && collectionName ? [{ name: collectionName, system: true }] : []),
    ])
    const labelIds = Array.isArray(body.labelIds)
      ? body.labelIds.filter((id): id is number => Number.isInteger(id) && id > 0).slice(0, 50)
      : []
    await attachExistingLabels(postId, userId, labelIds)

    const { rows: postLabels } = await query<{ label_id: number }>(
      "SELECT label_id FROM post_labels WHERE post_id = $1",
      [postId],
    )
    try {
      await queueCaptureEntityAgents(userId, postId, postLabels.map((label) => label.label_id))
    } catch (error) {
      console.log("[savenet] could not queue label agent:", (error as Error).message)
    }

    const summary = caption || scopeText || null
    let enrichedText = `${caption} ${scopeText ?? ""}`.trim()
    if (thumbnailUrl) {
      const ocrText = await ocrImage(thumbnailUrl, meter)
      if (ocrText) enrichedText = `${enrichedText} ${ocrText}`.trim()
    }
    const embedding = await embedText(enrichedText, meter)

    await query(
      `UPDATE posts
       SET summary = $1, enriched_text = $2, embedding = $3::vector,
           thumbnail_url = COALESCE($4, thumbnail_url),
           thumbnail_s3_key = COALESCE($5, thumbnail_s3_key),
           updated_at = now()
       WHERE id = $6 AND user_id = $7`,
      [summary, enrichedText, toVectorLiteral(embedding), thumbnailUrl || null, thumbnailStored ? storedThumbnailKey : null, postId, userId],
    )

    return Response.json({
      id: postId,
      labels: [sourceLabelFor(body.platform), ...(collectionName ? [collectionName] : [])],
      summary,
      thumbnailUrl: thumbnailUrl || null,
      thumbnailStored,
      modelCalls: totalCalls(meter),
      modelCallBreakdown: meter,
    })
  } catch (error) {
    console.log("[savenet] capture error:", (error as Error).message)
    return Response.json({ error: "Failed to capture post" }, { status: 500 })
  }
}
