export function extractJobContent(html: string): string {
  const jsonLdRegex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  let match: RegExpExecArray | null
  while ((match = jsonLdRegex.exec(html)) !== null) {
    try {
      const data: unknown = JSON.parse(match[1])
      const items = Array.isArray(data) ? data : [data]
      for (const item of items) {
        if (
          item !== null &&
          typeof item === 'object' &&
          (item as Record<string, unknown>)['@type'] === 'JobPosting' &&
          typeof (item as Record<string, unknown>).description === 'string' &&
          ((item as Record<string, unknown>).description as string).trim()
        ) {
          return ((item as Record<string, unknown>).description as string).trim()
        }
      }
    } catch {
      // invalid JSON, try next script tag
    }
  }

  const metaMatch =
    html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["'][^>]*\/?>/i) ??
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["'][^>]*\/?>/i)
  if (metaMatch?.[1]) {
    return metaMatch[1]
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&#39;/g, "'")
      .replace(/&quot;/g, '"')
      .trim()
  }

  const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i)
  const content = bodyMatch ? bodyMatch[1] : html
  return content
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .trim()
}
