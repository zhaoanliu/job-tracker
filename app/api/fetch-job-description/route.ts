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

  const body = await req.json().catch(() => ({}))
  const url = (body.url ?? '').toString().trim()

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
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  let res: Response
  try {
    res = await fetch(parsed.toString(), {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (compatible; ApplyTrackrBot/1.0; +https://applytrackr.app)',
        Accept: 'text/html,application/xhtml+xml',
      },
    })
  } catch (err: unknown) {
    clearTimeout(timeout)
    const message = err instanceof Error ? err.message : 'fetch failed'
    console.error('fetch-job-description: upstream fetch failed:', message, err)
    return NextResponse.json(
      { error: 'Could not reach that URL' },
      { status: 502 }
    )
  }
  clearTimeout(timeout)

  if (!res.ok) {
    return NextResponse.json(
      { error: `Upstream returned ${res.status}` },
      { status: 502 }
    )
  }

  const reader = res.body?.getReader()
  if (!reader) {
    return NextResponse.json({ error: 'Empty response' }, { status: 502 })
  }

  const chunks: Uint8Array[] = []
  let received = 0
  let truncated = false
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      if (value) {
        received += value.byteLength
        if (received > MAX_BYTES) {
          const remaining = MAX_BYTES - (received - value.byteLength)
          if (remaining > 0) chunks.push(value.slice(0, remaining))
          truncated = true
          try { await reader.cancel() } catch { /* ignore */ }
          break
        }
        chunks.push(value)
      }
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'read failed'
    console.error('fetch-job-description: stream read failed:', message, err)
    return NextResponse.json({ error: 'Failed to read response' }, { status: 502 })
  }

  const total = chunks.reduce((n, c) => n + c.byteLength, 0)
  const merged = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    merged.set(chunk, offset)
    offset += chunk.byteLength
  }
  const html = new TextDecoder('utf-8').decode(merged)

  return NextResponse.json({ html, truncated })
}
