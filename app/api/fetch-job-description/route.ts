import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const MAX_BYTES = 500 * 1024
const FETCH_TIMEOUT_MS = 10_000

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  const url = (body?.url ?? '').trim()
  if (!url) {
    return NextResponse.json({ error: 'URL is required' }, { status: 400 })
  }

  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return NextResponse.json({ error: 'Invalid URL' }, { status: 400 })
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return NextResponse.json({ error: 'Invalid URL' }, { status: 400 })
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  try {
    const res = await fetch(parsed.toString(), {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (compatible; ApplyTrackrBot/1.0; +https://applytrackr.app)',
        Accept: 'text/html,application/xhtml+xml',
      },
    })

    if (!res.ok) {
      console.error('fetch-job-description upstream failed:', res.status, url)
      return NextResponse.json(
        { error: `Failed to fetch (status ${res.status})` },
        { status: 502 }
      )
    }

    const reader = res.body?.getReader()
    if (!reader) {
      return NextResponse.json({ error: 'Empty response from upstream' }, { status: 502 })
    }

    const chunks: Uint8Array[] = []
    let total = 0
    let truncated = false
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      if (value) {
        if (total + value.length > MAX_BYTES) {
          chunks.push(value.subarray(0, MAX_BYTES - total))
          total = MAX_BYTES
          truncated = true
          try { await reader.cancel() } catch {}
          break
        }
        chunks.push(value)
        total += value.length
      }
    }

    const buffer = new Uint8Array(total)
    let offset = 0
    for (const chunk of chunks) {
      buffer.set(chunk, offset)
      offset += chunk.length
    }
    const html = new TextDecoder('utf-8', { fatal: false }).decode(buffer)

    return NextResponse.json({ html, truncated })
  } catch (err: unknown) {
    const aborted = (err as { name?: string })?.name === 'AbortError'
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('fetch-job-description failed:', message, err)
    return NextResponse.json(
      { error: aborted ? 'Request timed out' : 'Failed to fetch URL' },
      { status: aborted ? 504 : 502 }
    )
  } finally {
    clearTimeout(timer)
  }
}
