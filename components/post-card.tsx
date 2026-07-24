"use client"

import { useState, useTransition } from "react"
import Image from "next/image"
import { ExternalLink, MapPin, Trash2, Bookmark, BookOpen } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
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
import { deletePost } from "@/app/actions"
import { AddPostsToLabelDialog } from "@/components/add-posts-to-label-dialog"
import type { CategoryWithCount, Platform, PostWithRelations } from "@/lib/types"

function XLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24h-6.66l-5.214-6.817-5.968 6.817H1.675l7.73-8.835L1.254 2.25h6.83l4.713 6.231 5.447-6.231Zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77Z" />
    </svg>
  )
}

function InstagramLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37Z" />
      <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
    </svg>
  )
}

function PlatformIcon({ platform, className }: { platform: Platform; className?: string }) {
  if (platform === "x") return <XLogo className={className} />
  if (platform === "instagram") return <InstagramLogo className={className} />
  if (platform === "browser_bookmark") return <Bookmark className={className} />
  if (platform === "reading_list") return <BookOpen className={className} />
  return null
}

function platformLabel(platform: Platform) {
  if (platform === "instagram") return "Instagram"
  if (platform === "x") return "X"
  if (platform === "browser_bookmark") return "Bookmark"
  if (platform === "reading_list") return "Reading List"
  return platform
}

export function PostCard({ post, categories }: { post: PostWithRelations; categories: CategoryWithCount[] }) {
  const caption = post.caption?.trim() || ""
  const summary = post.summary?.trim() || ""
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [imageFailed, setImageFailed] = useState(false)
  const showImage = Boolean(post.thumbnail_url) && !imageFailed

  function onDelete(fd: FormData) {
    startTransition(async () => {
      const res = await deletePost(fd)
      if (res?.error) toast.error(res.error)
      else toast.success("Post deleted")
      setOpen(false)
    })
  }

  return (
    <Card className="flex flex-col gap-0 overflow-hidden p-0">
      {showImage ? (
        <div className="relative aspect-[16/10] w-full overflow-hidden bg-muted">
          <Image
            src={post.thumbnail_url || "/placeholder.svg"}
            alt={caption ? `Thumbnail for: ${caption.slice(0, 80)}` : "Saved post thumbnail"}
            fill
            sizes="(max-width: 768px) 100vw, 400px"
            className="object-cover"
            unoptimized
            onError={() => setImageFailed(true)}
          />
        </div>
      ) : null }

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <Badge variant="secondary" className="gap-1.5 font-normal">
            <PlatformIcon platform={post.platform} className="h-3.5 w-3.5" />
            {platformLabel(post.platform)}
          </Badge>
          {post.author_handle ? (
            <span className="truncate text-xs text-muted-foreground">@{post.author_handle.replace(/^@/, "")}</span>
          ) : null}
        </div>

        {post.labels.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {post.labels.map((label) => (
              <Badge key={label.id} variant="outline" className="font-normal">{label.name}</Badge>
            ))}
          </div>
        ) : null}

        {caption ? <p className="line-clamp-2 text-sm font-medium leading-relaxed text-foreground">{caption}</p> : null}

        {summary ? (
          <p className="line-clamp-3 text-sm leading-relaxed text-muted-foreground">{summary}</p>
        ) : (
          !caption && <p className="text-sm italic text-muted-foreground">No description yet.</p>
        )}

        {post.entity_name ? (
          <div className="flex items-center gap-1.5 text-xs text-foreground">
            <MapPin className="h-3.5 w-3.5 text-primary" />
            <span className="font-medium">{post.entity_name}</span>
            {post.entity_location ? <span className="text-muted-foreground">· {post.entity_location}</span> : null}
          </div>
        ) : null}

        {post.captured_at ? (
          <p className="text-xs text-muted-foreground">
            Saved {new Date(post.captured_at).toLocaleDateString("en-IN", { 
              day: "numeric", month: "short", year: "numeric" 
            })}
          </p>
        ) : null}

        <div className="mt-auto flex items-center justify-between gap-2 pt-1">
          <a
            href={post.post_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
          >
            View original
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
          <div className="flex items-center gap-1">
            <AddPostsToLabelDialog categories={categories} postIds={[post.id]} count={1} excludedLabelIds={post.labels.map((label) => label.id)} compact />
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger
                render={
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1.5 px-2 text-muted-foreground hover:text-destructive"
                    aria-label="Delete post"
                  />
                }
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Delete this post?</DialogTitle>
                  <DialogDescription>
                    This saved post will be permanently removed from your library. This cannot be undone.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <DialogClose render={<Button type="button" variant="ghost" />}>Cancel</DialogClose>
                  <form action={onDelete}>
                    <input type="hidden" name="id" value={post.id} />
                    <Button type="submit" variant="destructive" disabled={pending}>
                      Delete post
                    </Button>
                  </form>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </div>
    </Card>
  )
}
