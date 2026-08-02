"use client"

import { useState, useTransition } from "react"
import { Mail, Send } from "lucide-react"
import { toast } from "sonner"
import { saveDigestConfig, sendDigestPreview } from "@/app/actions"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import type { DigestConfig } from "@/lib/digests"
import type { CategoryWithCount } from "@/lib/types"

export function DigestSettings({ config, categories }: { config: DigestConfig | null; categories: CategoryWithCount[] }) {
  const [enabled, setEnabled] = useState(config?.enabled ?? false)
  const [instructions, setInstructions] = useState(config?.instructions ?? "")
  const [labelIds, setLabelIds] = useState(config?.label_ids ?? [])
  const [pending, startTransition] = useTransition()
  const save = () => startTransition(async () => { await saveDigestConfig({ enabled, instructions, labelIds }); toast.success("Digest settings saved") })
  const preview = () => startTransition(async () => {
    await saveDigestConfig({ enabled, instructions, labelIds })
    const result = await sendDigestPreview()
    if (result.error) {
      console.error("Digest test failed:", result.error)
      toast.error(result.error, { duration: 15_000 })
      return
    }
    toast.success("Digest sent")
  })
  return (
    <Card className="space-y-4 p-5 sm:p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 font-medium">
            <Mail className="h-4 w-4 text-primary" />
            Periodic digest
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">A personal email digest based on your saved library, delivered weekly.</p>
        </div>
        <Switch checked={enabled} onCheckedChange={setEnabled} />
      </div>

      <Textarea
        value={instructions}
        onChange={(event) => setInstructions(event.target.value)}
        placeholder="e.g. Every weekend, suggest two restaurant plans and one project to try."
        maxLength={4000}
      />

      <div className="space-y-2">
        <p className="text-sm font-medium">Limit to labels</p>
        {categories.map((label) => (
          <label key={label.id} className="mr-4 inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={labelIds.includes(label.id)}
              onChange={() => setLabelIds(labelIds.includes(label.id) ? labelIds.filter((id) => id !== label.id) : [...labelIds, label.id])}
            />
            {label.name}
          </label>
        ))}
      </div>

      <div className="flex gap-2">
        <Button onClick={save} disabled={pending}>Save digest</Button>
        <Button variant="outline" onClick={preview} disabled={pending}>
          <Send className="h-4 w-4" />
          Send test
        </Button>
      </div>
    </Card>
  )
}
