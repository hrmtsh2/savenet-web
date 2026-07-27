"use client"

import { useState, useTransition } from "react"
import { KeyRound, Save } from "lucide-react"
import { toast } from "sonner"
import { saveChatModelPreference } from "@/app/actions"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import type { AiRun } from "@/lib/ai-settings"
import type { AiProvider } from "@/lib/ai-models"

type Settings = {
  chat: { provider: AiProvider; model_id: string; credential_source: "platform" | "byok" }
  credentials: { provider: AiProvider; key_hint: string }[]
  recentRuns: AiRun[]
}

export function AiSettingsPanel({ settings }: { settings: Settings }) {
  const [credentialSource, setCredentialSource] = useState<"platform" | "byok">(settings.chat.credential_source)
  const [modelId, setModelId] = useState(settings.chat.credential_source === "byok" ? settings.chat.model_id : "")
  const [apiKey, setApiKey] = useState("")
  const [pending, startTransition] = useTransition()
  const credential = settings.credentials[0]

  function save() {
    startTransition(async () => {
      const result = await saveChatModelPreference({ credentialSource, modelId, apiKey })
      if (result.error) {
        toast.error(result.error)
        return
      }
      setApiKey("")
      toast.success("Chat model updated")
    })
  }

  return (
    <div className="space-y-6">
      <Card className="space-y-5 p-5 sm:p-6">
        <div>
          <h2 className="font-medium">Chat model</h2>
          <p className="mt-1 text-sm text-muted-foreground">SaveNet uses Gemini 2.5 Flash by default. Bring one OpenRouter key to use any supported text model.</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => setCredentialSource("platform")}
            className={`rounded-lg border p-3 text-left text-sm transition-colors ${credentialSource === "platform" ? "border-primary bg-primary/5" : "hover:bg-muted"}`}
          >
            <span className="block font-medium">SaveNet default</span>
            <span className="mt-1 block text-muted-foreground">Gemini 2.5 Flash (included with SaveNet)</span>
          </button>
          <button
            type="button"
            onClick={() => setCredentialSource("byok")}
            className={`rounded-lg border p-3 text-left text-sm transition-colors ${credentialSource === "byok" ? "border-primary bg-primary/5" : "hover:bg-muted"}`}
          >
            <span className="block font-medium">OpenRouter key</span>
            <span className="mt-1 block text-muted-foreground">Choose from one of OpenRouter's supported models.</span>
          </button>
        </div>

        {credentialSource === "byok" && (
          <>
            <div className="space-y-2">
              <label htmlFor="ai-model" className="text-sm font-medium">OpenRouter model ID</label>
              <Input id="ai-model" value={modelId} onChange={(event) => setModelId(event.target.value)} placeholder="e.g. anthropic/claude-sonnet-4" maxLength={160} />
              <p className="text-xs text-muted-foreground">Use the model slug from OpenRouter, including its provider prefix. This is the entire model name, something like "gemini-2.5-flash"</p>
            </div>
            <div className="space-y-2">
              <label htmlFor="ai-key" className="text-sm font-medium">OpenRouter API key</label>
              <Input id="ai-key" type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder={credential ? `Connected ${credential.key_hint}: enter a key to replace it` : "Paste your OpenRouter API key"} autoComplete="new-password" />
              <p className="text-xs text-muted-foreground">Your key is encrypted before storage and is never displayed again.</p>
            </div>
          </>
        )}

        <Button onClick={save} disabled={pending} className="gap-2"><Save className="h-4 w-4" />{pending ? "Saving…" : "Save chat model"}</Button>
      </Card>

      <Card className="space-y-4 p-5 sm:p-6">
        <div className="flex items-center gap-2"><KeyRound className="h-4 w-4 text-primary" /><h2 className="font-medium">Recent AI activity</h2></div>
        <p className="text-sm text-muted-foreground">This is the private telemetry: model, provider, status, timing, and token usage. It never includes API keys or saved-post content.</p>
        {settings.recentRuns.length === 0 ? (
          <p className="text-sm text-muted-foreground">No AI runs yet.</p>
        ) : (
          <div className="space-y-2 text-sm">
            {settings.recentRuns.map((run) => (
              <div key={run.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-lg border px-3 py-2">
                <span>{run.feature} · {run.provider}/{run.model_id}</span>
                <span className={run.status === "succeeded" ? "text-emerald-600" : run.status === "failed" ? "text-destructive" : "text-muted-foreground"}>
                  {run.status}{run.total_tokens != null ? ` · ${run.total_tokens.toLocaleString()} tokens` : ""}{run.duration_ms != null ? ` · ${(run.duration_ms / 1000).toFixed(1)}s` : ""}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
