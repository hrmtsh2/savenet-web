import { createGoogleGenerativeAI } from "@ai-sdk/google"
import { createOpenAI } from "@ai-sdk/openai"

export const aiProviders = ["google", "openrouter"] as const
export type AiProvider = (typeof aiProviders)[number]
export type AiFeature = "chat" | "entity_agent" | "auto_labeller" | "digest" | "digest_research"

export const platformDefaultModel = {
  provider: "google" as const,
  modelId: "gemini-2.5-flash",
  label: "Gemini 2.5 Flash (default model across SaveNet)",
}

export function isAiProvider(value: string): value is AiProvider {
  return aiProviders.includes(value as AiProvider)
}

export function createTextModel(provider: AiProvider, modelId: string, apiKey?: string) {
  if (provider === "google") return createGoogleGenerativeAI()(modelId)
  if (!apiKey) throw new Error("An OpenRouter API key is required.")

  return createOpenAI({
    apiKey,
    baseURL: "https://openrouter.ai/api/v1",
    headers: {
      "HTTP-Referer": process.env.NEXTAUTH_URL ?? "https://savenet.am1.tech",
      "X-OpenRouter-Title": "SaveNet",
    },
  })(modelId)
}
