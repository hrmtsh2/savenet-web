"use client"

import { useCallback } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { ChevronLeft, ChevronRight, Inbox, Search, X } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { PostCard } from "@/components/post-card"
import { AddPostsToLabelDialog } from "@/components/add-posts-to-label-dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { CategoryWithCount, PostWithRelations } from "@/lib/types"
import type { PostSort } from "@/lib/queries"

interface Props {
  categories: CategoryWithCount[]
  posts: PostWithRelations[]
  total: number
  allPostsCount: number
  page: number
  pageCount: number
  selectedLabelId?: number
  searchQuery?: string
  sort: PostSort
}

export function LibraryView({
  categories,
  posts,
  total,
  allPostsCount,
  page,
  pageCount,
  selectedLabelId,
  searchQuery,
  sort,
}: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const navigate = useCallback((changes: { label?: number; page?: number; query?: string; sort?: PostSort }) => {
    const params = new URLSearchParams(searchParams.toString())
    const label = changes.label === undefined ? selectedLabelId : changes.label
    const nextQuery = changes.query === undefined ? searchQuery : changes.query.trim()
    const nextSort = changes.sort ?? sort
    const nextPage = changes.page ?? 1

    if (label) params.set("label", String(label))
    else params.delete("label")
    if (nextQuery) params.set("q", nextQuery)
    else params.delete("q")
    if (nextSort === "label") params.set("sort", nextSort)
    else params.delete("sort")
    if (nextPage > 1) params.set("page", String(nextPage))
    else params.delete("page")

    const query = params.toString()
    router.push(query ? `/library?${query}` : "/library")
  }, [searchParams, selectedLabelId, searchQuery, sort, router])

  return (
    <div className="flex flex-col gap-5">
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          const formData = new FormData(event.currentTarget)
          navigate({ query: String(formData.get("q") || "") })
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
        <Button type="submit">Search</Button>
      </form>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          <LabelButton active={!selectedLabelId} onClick={() => navigate({ label: 0 })} label="All posts" count={allPostsCount} />
          {categories.map((label) => (
            <LabelButton
              key={label.id}
              active={selectedLabelId === label.id}
              onClick={() => navigate({ label: label.id })}
              label={label.name}
              count={label.post_count}
            />
          ))}
        </div>
        <div className="flex gap-2">
          {total > 0 ? <AddPostsToLabelDialog categories={categories} sourceLabelId={selectedLabelId} searchQuery={searchQuery} count={total} /> : null}
          <Select value={sort} onValueChange={(value) => navigate({ sort: value as PostSort })}>
            <SelectTrigger className="w-full sm:w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="date">Date added</SelectItem>
              <SelectItem value="label">Label</SelectItem>
            </SelectContent>
          </Select>
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

      {pageCount > 1 ? (
        <div className="flex items-center justify-center gap-3">
          <Button variant="outline" size="sm" disabled={page === 1} onClick={() => navigate({ page: page - 1 })}>
            <ChevronLeft className="h-4 w-4" /> Previous
          </Button>
          <span className="text-sm text-muted-foreground">Page {page} of {pageCount}</span>
          <Button variant="outline" size="sm" disabled={page === pageCount} onClick={() => navigate({ page: page + 1 })}>
            Next <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      ) : null}
    </div>
  )
}

function LabelButton({ active, onClick, label, count }: { active: boolean; onClick: () => void; label: string; count: number }) {
  return (
    <button onClick={onClick} className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors ${active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:bg-secondary"}`}>
      {label}<Badge variant={active ? "secondary" : "outline"} className="h-5 min-w-5 justify-center rounded-full px-1.5 text-xs">{count}</Badge>
    </button>
  )
}
