import Image from "next/image"
import { ExternalLink, MapPin } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import type { PostWithRelations } from "@/lib/types"

function XLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24h-6.66l-5.214-6.817-5.968 6.817H1.675l7.73-8.835L1.254 2.25h6.83l4.713 6.231 5.447-6.231Zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77Z" />
    </svg>
  )
}

function InstagramLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="0.5" fill="currentColor" />
    </svg>
  )
}

export function PostCard({ post }: { post: PostWithRelations }) {
  const caption = post.caption?.trim() || ""
  const summary = post.summary?.trim() || ""

  return (
    <Card className="flex flex-col gap-0 overflow-hidden p-0">
      {post.thumbnail_url ? (
        <div className="relative aspect-[16/10] w-full overflow-hidden bg-muted">
          <Image
            src={post.thumbnail_url || "/placeholder.svg"}
            alt={caption ? `Thumbnail for: ${caption.slice(0, 80)}` : "Saved post thumbnail"}
            fill
            sizes="(max-width: 768px) 100vw, 400px"
            className="object-cover"
            unoptimized
          />
        </div>
      ) : null}

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <Badge variant="secondary" className="gap-1.5 font-normal">
            {post.platform === "instagram" ? (
              <InstagramLogo className="h-3.5 w-3.5" />
            ) : (
              <XLogo className="h-3 w-3" />
            )}
            {post.platform === "instagram" ? "Instagram" : "X"}
          </Badge>
          {post.author_handle ? (
            <span className="truncate text-xs text-muted-foreground">@{post.author_handle.replace(/^@/, "")}</span>
          ) : null}
        </div>

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

        <div className="mt-auto pt-1">
          <a
            href={post.post_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
          >
            View original
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>
    </Card>
  )
}
