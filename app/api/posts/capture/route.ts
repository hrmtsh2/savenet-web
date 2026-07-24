import { query, toVectorLiteral } from "@/lib/db"
import { authenticateRequest } from "@/lib/auth"
import { attachExistingLabels, attachLabels, sourceLabelFor } from "@/lib/queries"
import {
  ocrImage,
  embedText,
  extractEntity,
  buildResolutionKey,
  pickThumbnail,
  findEntityImage,
  createCallMeter,
  totalCalls,
  fetchAndExtractUrl,
  extractUrls,
  fetchXOembed
} from "@/lib/ai"
import type { CapturePayload, FurtherReadingItem } from "@/lib/types"

export const maxDuration = 60

export async function POST(req: Request) {
  const userId = await authenticateRequest(req)
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: CapturePayload
  try {
    body = (await req.json()) as CapturePayload
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  if (!body.postUrl || !body.platform) {
    return Response.json({ error: "platform and postUrl are required" }, { status: 400 })
  }
  if (!["instagram", "x", "browser_bookmark", "reading_list"].includes(body.platform)) {
    return Response.json({ error: "invalid platform" }, { status: 400 })
  }

  const meter = createCallMeter()

  try {
    const caption = body.caption ?? ""
    let scopeText = typeof body.raw?.scopeText === "string" ? body.raw.scopeText : undefined

    let thumbnailUrl = body.thumbnailUrl ?? ""
    const candidateImages = Array.isArray(body.raw?.candidateImages)
      ? (body.raw!.candidateImages as unknown[]).filter((u): u is string => typeof u === "string")
      : []
    if (!thumbnailUrl && candidateImages.length > 0) {
      const picked = await pickThumbnail(
        {
          candidates: candidateImages,
          caption,
          authorHandles: body.authorHandle ? [body.authorHandle] : undefined,
          mediaType: body.mediaType ?? null,
        },
        meter,
      )
      if (picked) thumbnailUrl = picked
    }

    const upsert = await query<{ id: number }>(
      `INSERT INTO posts (
         user_id, platform, platform_post_id, post_url, caption, author_handle,
         author_name, thumbnail_url, media_type, captured_at, source_url, raw
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT (user_id, post_url) DO UPDATE SET
         platform = EXCLUDED.platform,
         platform_post_id = EXCLUDED.platform_post_id,
         caption = EXCLUDED.caption,
         author_handle = EXCLUDED.author_handle,
         author_name = EXCLUDED.author_name,
         thumbnail_url = EXCLUDED.thumbnail_url,
         media_type = EXCLUDED.media_type,
         captured_at = EXCLUDED.captured_at,
         source_url = EXCLUDED.source_url,
         raw = EXCLUDED.raw,
         updated_at = now()
       RETURNING id`,
      [
        userId,
        body.platform,
        body.platformPostId ?? null,
        body.postUrl,
        caption || null,
        body.authorHandle ?? null,
        body.authorName ?? null,
        thumbnailUrl || null,
        body.mediaType ?? null,
        body.capturedAt ?? null,
        body.sourceUrl ?? null,
        body.raw ? JSON.stringify(body.raw) : null,
      ],
    )
    const postId = upsert.rows[0].id

    if (body.platform === "x" && (!caption || caption.length < 60)) {
      const oembed = await fetchXOembed(body.postUrl)
      if (oembed) {
        const existingScope = scopeText || ""        
        scopeText = `${existingScope} ${oembed}`.trim().slice(0, 4000)
      }
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

    const summary = caption || scopeText || null
    let enrichedText = `${caption} ${scopeText ?? ""}`.trim()
    if (thumbnailUrl) {
      const ocrText = await ocrImage(thumbnailUrl, meter)
      if (ocrText) enrichedText = `${enrichedText} ${ocrText}`.trim()
    }
    let furtherReading: FurtherReadingItem[] = []
    const isUrlPrimary = body.platform === "browser_bookmark" || body.platform === "reading_list"
    if (isUrlPrimary || extractUrls(caption).length > 0) {
      const urls = isUrlPrimary 
        ? [body.postUrl]  // the bookmark URL itself is the primary source
        : extractUrls(caption)
      
      const allUrls = [...new Set(urls)].slice(0, 3)
      for (const url of allUrls) {
        const extracted = await fetchAndExtractUrl(
          url, "Saved post", null, meter
        )
        if (extracted) furtherReading.push(extracted)
      }
    }

    const embedding = await embedText(enrichedText, meter)

    let entityId: number | null = null
    let resolvedEntity: { name: string; location: string | null } | null = null
    if (summary) {
      const entity = await extractEntity(
        {
          summary,
          categoryName: "Saved post",
          categoryDescription: null,
        },
        meter,
      )
      if (entity) {
        resolvedEntity = { name: entity.name, location: entity.location }
        const resolutionKey = buildResolutionKey(entity.entityType, entity.name, entity.location)
        const row = await query<{ id: number }>(
          `INSERT INTO entities (resolution_key, name, location, entity_type)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (resolution_key) DO UPDATE SET
             name = EXCLUDED.name,
             location = COALESCE(EXCLUDED.location, entities.location),
             entity_type = EXCLUDED.entity_type
           RETURNING id`,
          [resolutionKey, entity.name, entity.location, entity.entityType],
        )
        entityId = row.rows[0].id
      }
    }

    // 5b. Thumbnail fallback: if we still have no image but resolved an entity,
    // try to find a representative photo for it via grounded search.
    // Best-effort — may return null, in which case the card shows a placeholder.
    if (!thumbnailUrl && resolvedEntity) {
      const entityImage = await findEntityImage(resolvedEntity.name, resolvedEntity.location, meter)
      if (entityImage) thumbnailUrl = entityImage
    }

    await query(
      `UPDATE posts
       SET summary = $1, enriched_text = $2, embedding = $3::vector, entity_id = $4,
           thumbnail_url = COALESCE($5, thumbnail_url), further_reading = $6, updated_at = now()
       WHERE id = $7 AND user_id = $8`,
      [
        summary,
        enrichedText,
        toVectorLiteral(embedding),
        entityId,
        thumbnailUrl || null,
        furtherReading.length > 0 ? JSON.stringify(furtherReading) : null,
        postId,
        userId,
      ],
    )

    return Response.json({
      id: postId,
      labels: [sourceLabelFor(body.platform), ...(collectionName ? [collectionName] : [])],
      summary,
      entityId,
      thumbnailUrl: thumbnailUrl || null,
      modelCalls: totalCalls(meter),
      modelCallBreakdown: meter,
    })
  } catch (err) {
    console.log("[v0] capture error:", (err as Error).message)
    return Response.json({ error: "Failed to capture post", detail: (err as Error).message }, { status: 500 })
  }
}
