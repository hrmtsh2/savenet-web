"use client"

import { useState, useTransition } from "react"
import { MapPin, Pencil, Plus, Trash2, GitMerge, Sparkles, Wand2, RefreshCw, Info } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Separator } from "@/components/ui/separator"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  createCategory,
  updateCategory,
  deleteCategory,
  mergeCategories,
  resortUncategorized,
  recategorizeAll,
  backfillEntityResolution,
} from "@/app/actions"
import type { CategoryWithCount } from "@/lib/types"

interface Props {
  categories: CategoryWithCount[]
  uncategorizedCount: number
}

export function CategoriesManager({ categories, uncategorizedCount }: Props) {
  const [pending, startTransition] = useTransition()
  const totalPosts = categories.reduce((sum, c) => sum + c.post_count, 0) + uncategorizedCount

  function run(
    action: () => Promise<{
      ok?: boolean
      error?: string
      sorted?: number
      total?: number
      moved?: number
      uncategorized?: number
      resolved?: number
      scanned?: number
      modelCalls?: number
    }>,
    successMsg: string,
  ) {
    startTransition(async () => {
      const res = await action()
      if (res?.error) {
        toast.error(res.error)
        return
      }
      const calls = typeof res?.modelCalls === "number" ? { description: `${res.modelCalls} AI model calls made` } : undefined
      if (typeof res?.total === "number")
        toast.success(`${successMsg}: ${res.moved} sorted, ${res.uncategorized} left uncategorized`, calls)
      else if (typeof res?.resolved === "number")
        toast.success(`${successMsg}: ${res.resolved} of ${res.scanned} posts resolved`, calls)
      else if (typeof res?.sorted === "number") toast.success(`${successMsg} (${res.sorted} re-sorted)`, calls)
      else toast.success(successMsg)
    })
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <CreateDialog pending={pending} onSubmit={(fd) => run(() => createCategory(fd), "Category created")} />
          <MergeDialog
            categories={categories}
            pending={pending}
            onSubmit={(fd) => run(() => mergeCategories(fd), "Categories merged")}
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="secondary"
            disabled={pending || uncategorizedCount === 0}
            onClick={() => run(() => resortUncategorized(), "Re-sorted uncategorized posts")}
          >
            <Wand2 className="h-4 w-4" />
            Re-sort uncategorized
            <Badge variant="outline" className="ml-1 tabular-nums">
              {uncategorizedCount}
            </Badge>
          </Button>

          <RecategorizeAllDialog
            pending={pending}
            disabled={pending || totalPosts === 0}
            totalPosts={totalPosts}
            onConfirm={() => run(() => recategorizeAll(), "Re-categorized library")}
          />
        </div>
      </div>

      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Info className="h-4 w-4 shrink-0" />
        AI runs only when you save a new post or press a button above — never on its own. Each run reports how many model
        calls it made.
      </p>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {categories.map((category) => (
          <Card key={category.id} className="flex flex-col gap-3 p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="truncate font-semibold text-foreground">{category.name}</h3>
                  {category.auto_created ? (
                    <Badge variant="outline" className="gap-1 text-xs font-normal text-muted-foreground">
                      <Sparkles className="h-3 w-3" />
                      auto
                    </Badge>
                  ) : null}
                </div>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  {category.description || "No description."}
                </p>
              </div>
              <Badge variant="secondary" className="shrink-0 tabular-nums">
                {category.post_count} {category.post_count === 1 ? "post" : "posts"}
              </Badge>
            </div>

            {category.enable_entity_resolution ? (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <span className="flex items-center gap-1.5 text-xs text-primary">
                  <MapPin className="h-3.5 w-3.5" />
                  Entity resolution on
                </span>
                {category.post_count > 0 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 gap-1 px-2 text-xs"
                    disabled={pending}
                    onClick={() =>
                      run(() => backfillEntityResolution(category.id), "Resolved existing posts")
                    }
                  >
                    <Wand2 className="h-3.5 w-3.5" />
                    Resolve existing posts
                  </Button>
                ) : null}
              </div>
            ) : null}

            <Separator />

            <div className="flex items-center gap-2">
              <EditDialog
                category={category}
                pending={pending}
                onSubmit={(fd) => run(() => updateCategory(fd), "Category updated")}
              />
              <DeleteDialog
                category={category}
                pending={pending}
                onSubmit={(fd) => run(() => deleteCategory(fd), "Category deleted")}
              />
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}

function CategoryFields({
  defaultName = "",
  defaultDescription = "",
  defaultResolution = false,
}: {
  defaultName?: string
  defaultDescription?: string
  defaultResolution?: boolean
}) {
  return (
    <div className="flex flex-col gap-4 py-2">
      <div className="flex flex-col gap-2">
        <Label htmlFor="name">Name</Label>
        <Input id="name" name="name" defaultValue={defaultName} placeholder="e.g. Recipes" required />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          name="description"
          defaultValue={defaultDescription}
          placeholder="What kind of posts belong here?"
          rows={3}
        />
      </div>
      <div className="flex items-center justify-between rounded-lg border border-border p-3">
        <div className="pr-4">
          <Label htmlFor="enable_entity_resolution" className="text-sm">
            Entity resolution
          </Label>
          <p className="text-xs text-muted-foreground">Extract and link real-world places from posts.</p>
        </div>
        <Switch id="enable_entity_resolution" name="enable_entity_resolution" defaultChecked={defaultResolution} />
      </div>
    </div>
  )
}

function CreateDialog({ pending, onSubmit }: { pending: boolean; onSubmit: (fd: FormData) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>
        <Plus className="h-4 w-4" />
        New category
      </DialogTrigger>
      <DialogContent>
        <form
          action={(fd) => {
            onSubmit(fd)
            setOpen(false)
          }}
        >
          <DialogHeader>
            <DialogTitle>New category</DialogTitle>
            <DialogDescription>Create a category to organize your saved posts.</DialogDescription>
          </DialogHeader>
          <CategoryFields />
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="ghost" />}>Cancel</DialogClose>
            <Button type="submit" disabled={pending}>
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function EditDialog({
  category,
  pending,
  onSubmit,
}: {
  category: CategoryWithCount
  pending: boolean
  onSubmit: (fd: FormData) => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <Pencil className="h-3.5 w-3.5" />
        Edit
      </DialogTrigger>
      <DialogContent>
        <form
          action={(fd) => {
            onSubmit(fd)
            setOpen(false)
          }}
        >
          <input type="hidden" name="id" value={category.id} />
          <DialogHeader>
            <DialogTitle>Edit category</DialogTitle>
            <DialogDescription>Update the name, description, or entity resolution.</DialogDescription>
          </DialogHeader>
          <CategoryFields
            defaultName={category.name}
            defaultDescription={category.description ?? ""}
            defaultResolution={category.enable_entity_resolution}
          />
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="ghost" />}>Cancel</DialogClose>
            <Button type="submit" disabled={pending}>
              Save changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function DeleteDialog({
  category,
  pending,
  onSubmit,
}: {
  category: CategoryWithCount
  pending: boolean
  onSubmit: (fd: FormData) => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={<Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive" />}
      >
        <Trash2 className="h-3.5 w-3.5" />
        Delete
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete &ldquo;{category.name}&rdquo;?</DialogTitle>
          <DialogDescription>
            The {category.post_count} {category.post_count === 1 ? "post" : "posts"} in this category will become
            Uncategorized. This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button type="button" variant="ghost" />}>Cancel</DialogClose>
          <form
            action={(fd) => {
              onSubmit(fd)
              setOpen(false)
            }}
          >
            <input type="hidden" name="id" value={category.id} />
            <Button type="submit" variant="destructive" disabled={pending}>
              Delete category
            </Button>
          </form>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function RecategorizeAllDialog({
  pending,
  disabled,
  totalPosts,
  onConfirm,
}: {
  pending: boolean
  disabled: boolean
  totalPosts: number
  onConfirm: () => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" disabled={disabled} />}>
        <RefreshCw className="h-4 w-4" />
        Re-categorize all
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Re-categorize all posts?</DialogTitle>
          <DialogDescription>
            Every post in your library ({totalPosts}) will be re-evaluated against your current categories. Posts are
            only filed into categories that already exist — anything that no longer fits becomes Uncategorized. Use this
            after adding or removing categories. This makes roughly {totalPosts * 2} AI model calls (a classification and
            an embedding per post), may take a moment, and cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button type="button" variant="ghost" />}>Cancel</DialogClose>
          <Button
            type="button"
            disabled={pending}
            onClick={() => {
              onConfirm()
              setOpen(false)
            }}
          >
            <RefreshCw className="h-4 w-4" />
            Re-categorize all
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function MergeDialog({
  categories,
  pending,
  onSubmit,
}: {
  categories: CategoryWithCount[]
  pending: boolean
  onSubmit: (fd: FormData) => void
}) {
  const [open, setOpen] = useState(false)
  const [fromId, setFromId] = useState<string>("")
  const [toId, setToId] = useState<string>("")

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" disabled={categories.length < 2} />}>
        <GitMerge className="h-4 w-4" />
        Merge
      </DialogTrigger>
      <DialogContent>
        <form
          action={(fd) => {
            onSubmit(fd)
            setOpen(false)
          }}
        >
          <DialogHeader>
            <DialogTitle>Merge categories</DialogTitle>
            <DialogDescription>Move all posts from one category into another, then delete the first.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-3">
            <div className="flex flex-col gap-2">
              <Label>Move posts from</Label>
              <Select value={fromId} onValueChange={setFromId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.name} ({c.post_count})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label>Into</Label>
              <Select value={toId} onValueChange={setToId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a category" />
                </SelectTrigger>
                <SelectContent>
                  {categories
                    .filter((c) => String(c.id) !== fromId)
                    .map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.name} ({c.post_count})
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <input type="hidden" name="from_id" value={fromId} />
          <input type="hidden" name="to_id" value={toId} />
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="ghost" />}>Cancel</DialogClose>
            <Button type="submit" disabled={pending || !fromId || !toId || fromId === toId}>
              Merge
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
