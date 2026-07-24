"use client"

import { useState, useTransition } from "react"
import { Tag } from "lucide-react"
import { toast } from "sonner"
import { addLabelToFilteredPosts, addLabelToPosts } from "@/app/actions"
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
  const [labelId, setLabelId] = useState("")
  const [pending, startTransition] = useTransition()
  const availableLabels = categories.filter((label) => !excludedLabelIds.includes(label.id))
  const isSinglePost = Boolean(postIds?.length)

  function addLabel() {
    if (!labelId) return
    startTransition(async () => {
      const result = isSinglePost
        ? await addLabelToPosts({ labelId: Number(labelId), postIds: postIds || [] })
        : await addLabelToFilteredPosts({ labelId: Number(labelId), sourceLabelIds, labelMatch, searchQuery })
      if (result.error) {
        toast.error(result.error)
        return
      }
      toast.success(result.added === 0 ? "Those posts already have this label" : `Added label to ${result.added} ${result.added === 1 ? "post" : "posts"}`)
      setLabelId("")
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
          <DialogTitle>Add to a label</DialogTitle>
          <DialogDescription>
            {isSinglePost
              ? "This will keep the post’s existing labels and add one more."
              : `This will keep existing labels and add one more to all ${count} posts in the current view.`}
          </DialogDescription>
        </DialogHeader>
        <Select value={labelId} onValueChange={(value) => setLabelId(value ?? "")}>
          <SelectTrigger className="w-full"><SelectValue placeholder="Choose a label" /></SelectTrigger>
          <SelectContent>
            {availableLabels.map((label) => <SelectItem key={label.id} value={String(label.id)}>{label.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <DialogFooter>
          <DialogClose render={<Button type="button" variant="ghost" />}>Cancel</DialogClose>
          <Button type="button" onClick={addLabel} disabled={!labelId || pending}>
            Add label
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
