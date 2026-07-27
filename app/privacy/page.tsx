import { SiteNav } from "@/components/site-nav"

export const metadata = {
  title: "Privacy Policy — SaveNet",
}

export default function PrivacyPage() {
  return (
    <div className="min-h-screen">
      <SiteNav />
      <main className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
        <h1 className="text-2xl font-semibold tracking-tight">Privacy Policy</h1>
        <p className="mt-1 text-sm text-muted-foreground">Last updated: {new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}</p>

        <div className="mt-8 flex flex-col gap-8 text-sm leading-relaxed text-foreground">

          <section className="flex flex-col gap-2">
            <h2 className="text-base font-medium">What SaveNet is</h2>
            <p className="text-muted-foreground">SaveNet is a browser extension and web application that captures posts you save on Instagram and X (Twitter), stores them in your personal library, and lets you search and chat with your saved content using AI.</p>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="text-base font-medium">What data we collect</h2>
            <ul className="flex flex-col gap-2 text-muted-foreground">
              <li><span className="font-medium text-foreground">Saved post content</span> — when you save a post on Instagram or X, SaveNet captures the post URL, caption, author handle, and any available thumbnail. This is stored in your personal library.</li>
              <li><span className="font-medium text-foreground">Account information</span> — your email address, collected via AWS Cognito when you create an account.</li>
              <li><span className="font-medium text-foreground">Chat history</span> — conversations you have with SaveNet's AI assistant are stored so you can resume them later.</li>
              <li><span className="font-medium text-foreground">Browser bookmarks and reading list</span> — only if you explicitly choose to import them via the extension popup. We do not access these automatically.</li>
            </ul>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="text-base font-medium">What data we do not collect</h2>
            <ul className="flex flex-col gap-2 text-muted-foreground">
              <li>We do not collect your Instagram or X credentials or login sessions.</li>
              <li>We do not access posts you have not explicitly saved.</li>
              <li>We do not track your browsing history beyond the specific save/bookmark action.</li>
              <li>We do not sell your data to third parties.</li>
            </ul>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="text-base font-medium">How we use your data</h2>
            <ul className="flex flex-col gap-2 text-muted-foreground">
              <li>Post content may be processed by Google Gemini for OCR and vector embeddings used in search. This processing happens server-side.</li>
              <li>Post URLs may be fetched server-side to extract additional context (page title, description, menu information) to improve recommendations.</li>
              <li>Your data is stored in Amazon Aurora PostgreSQL, hosted in the AWS Asia Pacific (Mumbai) region.</li>
            </ul>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="text-base font-medium">Third-party services</h2>
            <ul className="flex flex-col gap-2 text-muted-foreground">
              <li><span className="font-medium text-foreground">AWS Cognito</span> — handles account creation and authentication.</li>
              <li><span className="font-medium text-foreground">Amazon Aurora PostgreSQL</span> — stores your posts, labels, and chat history.</li>
              <li><span className="font-medium text-foreground">Google Gemini (via Vercel AI Gateway)</span> — generates summaries, embeddings, and chat responses.</li>
              <li><span className="font-medium text-foreground">Vercel</span> — hosts the SaveNet web application.</li>
            </ul>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="text-base font-medium">Data retention and deletion</h2>
            <p className="text-muted-foreground">Your posts, labels, and conversations are retained until you delete them. You can delete individual posts from the library view. To delete your account and all associated data, contact us at the email below.</p>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="text-base font-medium">Contact</h2>
            <p className="text-muted-foreground">For any privacy-related questions or data deletion requests, contact us at <a href="mailto:hermitishdev10@gmail.com" className="text-indigo-600 hover:underline">hermitishdev10@gmail.com</a>.</p>
          </section>

        </div>
      </main>
    </div>
  )
}
