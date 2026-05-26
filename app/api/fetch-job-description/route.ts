import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const MAX_BYTES = 500_000
const TIMEOUT_MS = 10_000
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

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

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  const rawUrl = typeof body?.url === 'string' ? body.url.trim() : ''

  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    return NextResponse.json({ error: 'Invalid URL' }, { status: 400 })
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return NextResponse.json({ error: 'Invalid URL' }, { status: 400 })
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const res = await fetch(parsed.toString(), {
      signal: controller.signal,
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      redirect: 'follow',
    })

    if (!res.ok) {
      console.error('fetch-job-description: non-2xx response', res.status, parsed.toString())
      return NextResponse.json({ error: 'Failed to fetch job description' }, { status: 502 })
    }

    const contentType = res.headers.get('content-type') ?? ''
    if (contentType && !/text\/|application\/(xhtml|xml|json)/i.test(contentType)) {
      console.error('fetch-job-description: non-text content-type', contentType)
      return NextResponse.json({ error: 'Failed to fetch job description' }, { status: 502 })
    }

    const text = await res.text()
    const raw = text.length > MAX_BYTES ? text.slice(0, MAX_BYTES) : text
    const html = extractJobContent(raw)

    return NextResponse.json({ html })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('fetch-job-description: fetch failed:', message, err)
    return NextResponse.json({ error: 'Failed to fetch job description' }, { status: 502 })
  } finally {
    clearTimeout(timeout)
  }
}
