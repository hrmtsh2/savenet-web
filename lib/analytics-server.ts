const analyticsEndpoint = "https://api.mixpanel.com/track"

const allowedEvents = new Set([
  "post_captured",
  "enrichment_completed",
  "enrichment_failed",
])

type AnalyticsValue = string | number | boolean | null

export async function trackServerAnalytics(
  event: string,
  distinctId: string,
  properties: Record<string, AnalyticsValue> = {},
) {
  const token = process.env.MIXPANEL_TOKEN || process.env.NEXT_PUBLIC_MIXPANEL_TOKEN
  if (!token || !allowedEvents.has(event)) return

  try {
    const body = new URLSearchParams({
      data: JSON.stringify({
        event,
        properties: { token, distinct_id: distinctId, ...properties },
      }),
    })
    await fetch(analyticsEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    })
  } catch (error) {
    console.warn("[savenet] analytics event failed:", (error as Error).message)
  }
}
