import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto"

const algorithm = "aes-256-gcm"

function encryptionKey() {
  const encoded = process.env.BYOK_ENCRYPTION_KEY
  if (!encoded) throw new Error("BYOK_ENCRYPTION_KEY is not configured")
  const key = Buffer.from(encoded, "base64")
  if (key.length !== 32) throw new Error("BYOK_ENCRYPTION_KEY must be a base64-encoded 32-byte key")
  return key
}

export function encryptApiKey(apiKey: string) {
  const iv = randomBytes(12)
  const cipher = createCipheriv(algorithm, encryptionKey(), iv)
  const ciphertext = Buffer.concat([cipher.update(apiKey, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, ciphertext]).toString("base64")
}

export function decryptApiKey(payload: string) {
  const data = Buffer.from(payload, "base64")
  const iv = data.subarray(0, 12)
  const tag = data.subarray(12, 28)
  const ciphertext = data.subarray(28)
  const decipher = createDecipheriv(algorithm, encryptionKey(), iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8")
}

export function keyHint(apiKey: string) {
  return apiKey.length <= 4 ? "••••" : `••••${apiKey.slice(-4)}`
}
