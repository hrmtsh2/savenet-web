import { generateText, Output } from "ai"
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

export async function sendDigest(config: DigestConfig) {
  const { rows: users } = await query<{ email: string | null }>("SELECT email FROM users WHERE id = $1", [config.user_id])
  const email = users[0]?.email
  if (!email) throw new Error("No account email is available for this digest.")
  const { rows: posts } = await query<{ id: number; caption: string | null; summary: string | null; post_url: string; created_at: string }>(
    `SELECT p.id, p.caption, p.summary, p.post_url, p.created_at
     FROM posts p WHERE p.user_id = $1
       AND (cardinality($2::int[]) = 0 OR EXISTS (SELECT 1 FROM post_labels pl WHERE pl.post_id = p.id AND pl.label_id = ANY($2::int[])))
     ORDER BY p.created_at DESC LIMIT 30`,
    [config.user_id, config.label_ids],
  )
  const model = await resolveTextModel(config.user_id, "chat")
  const startedAt = Date.now()
  const telemetryId = await startAiRun({ userId: config.user_id, feature: "digest", provider: model.provider, modelId: model.model_id, credentialSource: model.credential_source })
  try {
    const result = await generateText({
      model: model.model,
      experimental_output: Output.object({ schema: digestSchema }),
      system: `Write a concise email digest using only the supplied saved posts. ${config.instructions}`,
      prompt: posts.map((post) => `[${post.id}] ${post.summary || post.caption || "Untitled"}\n${post.post_url}`).join("\n\n") || "No posts were saved in this period.",
    })
    await finishAiRun({ id: telemetryId, status: "succeeded", startedAt, usage: result.usage })
    const validIds = new Set(posts.map((post) => post.id))
    const referenced = result.experimental_output.referenced_post_ids.filter((id) => validIds.has(id))
    await sendEmail({ to: email, subject: result.experimental_output.subject, html: result.experimental_output.html, text: result.experimental_output.text })
    await query(
      `INSERT INTO digests (user_id, config_id, status, subject, html, text_content, referenced_post_ids, sent_at)
       VALUES ($1, $2, 'sent', $3, $4, $5, $6, now())`,
      [config.user_id, config.id, result.experimental_output.subject, result.experimental_output.html, result.experimental_output.text, referenced],
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
