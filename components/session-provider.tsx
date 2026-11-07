"use client"

import { SessionProvider as NextAuthSessionProvider, useSession } from "next-auth/react"
import { useEffect } from "react"
import { identifyAnalyticsUser } from "@/lib/analytics"

export function SessionProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextAuthSessionProvider>
      <AnalyticsIdentity />
      {children}
    </NextAuthSessionProvider>
  )
}

function AnalyticsIdentity() {
  const { data: session } = useSession()

  useEffect(() => {
    if (session?.user?.id) identifyAnalyticsUser(session.user.id)
  }, [session?.user?.id])

  return null
}