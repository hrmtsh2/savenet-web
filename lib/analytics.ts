"use client"

import mixpanel from "mixpanel-browser"

const token = process.env.NEXT_PUBLIC_MIXPANEL_TOKEN
let initialized = false

function ensureInitialized() {
  if (!token || initialized) return Boolean(token)
  mixpanel.init(token, { persistence: "localStorage", track_pageview: false })
  initialized = true
  return true
}

export function identifyAnalyticsUser(userId: string) {
  if (!ensureInitialized()) return
  mixpanel.identify(userId)
}

export function trackAnalyticsEvent(
  event: string,
  properties: Record<string, string | number | boolean | null | undefined> = {},
) {
  if (!ensureInitialized()) return
  mixpanel.track(event, properties)
}
