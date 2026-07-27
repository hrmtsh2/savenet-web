export async function fetchXOembed(postUrl: string): Promise<string | null> {
  try {
    const response = await fetch(`https://publish.twitter.com/oembed?url=${encodeURIComponent(postUrl)}&omit_script=true`)
    if (!response.ok) return null
    const data = await response.json()
    return (data.html as string | undefined)?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() || null
  } catch {
    return null
  }
}
