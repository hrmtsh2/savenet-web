"use client"

import { useState, useTransition } from "react"
import { Sparkles } from "lucide-react"
import { toast } from "sonner"
import { autoLabelFilteredPosts } from "@/app/actions"
import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import type { CategoryWithCount, LabelMatch } from "@/lib/types"

export function AutoLabelDialog({ categories, sourceLabelIds, labelMatch, searchQuery, count }: { categories: CategoryWithCount[]; sourceLabelIds: number[]; labelMatch: LabelMatch; searchQuery?: string; count: number }) {
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<number[]>([])
  const [instructions, setInstructions] = useState("")
  const [pending, startTransition] = useTransition()
  const targets = categories.filter((label) => !sourceLabelIds.includes(label.id))
  function startLabelling() {
    startTransition(async () => {
      const result = await autoLabelFilteredPosts({ sourceLabelIds, labelMatch, searchQuery, destinationLabelIds: selected, instructions })
      if (result.error) {
        toast.error(result.error)
        return
      }
      toast.success(`Labelling has begun for ${result.totalItems} posts. It will complete soon.`)
      setOpen(false)
    })
  }
  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogTrigger render={<Button variant="outline" className="gap-2" />}><Sparkles className="h-4 w-4" />Auto-label view</DialogTrigger>
    <DialogContent className="sm:max-w-lg"><DialogHeader><DialogTitle>Auto-label this view</DialogTitle><DialogDescription>Classify all {count} matching posts (including posts beyond this page). Existing labels are never removed.</DialogDescription></DialogHeader>
      <div className="max-h-44 space-y-2 overflow-y-auto rounded-lg border p-3">{targets.map((label) => <label key={label.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={selected.includes(label.id)} onChange={() => setSelected(selected.includes(label.id) ? selected.filter((id) => id !== label.id) : [...selected, label.id])} />{label.name}</label>)}</div>
      <Textarea value={instructions} onChange={(event) => setInstructions(event.target.value)} placeholder="Optional guidance, e.g. apply Delhi only to places in Delhi." maxLength={2000} />
      <DialogFooter><DialogClose render={<Button variant="outline" />}>Cancel</DialogClose><Button onClick={startLabelling} disabled={!selected.length || pending}>{pending ? "Starting..." : "Start labelling"}</Button></DialogFooter>
    </DialogContent>
  </Dialog>
}
