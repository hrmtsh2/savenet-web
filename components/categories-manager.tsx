"use client"

import { useState, useTransition } from "react"
import { Plus, Sparkles, Tag, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { createCategory, deleteCategory, queueExistingEntityAgentPosts, saveEntityAgentConfig } from "@/app/actions"
import type { AgentConfig } from "@/lib/agents"
import type { CategoryWithCount } from "@/lib/types"

export function CategoriesManager({
  categories,
  entityAgentConfigs,
}: {
  categories: CategoryWithCount[]
  entityAgentConfigs: AgentConfig[]
}) {
  const [name, setName] = useState("")
  const [pending, startTransition] = useTransition()

  function addLabel() {
    const value = name.trim()
    if (!value) return
    const form = new FormData()
    form.set("name", value)
    startTransition(async () => {
      const result = await createCategory(form)
      if (result?.error) toast.error(result.error)
      else {
        setName("")
        toast.success("Label created")
      }
    })
  }

  return (
    <div className="flex flex-col gap-6">
      <Card className="flex flex-col gap-3 p-5 sm:flex-row sm:items-end">
        <div className="flex-1 space-y-2">
          <label htmlFor="label-name" className="text-sm font-medium">Create a label</label>
          <Input
            id="label-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault()
                addLabel()
              }
            }}
            placeholder="e.g. Weekend plans"
            maxLength={80}
          />
        </div>
        <Button onClick={addLabel} disabled={pending || !name.trim()} className="gap-2">
          <Plus className="h-4 w-4" /> Add label
        </Button>
      </Card>

      {categories.length === 0 ? (
        <p className="rounded-xl border border-dashed py-12 text-center text-sm text-muted-foreground">
          Create labels before importing posts to keep your library organised.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {categories.map((label) => <LabelCard key={label.id} label={label} agentConfig={entityAgentConfigs.find((config) => config.label_id === label.id) ?? null} />)}
        </div>
      )}
    </div>
  )
}

function LabelCard({ label, agentConfig }: { label: CategoryWithCount; agentConfig: AgentConfig | null }) {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()

  function removeLabel() {
    startTransition(async () => {
      const result = await deleteCategory(label.id)
      if (result?.error) {
        toast.error(result.error)
        return
      }
      setOpen(false)
      toast.success("Label deleted")
    })
  }

  return (
    <Card className="flex items-center gap-3 p-4">
      <Tag className="h-4 w-4 shrink-0 text-primary" />
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{label.name}</p>
        <p className="text-xs text-muted-foreground">
          {label.post_count} {label.post_count === 1 ? "post" : "posts"}
          {label.auto_created ? " · source label" : ""}
        </p>
      </div>

      <EntityAgentDialog label={label} agentConfig={agentConfig} />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Delete ${label.name}`} />}>
          <Trash2 className="h-4 w-4" />
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete “{label.name}”?</DialogTitle>
            <DialogDescription>
              Posts will remain in your library. They will retain their other labels, or become unlabeled if this is their only label.
              {label.auto_created ? " This automatic label may be recreated when new matching posts are captured." : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" disabled={pending} />}>Cancel</DialogClose>
            <Button variant="destructive" onClick={removeLabel} disabled={pending}>
              {pending ? "Deleting…" : "Delete label"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}

function EntityAgentDialog({ label, agentConfig }: { label: CategoryWithCount; agentConfig: AgentConfig | null }) {
  const [open, setOpen] = useState(false)
  const [enabled, setEnabled] = useState(agentConfig?.enabled ?? false)
  const [instructions, setInstructions] = useState(agentConfig?.instructions ?? "")
  const [allowWebResearch, setAllowWebResearch] = useState(agentConfig?.allow_web_research ?? false)
  const [pending, startTransition] = useTransition()

  function save() {
    startTransition(async () => {
      const result = await saveEntityAgentConfig({ labelId: label.id, enabled, instructions, allowWebResearch })
      if (result.error) {
        toast.error(result.error)
        return
      }
      setOpen(false)
      toast.success(enabled ? "Entity agent enabled" : "Entity agent saved")
    })
  }

  function queueExistingPosts() {
    if (!agentConfig?.enabled) return
    startTransition(async () => {
      const result = await queueExistingEntityAgentPosts(agentConfig.id)
      if (result.error) {
        toast.error(result.error)
        return
      }
      toast.success(result.totalItems ? `${result.totalItems} posts queued` : "No matching posts to process")
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Configure entity agent for ${label.name}`} />}>
        <Sparkles className={`h-4 w-4 ${agentConfig?.enabled ? "text-primary" : ""}`} />
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Entity agent for “{label.name}”</DialogTitle>
          <DialogDescription>
            Define what the agent should extract from posts carrying this label. It will later run over existing posts and new saves.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
            <div>
              <p className="text-sm font-medium">Enable agent</p>
              <p className="text-xs text-muted-foreground">Allow this label to start entity enrichment.</p>
            </div>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>

          <div className="space-y-2">
            <label htmlFor={`agent-instructions-${label.id}`} className="text-sm font-medium">Instructions</label>
            <Textarea
              id={`agent-instructions-${label.id}`}
              value={instructions}
              onChange={(event) => setInstructions(event.target.value)}
              placeholder="e.g. 'Extract restaurant or place names, neighbourhoods, menu items, prices, and useful booking details.'"
              maxLength={4000}
              className="min-h-32"
            />
          </div>

          <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
            <div>
              <p className="text-sm font-medium">Allow web research</p>
              <p className="text-xs text-muted-foreground">Permit a future agent run to gather external information as well as post content.</p>
            </div>
            <Switch checked={allowWebResearch} onCheckedChange={setAllowWebResearch} />
          </div>
        </div>

        <DialogFooter>
          {agentConfig?.enabled && <Button variant="outline" onClick={queueExistingPosts} disabled={pending}>Queue existing posts</Button>}
          <DialogClose render={<Button variant="outline" disabled={pending} />}>Cancel</DialogClose>
          <Button onClick={save} disabled={pending}>{pending ? "Saving…" : "Save agent"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
