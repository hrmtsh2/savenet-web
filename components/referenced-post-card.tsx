import Image from "next/image"
import { ExternalLink } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import type { ReferencedPost } from "@/lib/types"

function PlatformLogo({ platform, className }: { platform: ReferencedPost["platform"]; className?: string }) {
  if (platform === "x") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="currentColor">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24h-6.66l-5.214-6.817-5.968 6.817H1.675l7.73-8.835L1.254 2.25h6.83l4.713 6.231 5.447-6.231Zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77Z" />
      </svg>
    )
  }
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37Z" />
      <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
    </svg>
  )
}

export function ReferencedPostCard({ post }: { post: ReferencedPost }) {
  const summary = post.summary?.trim() || "Saved post"
  return (
    <a
      href={post.postUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="group block focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-xl"
    >
      <Card className="flex h-full flex-col gap-0 overflow-hidden p-0 transition-colors group-hover:border-primary/50">
        {post.thumbnailUrl ? (
          <div className="relative aspect-[16/10] w-full overflow-hidden bg-muted">
            <Image
              src={post.thumbnailUrl || "/placeholder.svg"}
              alt={`Thumbnail for: ${summary.slice(0, 80)}`}
              fill
              sizes="(max-width: 768px) 50vw, 240px"
              className="object-cover"
              unoptimized
            />
          </div>
        ) : null}
        <div className="flex flex-1 flex-col gap-2 p-3">
          <Badge variant="secondary" className="w-fit gap-1.5 font-normal">
            <PlatformLogo platform={post.platform} className="h-3 w-3" />
            {post.platform === "instagram" ? "Instagram" : "X"}
          </Badge>
          <p className="line-clamp-3 text-xs leading-relaxed text-muted-foreground">{summary}</p>
          <span className="mt-auto inline-flex items-center gap-1 text-xs font-medium text-primary">
            View original
            <ExternalLink className="h-3 w-3" />
          </span>
        </div>
      </Card>
    </a>
  )
}
