// Extract meaningful job description content from raw page HTML.
// Priority: JSON-LD JobPosting → meta description → body HTML (scripts/styles stripped).
export function extractJobContent(html: string): string {
  // 1. JSON-LD JobPosting schema (schema.org) — used by many ATS platforms including Microsoft Careers
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

  // 2. Meta description — present on many job sites even when body is JS-rendered
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

  // 3. Body content stripped of scripts and styles — handles traditional HTML job pages
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i)
  const content = bodyMatch ? bodyMatch[1] : html
  return content
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .trim()
}
