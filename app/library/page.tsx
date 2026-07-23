import { SiteNav } from "@/components/site-nav"
import { LibraryView } from "@/components/library-view"
import { requireUserId } from "@/lib/auth"
import { getCategoriesWithCounts, getPostsCount, getPostsForUser, type PostSort } from "@/lib/queries"

export const dynamic = "force-dynamic"

const savesPaginationPageSize = 24

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ label?: string; page?: string; sort?: string }>
}) {
  const userId = await requireUserId()
  const params = await searchParams
  const labelId = Number(params.label)
  const selectedLabelId = Number.isInteger(labelId) && labelId > 0 ? labelId : undefined
  const sort: PostSort = params.sort === "label" ? "label" : "date"
  const requestedPage = Number(params.page)
  const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1
  const [categories, total, allPostsCount] = await Promise.all([
    getCategoriesWithCounts(userId),
    getPostsCount(userId, selectedLabelId),
    getPostsCount(userId),
  ])
  const pageCount = Math.max(1, Math.ceil(total / savesPaginationPageSize))
  const currentPage = Math.min(page, pageCount)
  const posts = await getPostsForUser(userId, {
    labelId: selectedLabelId,
    limit: savesPaginationPageSize,
    offset: (currentPage - 1) * savesPaginationPageSize,
    sort,
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
          selectedLabelId={selectedLabelId}
          sort={sort}
        />
      </main>
    </div>
  )
}
