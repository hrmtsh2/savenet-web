"use server"

import { revalidatePath } from "next/cache"
import { query, toVectorLiteral } from "@/lib/db"
import { DEFAULT_USER_ID } from "@/lib/auth"
import { ensureSeedCategories, getCategories } from "@/lib/queries"
import { classifyPost, embedText } from "@/lib/ai"
import type { Category } from "@/lib/types"

const userId = DEFAULT_USER_ID

export async function createCategory(formData: FormData) {
  const name = String(formData.get("name") || "").trim()
  const description = String(formData.get("description") || "").trim()
  const enableEntityResolution = formData.get("enable_entity_resolution") === "on"
  if (!name) return { error: "Name is required" }

  await ensureSeedCategories(userId)
  await query(
    `INSERT INTO categories (user_id, name, description, enable_entity_resolution, auto_created)
     VALUES ($1, $2, $3, $4, false)
     ON CONFLICT (user_id, lower(name)) DO NOTHING`,
    [userId, name, description || null, enableEntityResolution],
  )
  revalidatePath("/categories")
  revalidatePath("/library")
  return { ok: true }
}

export async function updateCategory(formData: FormData) {
  const id = Number(formData.get("id"))
  const name = String(formData.get("name") || "").trim()
  const description = String(formData.get("description") || "").trim()
  const enableEntityResolution = formData.get("enable_entity_resolution") === "on"
  if (!id || !name) return { error: "Name is required" }

  await query(
    `UPDATE categories
     SET name = $1, description = $2, enable_entity_resolution = $3
     WHERE id = $4 AND user_id = $5`,
    [name, description || null, enableEntityResolution, id, userId],
  )
  revalidatePath("/categories")
  revalidatePath("/library")
  return { ok: true }
}

export async function deleteCategory(formData: FormData) {
  const id = Number(formData.get("id"))
  if (!id) return { error: "Missing id" }
  // Posts move to Uncategorized via ON DELETE SET NULL.
  await query("DELETE FROM categories WHERE id = $1 AND user_id = $2", [id, userId])
  revalidatePath("/categories")
  revalidatePath("/library")
  return { ok: true }
}

export async function mergeCategories(formData: FormData) {
  const fromId = Number(formData.get("from_id"))
  const toId = Number(formData.get("to_id"))
  if (!fromId || !toId || fromId === toId) return { error: "Pick two different categories" }

  // Reassign posts from A to B, then delete A.
  await query("UPDATE posts SET category_id = $1, updated_at = now() WHERE category_id = $2 AND user_id = $3", [
    toId,
    fromId,
    userId,
  ])
  await query("DELETE FROM categories WHERE id = $1 AND user_id = $2", [fromId, userId])
  revalidatePath("/categories")
  revalidatePath("/library")
  return { ok: true }
}

export async function resortUncategorized() {
  await ensureSeedCategories(userId)
  const categories = await getCategories(userId)

  const { rows: posts } = await query<{ id: number; caption: string | null; raw: { scopeText?: string } | null }>(
    "SELECT id, caption, raw FROM posts WHERE user_id = $1 AND category_id IS NULL",
    [userId],
  )

  let sorted = 0
  for (const post of posts) {
    const caption = post.caption ?? ""
    const scopeText = typeof post.raw?.scopeText === "string" ? post.raw.scopeText : undefined

    const classification = await classifyPost({
      caption,
      scopeText,
      categories: categories.map((c) => ({ id: c.id, name: c.name, description: c.description })),
    })

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
      categories.push(assigned)
    }

    if (!assigned) continue

    const enrichedText = `${caption} ${classification.summary}`.trim()
    const embedding = await embedText(enrichedText)

    await query(
      `UPDATE posts SET category_id = $1, summary = $2, enriched_text = $3, embedding = $4::vector, updated_at = now()
       WHERE id = $5 AND user_id = $6`,
      [assigned.id, classification.summary, enrichedText, toVectorLiteral(embedding), post.id, userId],
    )
    sorted += 1
  }

  revalidatePath("/categories")
  revalidatePath("/library")
  return { ok: true, sorted }
}
