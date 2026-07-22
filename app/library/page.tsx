import { SiteNav } from "@/components/site-nav"
import { LibraryView } from "@/components/library-view"
import { requireUserId } from "@/lib/auth"
import { getCategoriesWithCounts, getPostsForUser } from "@/lib/queries"

export const dynamic = "force-dynamic"

export default async function LibraryPage() {
  const userId = await requireUserId()
  const [categories, posts] = await Promise.all([
    getCategoriesWithCounts(userId),
    getPostsForUser(userId),
  ])

  const total = posts.length

  return (
    <div className="min-h-screen">
      <SiteNav />
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight text-balance">Library</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {total === 0
              ? "Your saved posts will appear here with source and collection labels."
              : `${total} saved ${total === 1 ? "post" : "posts"}, organized with labels.`}
          </p>
        </div>

        <LibraryView categories={categories} posts={posts} />
      </main>
    </div>
  )
}
