import { generateText, Output } from "ai"
import { google } from "@ai-sdk/google"
import { z } from "zod"
import { resolveTextModel, finishAiRun, startAiRun } from "@/lib/ai-settings"
import { sendEmail } from "@/lib/email"
import { query } from "@/lib/db"

export type DigestConfig = {
  id: number
  user_id: string
  enabled: boolean
  schedule_expression: string
  timezone: string
  instructions: string
  label_ids: number[]
}

export async function getDigestConfig(userId: string) {
  const { rows } = await query<DigestConfig>(
    "SELECT id, user_id, enabled, schedule_expression, timezone, instructions, label_ids FROM digest_configs WHERE user_id = $1",
    [userId],
  )
  return rows[0] ?? null
}

const digestSchema = z.object({
  subject: z.string().max(255),
  text: z.string(),
  html: z.string(),
  referenced_post_ids: z.array(z.number()),
})

type DigestPost = {
  id: number
  caption: string | null
  summary: string | null
  post_url: string
  created_at: string
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]!)
}

function digestLinks(posts: DigestPost[], referencedIds: number[]) {
  const byId = new Map(posts.map((post) => [post.id, post]))
  const referenced = [...new Set(referencedIds)].map((id) => byId.get(id)).filter((post): post is DigestPost => Boolean(post))
  const selected = (referenced.length ? referenced : posts).slice(0, 10)
  const links = selected.flatMap((post) => {
    try {
      const url = new URL(post.post_url)
      if (url.protocol !== "https:" && url.protocol !== "http:") return []
      const title = (post.summary || post.caption || "Saved post").replace(/\s+/g, " ").trim().slice(0, 140)
      return [{ postId: post.id, title: title || "Saved post", url: url.toString() }]
    } catch {
      return []
    }
  })
  if (!links.length) return { html: "", text: "", postIds: [] }
  return {
    html: `<hr><h2>Saved links</h2><ul>${links.map((link) => `<li><a href="${escapeHtml(link.url)}">${escapeHtml(link.title)}</a></li>`).join("")}</ul>`,
    text: `\n\nSaved links:\n${links.map((link) => `- ${link.title}: ${link.url}`).join("\n")}`,
    postIds: links.map((link) => link.postId),
  }
}

type ResearchSource = { title: string; url: string }

async function researchDigest(config: DigestConfig, posts: DigestPost[]): Promise<ResearchSource[]> {
  if (!config.instructions.trim() || posts.length === 0) return []
  const startedAt = Date.now()
  const telemetryId = await startAiRun({
    userId: config.user_id,
    feature: "digest_research",
    provider: "google",
    modelId: "gemini-2.5-flash",
    credentialSource: "platform",
  })
  try {
    const result = await generateText({
      model: google("gemini-2.5-flash"),
      tools: { google_search: google.tools.googleSearch({}) },
      system: [
        "You are the research stage of a personal saved-content digest.",
        "Decide whether the user's instructions need current, external information beyond their saved posts.",
        "Use Google Search only when it materially improves the digest, such as for current menus, prices, availability, events, project documentation, or further reading.",
        "Do not search merely to summarise the user's own saves. Prefer primary or authoritative sources.",
      ].join(" "),
      prompt: [
        `User's digest instructions:\n${config.instructions}`,
        "Saved posts:",
        ...posts.map((post) => `[${post.id}] ${post.summary || post.caption || "Untitled"}\n${post.post_url}`),
      ].join("\n\n"),
    })
    await finishAiRun({ id: telemetryId, status: "succeeded", startedAt, usage: result.usage })
    return result.sources
      .flatMap((source) => {
        if (source.sourceType !== "url") return []
        try {
          const url = new URL(source.url)
          if (url.protocol !== "https:" && url.protocol !== "http:") return []
          return [{ title: source.title || url.hostname, url: url.toString() }]
        } catch {
          return []
        }
      })
      .filter((source, index, sources) => sources.findIndex((candidate) => candidate.url === source.url) === index)
      .slice(0, 8)
  } catch (error) {
    await finishAiRun({ id: telemetryId, status: "failed", startedAt, error })
    console.error(`Digest research failed for config ${config.id}`, error)
    return []
  }
}

function researchLinks(sources: ResearchSource[]) {
  if (!sources.length) return { html: "", text: "" }
  return {
    html: `<hr><h2>Further reading</h2><ul>${sources.map((source) => `<li><a href="${escapeHtml(source.url)}">${escapeHtml(source.title)}</a></li>`).join("")}</ul>`,
    text: `\n\nFurther reading:\n${sources.map((source) => `- ${source.title}: ${source.url}`).join("\n")}`,
  }
}

export async function sendDigest(config: DigestConfig) {
  const { rows: users } = await query<{ email: string | null }>("SELECT email FROM users WHERE id = $1", [config.user_id])
  const email = users[0]?.email
  if (!email) throw new Error("No account email is available for this digest.")
  const { rows: posts } = await query<DigestPost>(
    `WITH recent_digests AS (
       SELECT referenced_post_ids
       FROM digests
       WHERE config_id = $3 AND status = 'sent'
       ORDER BY sent_at DESC
       LIMIT 4
     ), recently_featured AS (
       SELECT DISTINCT unnest(referenced_post_ids) AS post_id
       FROM recent_digests
     )
     SELECT p.id, p.caption, p.summary, p.post_url, p.created_at
     FROM posts p
     LEFT JOIN recently_featured featured ON featured.post_id = p.id
     WHERE p.user_id = $1
       AND (cardinality($2::int[]) = 0 OR EXISTS (SELECT 1 FROM post_labels pl WHERE pl.post_id = p.id AND pl.label_id = ANY($2::int[])))
     ORDER BY (featured.post_id IS NULL) DESC, p.created_at DESC
     LIMIT 30`,
    [config.user_id, config.label_ids, config.id],
  )
  const model = await resolveTextModel(config.user_id, "chat")
  const startedAt = Date.now()
  const telemetryId = await startAiRun({ userId: config.user_id, feature: "digest", provider: model.provider, modelId: model.model_id, credentialSource: model.credential_source })
  try {
    const sources = await researchDigest(config, posts)
    const result = await generateText({
      model: model.model,
      experimental_output: Output.object({ schema: digestSchema }),
      system: `Write a concise personal SaveNet digest using only the supplied saved posts. Follow the user's instructions as the primary direction for the digest's focus and format. ${config.instructions}`,
      prompt: [
        posts.map((post) => `[${post.id}] ${post.summary || post.caption || "Untitled"}\n${post.post_url}`).join("\n\n") || "No posts were saved in this period.",
        sources.length ? `Web research sources:\n${sources.map((source) => `- ${source.title}: ${source.url}`).join("\n")}` : "",
      ].filter(Boolean).join("\n\n"),
    })
    await finishAiRun({ id: telemetryId, status: "succeeded", startedAt, usage: result.usage })
    const validIds = new Set(posts.map((post) => post.id))
    const referenced = result.experimental_output.referenced_post_ids.filter((id) => validIds.has(id))
    const links = digestLinks(posts, referenced)
    const furtherReading = researchLinks(sources)
    const html = `${result.experimental_output.html}${links.html}${furtherReading.html}`
    const text = `${result.experimental_output.text}${links.text}${furtherReading.text}`
    await sendEmail({ to: email, subject: result.experimental_output.subject, html, text })
    await query(
      `INSERT INTO digests (user_id, config_id, status, subject, html, text_content, referenced_post_ids, sent_at)
       VALUES ($1, $2, 'sent', $3, $4, $5, $6, now())`,
      [config.user_id, config.id, result.experimental_output.subject, html, text, links.postIds],
    )
  } catch (error) {
    await finishAiRun({ id: telemetryId, status: "failed", startedAt, error })
    throw error
  }
}

const scheduleDays: Record<string, number> = {
  SUN: 0,
  MON: 1,
  TUE: 2,
  WED: 3,
  THU: 4,
  FRI: 5,
  SAT: 6,
}

function isDueNow(config: DigestConfig, now = new Date()) {
  const match = /^cron\((\d{1,2}) (\d{1,2}) \? \* (SUN|MON|TUE|WED|THU|FRI|SAT) \*\)$/.exec(config.schedule_expression)
  if (!match) return false
  const [, minute, hour, day] = match
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: config.timezone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now)
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value)
  const weekday = parts.find((part) => part.type === "weekday")?.value.toUpperCase()
  const scheduledMinute = Number(minute)
  return weekday != null && scheduleDays[weekday] === scheduleDays[day] && value("hour") === Number(hour) && value("minute") >= scheduledMinute && value("minute") < scheduledMinute + 5
}

async function sentToday(config: DigestConfig) {
  const { rows } = await query<{ sent: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM digests
       WHERE config_id = $1 AND status = 'sent'
         AND sent_at >= (date_trunc('day', now() AT TIME ZONE $2) AT TIME ZONE $2)
     ) AS sent`,
    [config.id, config.timezone],
  )
  return rows[0]?.sent ?? false
}

export async function sendDueDigests() {
  const { rows: configs } = await query<DigestConfig>(
    "SELECT id, user_id, enabled, schedule_expression, timezone, instructions, label_ids FROM digest_configs WHERE enabled = true",
  )
  let sent = 0
  let failed = 0
  for (const config of configs) {
    if (!isDueNow(config) || await sentToday(config)) continue
    try {
      await sendDigest(config)
      sent += 1
    } catch (error) {
      failed += 1
      console.error(`Failed to send digest for config ${config.id}`, error)
    }
  }
  return { checked: configs.length, sent, failed }
}
