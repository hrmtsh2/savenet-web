"use client"

import { useState, useTransition } from "react"
import { Sparkles, Tag } from "lucide-react"
import { toast } from "sonner"
import { addLabelToFilteredPosts, addLabelToPosts, autoLabelFilteredPosts, createLabelAndAddToFilteredPosts } from "@/app/actions"
import { Button } from "@/components/ui/button"
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import type { CategoryWithCount, LabelMatch } from "@/lib/types"

type Props = {
  categories: CategoryWithCount[]
  postIds?: number[]
  sourceLabelIds?: number[]
  labelMatch?: LabelMatch
  searchQuery?: string
  count: number
  excludedLabelIds?: number[]
  compact?: boolean
}

export function AddPostsToLabelDialog({
  categories,
  postIds,
  sourceLabelIds,
  labelMatch,
  searchQuery,
  count,
  excludedLabelIds = [],
  compact = false,
}: Props) {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<"manual" | "auto">("manual")
  const [labelId, setLabelId] = useState("")
  const [selectedLabelIds, setSelectedLabelIds] = useState<number[]>([])
  const [newLabelName, setNewLabelName] = useState("")
  const [instructions, setInstructions] = useState("")
  const [pending, startTransition] = useTransition()
  const availableLabels = categories.filter((label) => !excludedLabelIds.includes(label.id))
  const isSinglePost = Boolean(postIds?.length)
  const autoLabelTargets = categories.filter((label) => !sourceLabelIds?.includes(label.id))

  function addLabel() {
    const name = newLabelName.trim()
    if (!labelId && !name) return
    startTransition(async () => {
      const result = !isSinglePost && name
        ? await createLabelAndAddToFilteredPosts({ name, sourceLabelIds, labelMatch, searchQuery })
        : isSinglePost
        ? await addLabelToPosts({ labelId: Number(labelId), postIds: postIds || [] })
        : await addLabelToFilteredPosts({ labelId: Number(labelId), sourceLabelIds, labelMatch, searchQuery })
      if (result.error) {
        toast.error(result.error)
        return
      }
      toast.success(result.added === 0 ? "Those posts already have this label" : `Added label to ${result.added} ${result.added === 1 ? "post" : "posts"}`)
      setLabelId("")
      setNewLabelName("")
      setOpen(false)
    })
  }

  function autoLabel() {
    startTransition(async () => {
      const result = await autoLabelFilteredPosts({
        sourceLabelIds: sourceLabelIds || [],
        labelMatch: labelMatch || "any",
        searchQuery,
        destinationLabelIds: selectedLabelIds,
        instructions,
      })
      if (result.error) {
        toast.error(result.error)
        return
      }
      toast.success(`Labelling has begun for ${result.totalItems} posts. It will complete soon.`)
      setSelectedLabelIds([])
      setInstructions("")
      setOpen(false)
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="outline" size={compact ? "sm" : "default"} className={compact ? "h-7 gap-1.5 px-2" : "gap-2"} disabled={availableLabels.length === 0} />
        }
      >
        <Tag className="h-3.5 w-3.5" />
        {compact ? "Add label" : "Add posts to label"}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === "auto" ? "Auto-label this view" : "Add to a label"}</DialogTitle>
          <DialogDescription>
            {mode === "auto"
              ? `Classify all ${count} matching posts. Existing labels are never removed.`
              : isSinglePost
              ? "This will keep the post’s existing labels and add one more."
              : `This will keep existing labels and add one more to all ${count} posts in the current view.`}
          </DialogDescription>
        </DialogHeader>
        {!isSinglePost ? (
          <div className="grid grid-cols-2 gap-2 rounded-lg border p-1">
            <Button type="button" variant={mode === "manual" ? "secondary" : "ghost"} onClick={() => setMode("manual")}>
              <Tag className="h-4 w-4" /> Add label
            </Button>
            <Button type="button" variant={mode === "auto" ? "secondary" : "ghost"} onClick={() => setMode("auto")}>
              <Sparkles className="h-4 w-4" /> Auto-label
            </Button>
          </div>
        ) : null}
        {mode === "auto" ? (
          <>
            <div className="max-h-44 space-y-2 overflow-y-auto rounded-lg border p-3">
              {autoLabelTargets.map((label) => (
                <label key={label.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={selectedLabelIds.includes(label.id)}
                    onChange={() => setSelectedLabelIds((current) => current.includes(label.id)
                      ? current.filter((id) => id !== label.id)
                      : [...current, label.id])}
                  />
                  {label.name}
                </label>
              ))}
            </div>
            <Textarea value={instructions} onChange={(event) => setInstructions(event.target.value)} placeholder="Optional guidance, e.g. apply Delhi only to places in Delhi." maxLength={2000} />
          </>
        ) : (
          <>
            <Select value={labelId} onValueChange={(value) => setLabelId(value ?? "")}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Choose a label" /></SelectTrigger>
              <SelectContent>
                {availableLabels.map((label) => <SelectItem key={label.id} value={String(label.id)}>{label.name}</SelectItem>)}
              </SelectContent>
            </Select>
            {!isSinglePost ? (
              <div className="space-y-2">
                <p className="text-center text-xs text-muted-foreground">or create a new label for this view</p>
                <Input
                  value={newLabelName}
                  onChange={(event) => setNewLabelName(event.target.value)}
                  placeholder="New label name"
                  maxLength={100}
                />
              </div>
            ) : null}
          </>
        )}
        <DialogFooter>
          <DialogClose render={<Button type="button" variant="ghost" />}>Cancel</DialogClose>
          <Button
            type="button"
            onClick={mode === "auto" ? autoLabel : addLabel}
            disabled={mode === "auto" ? !selectedLabelIds.length || pending : (!labelId && !newLabelName.trim()) || pending}
          >
            {mode === "auto" ? "Start labelling" : "Add label"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
