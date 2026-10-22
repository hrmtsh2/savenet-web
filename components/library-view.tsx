"use client"

import { useCallback, useState, useTransition } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { ChevronLeft, ChevronRight, Inbox, ListFilter, Search, X } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { PostCard } from "@/components/post-card"
import { AddPostsToLabelDialog } from "@/components/add-posts-to-label-dialog"
import { deleteFilteredPosts } from "@/app/actions"
import { toast } from "sonner"
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { CategoryWithCount, PostWithRelations } from "@/lib/types"
import type { LabelMatch } from "@/lib/queries"

interface Props {
  categories: CategoryWithCount[]
  posts: PostWithRelations[]
  total: number
  allPostsCount: number
  page: number
  pageCount: number
  selectedLabelIds: number[]
  labelMatch: LabelMatch
  searchQuery?: string
}

export function LibraryView({
  categories,
  posts,
  total,
  allPostsCount,
  page,
  pageCount,
  selectedLabelIds,
  labelMatch,
  searchQuery,
}: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()

  const navigate = useCallback((changes: { labelIds?: number[]; labelMatch?: LabelMatch; page?: number; query?: string }) => {
    const params = new URLSearchParams(searchParams.toString())
    const labelIds = changes.labelIds ?? selectedLabelIds
    const nextLabelMatch = changes.labelMatch ?? labelMatch
    const nextQuery = changes.query === undefined ? searchQuery : changes.query.trim()
    const nextPage = changes.page ?? 1

    if (labelIds.length) params.set("labels", labelIds.join(","))
    else params.delete("labels")
    params.delete("label")
    if (nextLabelMatch === "all" && labelIds.length > 1) params.set("match", "all")
    else params.delete("match")
    if (nextQuery) params.set("q", nextQuery)
    else params.delete("q")
    params.delete("sort")
    if (nextPage > 1) params.set("page", String(nextPage))
    else params.delete("page")

    const query = params.toString()
    startTransition(() => {
      router.push(query ? `/library?${query}` : "/library")
    })
  }, [searchParams, selectedLabelIds, labelMatch, searchQuery, router])

  const selectedLabels = categories.filter((label) => selectedLabelIds.includes(label.id))
  const scopeDescription = selectedLabels.length === 0
    ? "posts"
    : labelMatch === "all"
      ? `posts with all of ${selectedLabels.map((label) => label.name).join(", ")} labels`
      : `posts with any of ${selectedLabels.map((label) => label.name).join(", ")} labels`

  if (isPending) return <LibraryLoadingSkeleton />

  return (
    <div className="flex flex-col gap-5">
      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={(event) => {
          event.preventDefault()
          const formData = new FormData(event.currentTarget)
          const query = String(formData.get("q") || "")
          navigate({ labelIds: selectedLabelIds, query })
        }}
      >
        <div className="relative w-full">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input name="q" defaultValue={searchQuery} placeholder="Search saved posts" className="pl-9 pr-9" />
          {searchQuery ? (
            <Button type="button" variant="ghost" size="icon" className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2" onClick={() => navigate({ query: "" })} aria-label="Clear search">
              <X className="h-4 w-4" />
            </Button>
          ) : null}
        </div>
        <div className="flex gap-2">
          <Button type="submit" disabled={selectedLabelIds.length === 0}>
            Search selected labels
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={(event) => {
              const form = event.currentTarget.closest("form")
              const query = form ? String(new FormData(form).get("q") || "") : ""
              navigate({ labelIds: [], query })
            }}
          >
            Search all posts
          </Button>
        </div>
      </form>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant={selectedLabelIds.length === 0 ? "secondary" : "outline"} onClick={() => navigate({ labelIds: [] })}>
            All posts <Badge variant="outline" className="ml-1">{allPostsCount}</Badge>
          </Button>
          <LabelFilterDialog
            categories={categories}
            selectedLabelIds={selectedLabelIds}
            onApply={(labelIds) => navigate({ labelIds })}
          />
          {selectedLabels.map((label) => (
            <LabelButton
              key={label.id}
              active
              onClick={() => navigate({ labelIds: selectedLabelIds.filter((id) => id !== label.id) })}
              label={label.name}
              count={label.post_count}
            />
          ))}
        </div>
        <div className="flex gap-2">
          {selectedLabelIds.length > 1 ? (
            <Select value={labelMatch} onValueChange={(value) => navigate({ labelMatch: value as LabelMatch })}>
              <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Any label</SelectItem>
                <SelectItem value="all">All labels</SelectItem>
              </SelectContent>
            </Select>
          ) : null}
          {total > 0 ? <AddPostsToLabelDialog categories={categories} sourceLabelIds={selectedLabelIds} labelMatch={labelMatch} searchQuery={searchQuery} count={total} /> : null}
        </div>
      </div>

      {posts.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border py-16 text-center">
          <Inbox className="h-6 w-6 text-muted-foreground" />
          <p className="font-medium">Nothing here yet</p>
          <p className="text-sm text-muted-foreground">{searchQuery ? "Try a different search." : "Posts with this label will appear here."}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {posts.map((post) => <PostCard key={post.id} post={post} categories={categories} />)}
        </div>
      )}

      {pageCount > 1 || total > 0 ? (
        <div className="flex flex-wrap items-center justify-center gap-3">
          {pageCount > 1 ? <>
          <Button variant="outline" size="sm" disabled={page === 1} onClick={() => navigate({ page: page - 1 })}>
            <ChevronLeft className="h-4 w-4" /> Previous
          </Button>
          <span className="text-sm text-muted-foreground">Page {page} of {pageCount}</span>
          <Button variant="outline" size="sm" disabled={page === pageCount} onClick={() => navigate({ page: page + 1 })}>
            Next <ChevronRight className="h-4 w-4" />
          </Button>
          </> : null}
          {total > 0 ? <DeleteFilteredPostsDialog labelIds={selectedLabelIds} labelMatch={labelMatch} searchQuery={searchQuery} scopeDescription={scopeDescription} total={total} /> : null}
        </div>
      ) : null}
    </div>
  )
}

function LibraryLoadingSkeleton() {
  return (
    <div className="flex flex-col gap-5" aria-busy="true" aria-label="Loading library">
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="h-8 w-full animate-pulse rounded-lg bg-muted" />
        <div className="h-8 w-32 animate-pulse rounded-lg bg-muted" />
        <div className="h-8 w-32 animate-pulse rounded-lg bg-muted" />
      </div>
      <div className="flex flex-wrap gap-2">
        <div className="h-8 w-24 animate-pulse rounded-lg bg-muted" />
        <div className="h-8 w-24 animate-pulse rounded-lg bg-muted" />
        <div className="h-8 w-28 animate-pulse rounded-lg bg-muted" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="h-64 animate-pulse rounded-xl bg-muted" />
        ))}
      </div>
    </div>
  )
}

function DeleteFilteredPostsDialog({
  labelIds,
  labelMatch,
  searchQuery,
  scopeDescription,
  total,
}: {
  labelIds: number[]
  labelMatch: LabelMatch
  searchQuery?: string
  scopeDescription: string
  total: number
}) {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const scope = `${scopeDescription}${searchQuery ? ` matching “${searchQuery}”` : ""}`

  function deletePosts() {
    startTransition(async () => {
      const result = await deleteFilteredPosts({ labelIds, labelMatch, searchQuery })
      toast.success(`Deleted ${result.deleted} ${result.deleted === 1 ? "post" : "posts"}`)
      setOpen(false)
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="destructive" size="sm" />}>Delete all {scope}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete all matching posts?</DialogTitle>
          <DialogDescription>
            This will permanently remove all {total} {scope} from SaveNet. This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button type="button" variant="ghost" />}>Cancel</DialogClose>
          <Button type="button" variant="destructive" onClick={deletePosts} disabled={pending}>
            Delete {total} {total === 1 ? "post" : "posts"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function LabelButton({ active, onClick, label, count }: { active: boolean; onClick: () => void; label: string; count: number }) {
  return (
    <button onClick={onClick} className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors ${active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:bg-secondary"}`}>
      {label}<Badge variant={active ? "secondary" : "outline"} className="h-5 min-w-5 justify-center rounded-full px-1.5 text-xs">{count}</Badge>
    </button>
  )
}

function LabelFilterDialog({
  categories,
  selectedLabelIds,
  onApply,
}: {
  categories: CategoryWithCount[]
  selectedLabelIds: number[]
  onApply: (labelIds: number[]) => void
}) {
  const [open, setOpen] = useState(false)
  const [draftLabelIds, setDraftLabelIds] = useState<number[]>(selectedLabelIds)

  function openDialog(nextOpen: boolean) {
    if (nextOpen) setDraftLabelIds(selectedLabelIds)
    setOpen(nextOpen)
  }

  function apply() {
    onApply(draftLabelIds)
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={openDialog}>
      <DialogTrigger
        render={
          <Button variant={selectedLabelIds.length ? "secondary" : "outline"}>
            <ListFilter className="h-4 w-4" />
            Labels
            {selectedLabelIds.length ? <Badge variant="outline">{selectedLabelIds.length}</Badge> : null}
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Filter by labels</DialogTitle>
          <DialogDescription>Select the labels to show in the library view.</DialogDescription>
        </DialogHeader>
        <div className="max-h-72 space-y-1 overflow-y-auto rounded-lg border p-2">
          {categories.length ? categories.map((label) => (
            <label key={label.id} className="flex cursor-pointer items-center justify-between gap-3 rounded-md px-2 py-2 text-sm hover:bg-muted">
              <span className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={draftLabelIds.includes(label.id)}
                  onChange={() => setDraftLabelIds((current) => current.includes(label.id)
                    ? current.filter((id) => id !== label.id)
                    : [...current, label.id])}
                />
                {label.name}
              </span>
              <Badge variant="outline">{label.post_count}</Badge>
            </label>
          )) : <p className="px-2 py-3 text-sm text-muted-foreground">No labels yet.</p>}
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => setDraftLabelIds([])}>Clear all</Button>
          <DialogClose render={<Button type="button" variant="ghost" />}>Cancel</DialogClose>
          <Button type="button" onClick={apply}>Apply filters</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
