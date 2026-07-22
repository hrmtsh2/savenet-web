import { SiteNav } from "@/components/site-nav"
import { ChatView } from "@/components/chat-view"
import { requireUserId } from "@/lib/auth"
import { getCategoriesWithCounts, listConversations } from "@/lib/queries"

export const dynamic = "force-dynamic"

export default async function ChatPage() {
  const userId = await requireUserId()
  const [categories, conversations] = await Promise.all([
    getCategoriesWithCounts(userId),
    listConversations(userId),
  ])

  return (
    <div className="flex min-h-screen flex-col">
      <SiteNav />
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 py-8 sm:px-6 overflow-hidden">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight text-balance">Ask your library</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Pick one or more labels and ask for a recommendation. Answers come only from posts you&apos;ve saved.
          </p>
        </div>

        <ChatView categories={categories} conversations={conversations} />
      </main>
    </div>
  )
}
