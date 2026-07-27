"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useSession, signOut } from "next-auth/react"
import { Library, FolderCog, MessagesSquare, Settings, LogOut } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { SaveNetLogo } from "@/components/savenet-logo"
import { getCognitoLogoutUrl } from "@/lib/signout"

const links = [
  { href: "/library", label: "Library", icon: Library },
  { href: "/chat", label: "Chat", icon: MessagesSquare },
  { href: "/categories", label: "Labels", icon: FolderCog },
  { href: "/settings", label: "Settings", icon: Settings },
]

export function SiteNav() {
  const pathname = usePathname()
  const { data: session } = useSession()

  return (
    <header className="sticky top-0 z-30 border-b border-indigo-500/20 bg-indigo-600">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2" aria-label="SaveNet home">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/15">
            <SaveNetLogo size={24} />
          </span>
          <span className="text-lg font-semibold tracking-tight text-white">SaveNet</span>
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
                    ? "bg-white/20 text-white"
                    : "text-indigo-100 hover:bg-white/10 hover:text-white",
                )}
              >
                <Icon className="h-4 w-4" />
                <span className="hidden sm:inline">{link.label}</span>
              </Link>
            )
          })}
        </nav>

        {session?.user && (
          <div className="flex items-center gap-3">
            <span className="hidden max-w-[160px] truncate text-xs text-indigo-200 sm:inline">
              {session.user.email}
            </span>
            <Button
              variant="ghost"
              size="icon"
              onClick={async () => {
                await signOut({ redirect: false })
                window.location.href = getCognitoLogoutUrl()
              }}
              title="Log out"
              className="text-indigo-100 hover:bg-white/10 hover:text-white"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </header>
  )
}
