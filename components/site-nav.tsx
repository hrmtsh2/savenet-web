"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Bookmark, Library, FolderCog } from "lucide-react"
import { cn } from "@/lib/utils"

const links = [
  { href: "/library", label: "Library", icon: Library },
  { href: "/categories", label: "Categories", icon: FolderCog },
]

export function SiteNav() {
  const pathname = usePathname()

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/library" className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Bookmark className="h-4 w-4" />
          </span>
          <span className="text-lg font-semibold tracking-tight">SaveNet</span>
        </Link>

        <nav className="flex items-center gap-1">
          {links.map((link) => {
            const active = pathname === link.href
            const Icon = link.icon
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-secondary text-foreground"
                    : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
                <span className="hidden sm:inline">{link.label}</span>
              </Link>
            )
          })}
        </nav>
      </div>
    </header>
  )
}
