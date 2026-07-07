"use client"

import { useSession, signIn } from "next-auth/react"
import { redirect } from "next/navigation"
import Link from "next/link"
import { useState } from "react"

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

export default function LoginPage() {
  const { status } = useSession()
  const [loading, setLoading] = useState(false);

  if (status === "authenticated") {
    redirect("/library")
  }

  return (
    <div className="flex min-h-screen">
      {/* Left — brand panel */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-between bg-indigo-600 p-12">
        <div className="flex items-center gap-3">
          <Link href="/" className="flex items-center grap-3">
            <SaveNetLogo />
            <span className="text-xl font-semibold text-white">SaveNet</span>
          </Link>
        </div>

        <div className="flex flex-col gap-8">
          <div>
            <h1 className="text-4xl font-semibold text-white leading-tight">
              Your saves,<br />working for you
            </h1>
            <p className="mt-4 text-indigo-200 text-base leading-relaxed">
              SaveNet turns the posts you bookmark into a searchable, AI-powered library.
            </p>
          </div>

          <ul className="flex flex-col gap-4">
            {[
              "Captures posts from Instagram and X as you save them",
              "Automatically classifies into categories you define",
              "Chat with your saves — get recommendations, menus, prices",
            ].map((feature) => (
              <li key={feature} className="flex items-start gap-3">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-300" />
                <span className="text-sm text-indigo-100 leading-relaxed">{feature}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="text-xs text-indigo-400">
          &copy; {new Date().getFullYear()} SaveNet
        </p>
      </div>

      {/* Right — auth panel */}
      <div className="flex w-full lg:w-1/2 flex-col items-center justify-center px-8 py-12 bg-background">
        {/* Mobile logo */}
        <div className="mb-8 flex items-center gap-3 lg:hidden">
          <Link href="/" className="mb-8 flex items-center gap-3 lg:hidden">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-600">
              <SaveNetLogo />
            </div>
            <span className="text-xl font-semibold">SaveNet</span>
          </Link>          
        </div>

        <div className="w-full max-w-sm flex flex-col gap-6">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Welcome back</h2>
            <p className="mt-1 text-sm text-muted-foreground">Sign in to your SaveNet account</p>
          </div>

          <button
            onClick={() => { setLoading(true); signIn("cognito", { callbackUrl: "/library" }) }}
            disabled={loading}
            className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? "Redirecting..." : "Continue with SaveNet"}
          </button>

          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs text-muted-foreground">new here?</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          <p className="text-center text-sm text-muted-foreground">
            Don&apos;t have an account?{" "}
            <Link href="/signup" className="font-medium text-indigo-600 hover:underline">
              Create one
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}