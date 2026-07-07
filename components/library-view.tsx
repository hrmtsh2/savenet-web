"use client"

import { useMemo, useState } from "react"
import { Inbox } from "lucide-react"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { PostCard } from "@/components/post-card"
import type { CategoryWithCount, PostWithRelations } from "@/lib/types"

const UNCATEGORIZED = "uncategorized"

interface Props {
  categories: CategoryWithCount[]
  posts: PostWithRelations[]
  uncategorizedCount: number
}

export function LibraryView({ categories, posts, uncategorizedCount }: Props) {
  const firstTab = categories[0] ? String(categories[0].id) : UNCATEGORIZED
  const [tab, setTab] = useState<string>(firstTab)

  const grouped = useMemo(() => {
    const map = new Map<string, PostWithRelations[]>()
    for (const post of posts) {
      const key = post.category_id != null ? String(post.category_id) : UNCATEGORIZED
      const list = map.get(key) ?? []
      list.push(post)
      map.set(key, list)
    }
    return map
  }, [posts])

  const tabs = [
    ...categories.map((c) => ({ value: String(c.id), label: c.name, count: c.post_count })),
    { value: UNCATEGORIZED, label: "Uncategorized", count: uncategorizedCount },
  ]

  return (
    <Tabs value={tab} onValueChange={setTab} className="flex flex-col gap-4">
      <TabsList className="flex h-auto flex-wrap justify-start gap-2 bg-transparent p-0">
        {tabs.map((t) => (
          <TabsTrigger
            key={t.value}
            value={t.value}
            className="shrink-0 gap-2 rounded-full border border-transparent px-4 py-2 text-sm data-[state=active]:border-border data-[state=active]:bg-card data-[state=active]:shadow-sm"
          >
            {t.label}
            <Badge
              variant="secondary"
              className="h-5 min-w-5 justify-center rounded-full px-1.5 text-xs tabular-nums"
            >
              {t.count}
            </Badge>
          </TabsTrigger>
        ))}
      </TabsList>
      <div className="min-h-0 flex-1">
        {tabs.map((t) => {
          const items = grouped.get(t.value) ?? []
          return (
            <TabsContent key={t.value} value={t.value} className="mt-0 min-h-0">
              {items.length === 0 ? (
                <EmptyState label={t.label} />
              ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {items.map((post) => (
                    <PostCard key={post.id} post={post} />
                  ))}
                </div>
              )}
            </TabsContent>
          )
        })}
      </div>
    </Tabs>
  )
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border py-16 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary text-muted-foreground">
        <Inbox className="h-6 w-6" />
      </span>
      <div>
        <p className="font-medium text-foreground">Nothing in {label} yet</p>
        <p className="text-sm text-muted-foreground">Saved posts filed here will appear in this view.</p>
      </div>
    </div>
  )
}
