import { SiteNav } from "@/components/site-nav"
import { CategoriesManager } from "@/components/categories-manager"
import { requireUserId } from "@/lib/auth"
import { getCategoriesWithCounts } from "@/lib/queries"
import { listEntityAgentConfigs } from "@/lib/agents"

// export const dynamic = "force-dynamic"

export default async function CategoriesPage() {
  const userId = await requireUserId()
  const [categories, entityAgentConfigs] = await Promise.all([
    getCategoriesWithCounts(userId),
    listEntityAgentConfigs(userId),
  ])

  return (
    <div className="min-h-screen">
      <SiteNav />
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight text-balance">Labels</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Create labels before importing posts. SaveNet also adds source labels and Instagram collection labels automatically.
          </p>
        </div>

        <CategoriesManager categories={categories} entityAgentConfigs={entityAgentConfigs} />
      </main>
    </div>
  )
}
