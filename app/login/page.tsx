"use client"

import { Button } from "@/components/ui/button"
import { redirect } from "next/navigation"
import { useSession, signIn } from "next-auth/react"
import { useRouter } from "next/router"

export default function LoginPage() {
  const { status } = useSession()
  if (status === "authenticated"){
    redirect("/library")
  }
  if (status === "loading"){
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    )
  }
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-4">
      <div className="text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Welcome to SaveNet</h1>
        <p className="mt-1 text-sm text-muted-foreground">Log in to see your saved posts.</p>
      </div>
      <Button onClick={() => signIn("cognito", { callbackUrl: "/library" })}>Log in</Button>
    </div>
  )
}