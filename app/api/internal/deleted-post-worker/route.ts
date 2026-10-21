import { checkDeletedPosts } from "@/lib/post-deletion"

function authorised(request: Request) {
  const secret = process.env.CRON_SECRET
  return Boolean(secret) && request.headers.get("authorization") === `Bearer ${secret}`
}

export async function GET(request: Request) {
  if (!authorised(request)) return Response.json({ error: "Unauthorized" }, { status: 401 })
  return Response.json(await checkDeletedPosts())
}
