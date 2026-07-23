"use client"

import { useSession, signIn } from "next-auth/react"
import { redirect } from "next/navigation"
import Link from "next/link"
import { useState } from "react"
import { SaveNetLogo } from "@/components/savenet-logo"

export default function LoginPage() {
  const { status } = useSession()
  const [loading, setLoading] = useState(false)

  if (status === "authenticated") {
    redirect("/library")
  }

  return (
    <div className="flex min-h-screen">
      {/* Left — brand panel */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-between bg-indigo-600 p-12">
        <div className="flex items-center gap-3">
          <Link href="/" className="flex items-center gap-3">
            <SaveNetLogo />
            <span className="text-xl font-semibold text-white">SaveNet</span>
          </Link>
        </div>

        <div className="flex flex-col gap-8">
          <div>
            <h1 className="text-4xl font-semibold text-white leading-tight">
              Save smarter,<br /> find faster
            </h1>
            <p className="mt-4 text-indigo-200 text-base leading-relaxed">
              SaveNet turns your social media saves and browser bookmarks into a searchable, AI-powered library.
            </p>
          </div>

          <ul className="flex flex-col gap-4">
            {[
              "Captures posts from Instagram and X as you save them",
              "Keeps source and collection labels on every save",
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
            <p className="mt-1 text-sm text-muted-foreground">Sign In</p>
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
              Sign Up
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
