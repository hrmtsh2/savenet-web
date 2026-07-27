import { decryptApiKey } from "@/lib/ai-credentials"
import { createTextModel, isAiProvider, platformDefaultModel, type AiFeature, type AiProvider } from "@/lib/ai-models"
import { query } from "@/lib/db"

type CredentialRow = {
  provider: AiProvider
  encrypted_api_key: string
  key_hint: string
}

type PreferenceRow = {
  provider: string
  model_id: string
  credential_source: "platform" | "byok"
}

type ResolvedPreference = Omit<PreferenceRow, "provider"> & { provider: AiProvider }

const defaultPreference: ResolvedPreference = {
  provider: platformDefaultModel.provider,
  model_id: platformDefaultModel.modelId,
  credential_source: "platform",
}

export type AiRun = {
  id: number
  feature: string
  provider: string
  model_id: string
  credential_source: string
  status: string
  input_tokens: number | null
  output_tokens: number | null
  total_tokens: number | null
  duration_ms: number | null
  error_message: string | null
  created_at: string
}

export async function getAiSettings(userId: string) {
  const [{ rows: preferences }, { rows: credentials }, { rows: recentRuns }] = await Promise.all([
    query<PreferenceRow>("SELECT provider, model_id, credential_source FROM ai_model_preferences WHERE user_id = $1 AND feature = 'chat'", [userId]),
    query<{ provider: AiProvider; key_hint: string }>("SELECT provider, key_hint FROM ai_provider_credentials WHERE user_id = $1 AND provider = 'openrouter'", [userId]),
    query<AiRun>(
      `SELECT id, feature, provider, model_id, credential_source, status, input_tokens, output_tokens, total_tokens, duration_ms, error_message, created_at
       FROM ai_runs WHERE user_id = $1 ORDER BY created_at DESC LIMIT 10`,
      [userId],
    ),
  ])

  const chat: ResolvedPreference = preferences[0] && isAiProvider(preferences[0].provider)
    ? { ...preferences[0], provider: preferences[0].provider }
    : defaultPreference

  return {
    chat,
    credentials,
    recentRuns,
  }
}

export async function resolveTextModel(userId: string, feature: AiFeature) {
  const { rows: preferences } = await query<PreferenceRow>(
    "SELECT provider, model_id, credential_source FROM ai_model_preferences WHERE user_id = $1 AND feature = $2",
    [userId, feature],
  )
  const preference: ResolvedPreference = preferences[0] && isAiProvider(preferences[0].provider)
    ? { ...preferences[0], provider: preferences[0].provider }
    : defaultPreference

  if (preference.credential_source === "platform") {
    return { ...preference, model: createTextModel(preference.provider, preference.model_id) }
  }

  const { rows: credentials } = await query<CredentialRow>(
    "SELECT provider, encrypted_api_key, key_hint FROM ai_provider_credentials WHERE user_id = $1 AND provider = $2",
    [userId, preference.provider],
  )
  const credential = credentials[0]
  if (!credential) throw new Error(`No ${preference.provider} API key is connected`)

  return {
    ...preference,
    model: createTextModel(preference.provider, preference.model_id, decryptApiKey(credential.encrypted_api_key)),
  }
}

export async function startAiRun(input: {
  userId: string
  feature: AiFeature
  provider: AiProvider
  modelId: string
  credentialSource: "platform" | "byok"
}) {
  const { rows } = await query<{ id: number }>(
    `INSERT INTO ai_runs (user_id, feature, provider, model_id, credential_source, status)
     VALUES ($1, $2, $3, $4, $5, 'running') RETURNING id`,
    [input.userId, input.feature, input.provider, input.modelId, input.credentialSource],
  )
  return rows[0]?.id ?? null
}

export async function finishAiRun(input: {
  id: number | null
  status: "succeeded" | "failed"
  startedAt: number
  usage?: { inputTokens?: number | null; outputTokens?: number | null; totalTokens?: number | null }
  error?: unknown
}) {
  if (!input.id) return
  const errorMessage = input.error instanceof Error ? input.error.message.slice(0, 500) : null
  await query(
    `UPDATE ai_runs
     SET status = $2, input_tokens = $3, output_tokens = $4, total_tokens = $5,
         duration_ms = $6, error_message = $7, completed_at = now()
     WHERE id = $1`,
    [
      input.id,
      input.status,
      input.usage?.inputTokens ?? null,
      input.usage?.outputTokens ?? null,
      input.usage?.totalTokens ?? null,
      Date.now() - input.startedAt,
      errorMessage,
    ],
  )
}
