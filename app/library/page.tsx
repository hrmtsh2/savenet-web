import { SiteNav } from "@/components/site-nav"
import { LibraryView } from "@/components/library-view"
import { requireUserId } from "@/lib/auth"
import { ensureSeedCategories, getCategoriesWithCounts, getPostsForUser, getUncategorizedCount } from "@/lib/queries"

export const dynamic = "force-dynamic"

export default async function LibraryPage() {
  const userId = await requireUserId()
  await ensureSeedCategories(userId)
  const [categories, posts, uncategorizedCount] = await Promise.all([
    getCategoriesWithCounts(userId),
    getPostsForUser(userId),
    getUncategorizedCount(userId),
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
              ? "Your saved posts will appear here, grouped by category."
              : `${total} saved ${total === 1 ? "post" : "posts"} across your categories.`}
          </p>
        </div>

        <LibraryView categories={categories} posts={posts} uncategorizedCount={uncategorizedCount} />
      </main>
    </div>
  )
}
