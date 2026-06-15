import { Pool, type PoolClient } from "pg"
import { Signer } from "@aws-sdk/rds-signer"
import { awsCredentialsProvider } from "@vercel/functions/oidc"
import { attachDatabasePool } from "@vercel/functions"

const signer = new Signer({
  credentials: awsCredentialsProvider({
    roleArn: process.env.AWS_ROLE_ARN!,
    clientConfig: { region: process.env.AWS_REGION },
  }),
  region: process.env.AWS_REGION,
  hostname: process.env.PGHOST!,
  username: process.env.PGUSER || "postgres",
  port: 5432,
})

const pool = new Pool({
  host: process.env.PGHOST,
  database: process.env.PGDATABASE || "postgres",
  port: 5432,
  user: process.env.PGUSER || "postgres",
  password: () => signer.getAuthToken(),
  ssl: { rejectUnauthorized: false },
  max: 20,
})
attachDatabasePool(pool)

export async function query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<{ rows: T[] }> {
  const result = await pool.query(text, params)
  return { rows: result.rows as T[] }
}

export async function withConnection<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect()
  try {
    return await fn(client)
  } finally {
    client.release()
  }
}

// pgvector expects a string like "[0.1,0.2,...]"
export function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(",")}]`
}
