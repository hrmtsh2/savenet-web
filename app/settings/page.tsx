import { SiteNav } from "@/components/site-nav"
import { AiSettingsPanel } from "@/components/ai-settings-panel"
import { requireUserId } from "@/lib/auth"
import { getAiSettings } from "@/lib/ai-settings"
import { getDigestConfig } from "@/lib/digests"
import { getCategoriesWithCounts } from "@/lib/queries"
import { DigestSettings } from "@/components/digest-settings"

export const dynamic = "force-dynamic"

export default async function SettingsPage() {
  const userId = await requireUserId()
  const [settings, digestConfig, categories] = await Promise.all([getAiSettings(userId), getDigestConfig(userId), getCategoriesWithCounts(userId)])

  return (
    <div className="min-h-screen">
      <SiteNav />
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight text-balance">Settings</h1>
          <p className="mt-1 text-sm text-muted-foreground">Choose the model SaveNet uses for chat, and review recent AI activity.</p>
        </div>
        <AiSettingsPanel settings={settings} />
        <div className="mt-6"><DigestSettings config={digestConfig} categories={categories} /></div>
      </main>
    </div>
  )
}
