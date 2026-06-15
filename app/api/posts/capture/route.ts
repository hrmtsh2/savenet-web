import { query, toVectorLiteral } from "@/lib/db"
import { authenticateRequest } from "@/lib/auth"
import { ensureSeedCategories, getCategories } from "@/lib/queries"
import { classifyPost, ocrImage, embedText, extractPlace, buildResolutionKey } from "@/lib/ai"
import type { CapturePayload, Category } from "@/lib/types"

export const maxDuration = 60

export async function POST(req: Request) {
  const userId = authenticateRequest(req)
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
  if (body.platform !== "instagram" && body.platform !== "x") {
    return Response.json({ error: "platform must be 'instagram' or 'x'" }, { status: 400 })
  }

  try {
    await ensureSeedCategories(userId)

    const caption = body.caption ?? ""
    const scopeText = typeof body.raw?.scopeText === "string" ? body.raw.scopeText : undefined
    const thumbnailUrl = body.thumbnailUrl ?? ""

    // 1. Upsert the base post keyed on (user_id, post_url).
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

    // 2. Classify against the user's current categories.
    const categories = await getCategories(userId)
    const classification = await classifyPost({
      caption,
      scopeText,
      categories: categories.map((c) => ({ id: c.id, name: c.name, description: c.description })),
    })

    // 3. Resolve the assigned category, creating a new one if proposed.
    let assigned: Category | undefined
    if (classification.categoryId != null) {
      assigned = categories.find((c) => c.id === classification.categoryId)
    }
    if (!assigned && classification.newCategory) {
      const created = await query<Category>(
        `INSERT INTO categories (user_id, name, description, enable_entity_resolution, auto_created)
         VALUES ($1, $2, $3, false, true)
         ON CONFLICT (user_id, lower(name)) DO UPDATE SET description = EXCLUDED.description
         RETURNING id, user_id, name, description, enable_entity_resolution, auto_created, created_at`,
        [userId, classification.newCategory.name, classification.newCategory.description],
      )
      assigned = created.rows[0]
    }

    // 4. Build enriched_text = caption + " " + summary (+ OCR text when available).
    let enrichedText = `${caption} ${classification.summary}`.trim()
    if (thumbnailUrl) {
      const ocrText = await ocrImage(thumbnailUrl)
      if (ocrText) enrichedText = `${enrichedText} ${ocrText}`.trim()
    }

    // 5. Embed enriched_text.
    const embedding = await embedText(enrichedText)

    // 6. Entity resolution when the assigned category opts in.
    let entityId: number | null = null
    if (assigned?.enable_entity_resolution) {
      const place = await extractPlace(classification.summary)
      if (place) {
        const resolutionKey = buildResolutionKey(place.name, place.location)
        const entity = await query<{ id: number }>(
          `INSERT INTO entities (resolution_key, name, location)
           VALUES ($1, $2, $3)
           ON CONFLICT (resolution_key) DO UPDATE SET
             name = EXCLUDED.name,
             location = COALESCE(EXCLUDED.location, entities.location)
           RETURNING id`,
          [resolutionKey, place.name, place.location],
        )
        entityId = entity.rows[0].id
      }
    }

    // 7. Persist enrichment results.
    await query(
      `UPDATE posts
       SET category_id = $1, summary = $2, enriched_text = $3, embedding = $4::vector, entity_id = $5, updated_at = now()
       WHERE id = $6 AND user_id = $7`,
      [assigned?.id ?? null, classification.summary, enrichedText, toVectorLiteral(embedding), entityId, postId, userId],
    )

    return Response.json({
      id: postId,
      categoryId: assigned?.id ?? null,
      categoryName: assigned?.name ?? null,
      createdNewCategory: Boolean(classification.newCategory && assigned?.auto_created),
      summary: classification.summary,
      entityId,
    })
  } catch (err) {
    console.log("[v0] capture error:", (err as Error).message)
    return Response.json({ error: "Failed to capture post", detail: (err as Error).message }, { status: 500 })
  }
}
