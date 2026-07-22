"use client"

import { useMemo, useState } from "react"
import { Inbox } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { PostCard } from "@/components/post-card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { CategoryWithCount, PostWithRelations } from "@/lib/types"

interface Props {
  categories: CategoryWithCount[]
  posts: PostWithRelations[]
}

export function LibraryView({ categories, posts }: Props) {
  const [labelId, setLabelId] = useState<string>("all")
  const [sort, setSort] = useState<"date" | "label">("date")

  const visiblePosts = useMemo(() => {
    const filtered = labelId === "all" ? posts : posts.filter((post) => post.labels.some((label) => String(label.id) === labelId))
    return [...filtered].sort((a, b) => {
      if (sort === "label") {
        const aLabel = a.labels[0]?.name ?? ""
        const bLabel = b.labels[0]?.name ?? ""
        return aLabel.localeCompare(bLabel) || timestamp(b.created_at) - timestamp(a.created_at)
      }
      return timestamp(b.created_at) - timestamp(a.created_at)
    })
  }, [labelId, posts, sort])

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          <ButtonLike active={labelId === "all"} onClick={() => setLabelId("all")} label="All posts" count={posts.length} />
          {categories.map((label) => (
            <ButtonLike key={label.id} active={labelId === String(label.id)} onClick={() => setLabelId(String(label.id))} label={label.name} count={label.post_count} />
          ))}
        </div>
        <Select value={sort} onValueChange={(value) => setSort(value as "date" | "label")}>
          <SelectTrigger className="w-full sm:w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="date">Date added</SelectItem>
            <SelectItem value="label">Label</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {visiblePosts.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border py-16 text-center">
          <Inbox className="h-6 w-6 text-muted-foreground" />
          <p className="font-medium">Nothing here yet</p>
          <p className="text-sm text-muted-foreground">Posts with this label will appear here.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visiblePosts.map((post) => <PostCard key={post.id} post={post} />)}
        </div>
      )}
    </div>
  )
}

function timestamp(value: string | Date) {
  return new Date(value).getTime()
}

function ButtonLike({ active, onClick, label, count }: { active: boolean; onClick: () => void; label: string; count: number }) {
  return (
    <button onClick={onClick} className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors ${active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:bg-secondary"}`}>
      {label}<Badge variant={active ? "secondary" : "outline"} className="h-5 min-w-5 justify-center rounded-full px-1.5 text-xs">{count}</Badge>
    </button>
  )
}
