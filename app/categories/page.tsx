import { SiteNav } from "@/components/site-nav"
import { CategoriesManager } from "@/components/categories-manager"
import { DEFAULT_USER_ID } from "@/lib/auth"
import { ensureSeedCategories, getCategoriesWithCounts, getUncategorizedCount } from "@/lib/queries"

export const dynamic = "force-dynamic"

export default async function CategoriesPage() {
  await ensureSeedCategories(DEFAULT_USER_ID)
  const [categories, uncategorizedCount] = await Promise.all([
    getCategoriesWithCounts(DEFAULT_USER_ID),
    getUncategorizedCount(DEFAULT_USER_ID),
  ])

  return (
    <div className="min-h-screen">
      <SiteNav />
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight text-balance">Categories</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage how your saved posts are organized. Edit, merge, or delete categories, and re-sort anything
            uncategorized.
          </p>
        </div>

        <CategoriesManager categories={categories} uncategorizedCount={uncategorizedCount} />
      </main>
    </div>
  )
}
