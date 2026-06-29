import Link from "next/link"
import { getServerSession } from "next-auth"
import { authOptions } from "@/auth.config"
import { redirect } from "next/navigation"

function SaveNetLogo() {
  return (
    <svg width="36" height="36" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
      <path d="M6 3 L26 3 Q29 3 29 6 L29 29 L16 21 L3 29 L3 6 Q3 3 6 3 Z" fill="rgba(255,255,255,0.25)" />
      <path d="M6 3 L26 3 Q29 3 29 6 L29 13 L3 13 L3 6 Q3 3 6 3 Z" fill="rgba(255,255,255,0.45)" />
      <line x1="23" y1="6" x2="23" y2="12" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
      <line x1="20" y1="9" x2="26" y2="9" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
      <line x1="21" y1="7" x2="25" y2="11" stroke="white" strokeWidth="1.3" strokeLinecap="round" />
      <line x1="25" y1="7" x2="21" y2="11" stroke="white" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  )
}

export default async function LandingPage() {
  const session = await getServerSession(authOptions)
  if (session) redirect("/library")

  return (
    <div className="min-h-screen bg-background">

      {/* Nav */}
      <header className="border-b border-indigo-500/20 bg-indigo-600">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/15">
              <SaveNetLogo />
            </span>
            <span className="text-lg font-semibold tracking-tight text-white">SaveNet</span>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="text-sm font-medium text-indigo-100 hover:text-white transition-colors"
            >
              Log in
            </Link>
            <Link
              href="/signup"
              className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-indigo-600 transition-colors hover:bg-indigo-50"
            >
              Get started
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="bg-indigo-600 pb-24 pt-20 text-center">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/15">
            <SaveNetLogo />
          </div>
          <h1 className="text-4xl font-semibold leading-tight tracking-tight text-white sm:text-5xl">
            Your saves,<br />working for you
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-indigo-200">
            SaveNet captures everything you bookmark on Instagram, X, and your browser, organises it automatically, and lets you have a conversation with your saved content.
          </p>
          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Link
              href="/signup"
              className="rounded-lg bg-white px-6 py-3 text-sm font-medium text-indigo-600 transition-colors hover:bg-indigo-50"
            >
              Get started for free
            </Link>
            <Link
              href="/login"
              className="rounded-lg border border-white/30 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-white/10"
            >
              Log in
            </Link>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <h2 className="text-center text-2xl font-semibold tracking-tight">How it works</h2>
          <p className="mt-2 text-center text-sm text-muted-foreground">Three steps from install to insight</p>

          <div className="mt-12 grid grid-cols-1 gap-8 sm:grid-cols-3">
            {[
              {
                step: "01",
                title: "Install the extension",
                description: "Add the SaveNet Chrome extension. It sits quietly in the background — no setup beyond logging in.",
              },
              {
                step: "02",
                title: "Save as you normally would",
                description: "Save a post on Instagram, bookmark a tweet on X, or add a page to your Reading List. SaveNet captures it automatically.",
              },
              {
                step: "03",
                title: "Chat with your library",
                description: "Ask SaveNet anything about your saves. Get recommendations with live prices, menus, and reviews surfaced from the web.",
              },
            ].map((item) => (
              <div key={item.step} className="flex flex-col gap-3">
                <span className="text-3xl font-semibold text-indigo-200">{item.step}</span>
                <h3 className="text-base font-medium">{item.title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="border-t py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <h2 className="text-center text-2xl font-semibold tracking-tight">Everything in one place</h2>
          <p className="mt-2 text-center text-sm text-muted-foreground">SaveNet works across the platforms you already use</p>

          <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                title: "Instagram saves",
                description: "Every post or reel you save on Instagram is captured with its caption, author, and AI-generated summary.",
              },
              {
                title: "X bookmarks",
                description: "Bookmarked tweets — including links, threads, and media — land in your SaveNet library automatically.",
              },
              {
                title: "Browser bookmarks",
                description: "Import existing bookmark folders or your Chrome Reading List with a single click from the extension.",
              },
              {
                title: "Smart categories",
                description: "SaveNet classifies every save into categories you define. New categories are created automatically when nothing fits.",
              },
              {
                title: "AI chat",
                description: "Ask questions like 'cheap Thai food near me' or 'what frontend tools have I saved?' and get answers grounded in your own content.",
              },
              {
                title: "Live enrichment",
                description: "SaveNet fetches menus, prices, and reviews for restaurants and products you've saved — so you always have the full picture.",
              },
            ].map((feature) => (
              <div
                key={feature.title}
                className="flex flex-col gap-2 rounded-xl border p-5"
              >
                <div className="h-1.5 w-6 rounded-full bg-indigo-500" />
                <h3 className="text-sm font-medium">{feature.title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t bg-indigo-600 py-20 text-center">
        <div className="mx-auto max-w-xl px-4 sm:px-6">
          <h2 className="text-2xl font-semibold text-white">Ready to save smarter?</h2>
          <p className="mt-3 text-sm leading-relaxed text-indigo-200">
            Create your free account and install the extension to get started in minutes.
          </p>
          <Link
            href="/signup"
            className="mt-6 inline-block rounded-lg bg-white px-6 py-3 text-sm font-medium text-indigo-600 transition-colors hover:bg-indigo-50"
          >
            Get started for free
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-8">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">SaveNet</span>
            <span className="text-xs text-muted-foreground">© {new Date().getFullYear()}</span>
          </div>
          <div className="flex items-center gap-6">
            <Link href="/privacy" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
              Privacy policy
            </Link>
            <a>
              href="https://chromewebstore.google.com/savenet/`someid`"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              Chrome extension
            </a>
          </div>
        </div>
      </footer>

    </div>
  )
}