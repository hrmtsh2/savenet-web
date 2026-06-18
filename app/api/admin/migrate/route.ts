import { readFile, readdir } from "node:fs/promises"
import path from "node:path"
import { query } from "@/lib/db"

// One-off migration runner. Guarded by the SaveNet API key.
// Runs every numbered *.sql file in scripts/ in ascending order. Each script is
// idempotent (CREATE ... IF NOT EXISTS), so re-running is safe.
export async function POST(req: Request) {
  const expected = process.env.SAVENET_API_KEY
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim()
  if (!expected || token !== expected) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const dir = path.join(process.cwd(), "scripts")
    const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort()
    const applied: string[] = []
    for (const file of files) {
      const sql = await readFile(path.join(dir, file), "utf8")
      await query(sql)
      applied.push(file)
    }

    const { rows } = await query<{ table_name: string }>(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name",
    )
    return Response.json({ ok: true, applied, tables: rows.map((r) => r.table_name) })
  } catch (err) {
    console.log("[v0] migrate error:", (err as Error).message)
    return Response.json({ error: (err as Error).message }, { status: 500 })
  }
}
