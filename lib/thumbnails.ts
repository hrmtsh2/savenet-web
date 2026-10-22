import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3"
import { awsCredentialsProvider } from "@vercel/functions/oidc"
import { awsRoleArn } from "@/lib/aws"

const bucket = process.env.THUMBNAIL_S3_BUCKET
const client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: awsCredentialsProvider({
    roleArn: awsRoleArn,
    clientConfig: { region: process.env.AWS_REGION },
  }),
})
const maxThumbnailBytes = 10 * 1024 * 1024

export function thumbnailKey(userId: string, postId: number, extension = "jpg") {
  return `thumbnails/${userId}/${postId}.${extension}`
}

export async function storeThumbnail(url: string, key: string): Promise<boolean> {
  if (!bucket) {
    console.log("[savenet] thumbnail bucket is not configured")
    return false
  }
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(15_000) })
    if (!response.ok || !response.body) throw new Error(`thumbnail download returned ${response.status}`)
    const contentType = response.headers.get("content-type")?.split(";")[0].trim().toLowerCase() || "image/jpeg"
    if (!contentType.startsWith("image/")) throw new Error(`thumbnail has unsupported content type ${contentType}`)
    const contentLength = Number(response.headers.get("content-length") || 0)
    if (contentLength > maxThumbnailBytes) throw new Error("thumbnail is too large")
    const bytes = new Uint8Array(await response.arrayBuffer())
    if (bytes.byteLength === 0 || bytes.byteLength > maxThumbnailBytes) throw new Error("thumbnail has invalid size")
    await client.send(new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: bytes,
      ContentType: contentType,
      CacheControl: "public, max-age=31536000, immutable",
    }))
    return true
  } catch (error) {
    console.log("[savenet] thumbnail storage failed:", (error as Error).message)
    return false
  }
}

export async function getStoredThumbnail(key: string) {
  if (!bucket) throw new Error("Thumbnail bucket is not configured")
  return client.send(new GetObjectCommand({ Bucket: bucket, Key: key }))
}

export async function deleteStoredThumbnail(key: string) {
  if (!bucket) return
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }))
}
