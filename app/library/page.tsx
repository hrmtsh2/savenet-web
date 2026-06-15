import { SiteNav } from "@/components/site-nav"
import { LibraryView } from "@/components/library-view"
import { DEFAULT_USER_ID } from "@/lib/auth"
import { ensureSeedCategories, getCategoriesWithCounts, getPostsForUser, getUncategorizedCount } from "@/lib/queries"

export const dynamic = "force-dynamic"

export default async function LibraryPage() {
  await ensureSeedCategories(DEFAULT_USER_ID)
  const [categories, posts, uncategorizedCount] = await Promise.all([
    getCategoriesWithCounts(DEFAULT_USER_ID),
    getPostsForUser(DEFAULT_USER_ID),
    getUncategorizedCount(DEFAULT_USER_ID),
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
