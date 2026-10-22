import { SiteNav } from "@/components/site-nav"
import { LibraryView } from "@/components/library-view"
import { requireUserId } from "@/lib/auth"
import { getCategoriesWithCounts, getPostsCount, getPostsForUser, type LabelMatch } from "@/lib/queries"

export const dynamic = "force-dynamic"

const savesPaginationPageSize = 24

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ label?: string; labels?: string; match?: string; page?: string; q?: string }>
}) {
  const userId = await requireUserId()
  const params = await searchParams
  const selectedLabelIds = [...new Set((params.labels ?? params.label ?? "").split(",").map(Number).filter((id) => Number.isInteger(id) && id > 0))]
  const labelMatch: LabelMatch = params.match === "all" ? "all" : "any"
  const searchQuery = params.q?.trim().slice(0, 200) || undefined
  const requestedPage = Number(params.page)
  const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1
  const [categories, total, allPostsCount] = await Promise.all([
    getCategoriesWithCounts(userId),
    getPostsCount(userId, selectedLabelIds, labelMatch, searchQuery),
    getPostsCount(userId),
  ])
  const pageCount = Math.max(1, Math.ceil(total / savesPaginationPageSize))
  const currentPage = Math.min(page, pageCount)
  const posts = await getPostsForUser(userId, {
    labelIds: selectedLabelIds,
    labelMatch,
    limit: savesPaginationPageSize,
    offset: (currentPage - 1) * savesPaginationPageSize,
    searchQuery,
  })
  return (
    <div className="min-h-screen">
      <SiteNav />
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight text-balance">Library</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {total === 0
              ? "Your saved posts will appear here with source and collection labels."
              : `${total} saved ${total === 1 ? "post" : "posts"} in this view.`}
          </p>
        </div>

        <LibraryView
          categories={categories}
          posts={posts}
          total={total}
          allPostsCount={allPostsCount}
          page={currentPage}
          pageCount={pageCount}
          selectedLabelIds={selectedLabelIds}
          labelMatch={labelMatch}
          searchQuery={searchQuery}
        />
      </main>
    </div>
  )
}
