"use client"

import { signIn } from "next-auth/react"
import { Button } from "@/components/ui/button"

export default function LoginPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-4">
      <div className="text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Welcome to SaveNet</h1>
        <p className="mt-1 text-sm text-muted-foreground">Log in to see your saved posts.</p>
      </div>
      <Button onClick={() => signIn("cognito", { callbackUrl: "/library" })}>Log in with Cognito</Button>
    </div>
  )
}