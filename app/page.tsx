import Link from "next/link"
import { getServerSession } from "next-auth"
import { authOptions } from "@/auth.config"
import { SaveNetLogo } from "@/components/savenet-logo"

export default async function LandingPage() {
  const session = await getServerSession(authOptions)

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
            {session ? (
              <Link
                href="/library"
                className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-indigo-600 transition-colors hover:bg-indigo-50"
              > Go to Library
              </Link>
            ) : (
              <>
                <Link
                  href="/login"
                  className="text-sm font-medium text-indigo-100 hover:text-white transition-colors"
                >
                  Log In
                </Link>
                <Link
                  href="/signup"
                  className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-indigo-600 transition-colors hover:bg-indigo-50"
                >
                  Sign Up
                </Link>
              </>
            )}
            
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
            Save smarter,<br /> find faster
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-indigo-200">
            SaveNet captures what you save on Instagram, X, and your browser, keeps it searchable, and lets you ask useful questions about it later.
          </p>
          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Link
              href="/signup"
              className="rounded-lg bg-white px-6 py-3 text-sm font-medium text-indigo-600 transition-colors hover:bg-indigo-50"
            >
              Sign Up
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

          <div className="mt-12 grid grid-cols-1 gap-8 sm:grid-cols-3">
            {[
              {
                step: "01",
                title: "Create an Account",
                description: "Create a free account to start saving your posts with SaveNet."
              },
              {
                step: "02",
                title: "Install the Extension",
                description: "Install the browser extension and log in with your SaveNet credentials.",
              },
              {
                step: "03",
                title: "Capture New Saves",
                description: "Save a post on Instagram, bookmark a tweet on X, or add a page to your Browser Bookmarks/Reading List. SaveNet captures it automatically. However, for saving Instagram posts, we recommend opening the post's main comments thread (by cliking on the comments button) before saving, to capture full post data.",
              },
              {
                step: "04",
                title: "Import Existing Saves",
                description: "If you have a pre-existing collection of Instagram Saves, just open the collection page, open the extension popup, and you will see that it recognises your collection. Click Import to import all posts from the open collection into your SaveNet Library."
              },              
              {
                step: "05",
                title: "Chat",
                description: "Ask SaveNet about your saves, or set up agents to organise a view, extract useful details, and send a personal digest.",
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
          <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                title: "Instagram Saves",
                description: "Every post or reel you save on Instagram is captured with its caption, author, and searchable context.",
              },
              {
                title: "X (f.k.a. Twitter) Bookmarks",
                description: "Bookmarked tweets — including links, threads, and media — land in your SaveNet library automatically.",
              },
              {
                title: "Browser Bookmarks/Reading List Items",
                description: "Import existing bookmark folders or your Chrome Reading List with a single click from the extension.",
              },
              {
                title: "AI Chat",
                description: "Ask questions like 'cheap Thai food in Delhi NCR' or 'what frontend tools have I saved?' and get answers based on your own saves.",
              },
              {
                title: "Model Choice",
                description: "Use the default Gemini 2.5 Flash model, or connect an OpenRouter key and choose the model you prefer.",
              },
              {
                title: "Personal Agents",
                description: "Run an agent over a label to extract the details you care about, or sort the current library view into new labels.",
              },
              {
                title: "Personal Digests",
                description: "Set the tone and scope once, then receive a weekly email built from your saves. E.g. something new to do/somewhere new to go every weekend!",
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
            Create an account and install the extension to get started
          </p>
          <Link
            href="/signup"
            className="mt-6 inline-block rounded-lg bg-white px-6 py-3 text-sm font-medium text-indigo-600 transition-colors hover:bg-indigo-50"
          >
            Get started for free
          </Link>
          <Link
              href="https://chromewebstore.google.com/detail/savenet-save-smarter-find/kmbfnbpogmgfmlohnajkpmeicocpedof"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-6 inline-block rounded-lg bg-white px-6 py-3 text-sm font-medium text-indigo-600 transition-colors hover:bg-indigo-50"
            >
            Extension
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
            <Link href = "https://github.com/hrmtsh2/savenet-web" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
              GitHub
            </Link>
            <Link href = "https://buymeacoffee.com/hrmtsh" className="text-xs text-muted-foreground hover:text-foreground transition-colors"> 
            </Link>
          </div>
        </div>
      </footer>

    </div>
  )
}
