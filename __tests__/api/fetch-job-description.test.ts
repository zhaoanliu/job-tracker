import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('next/headers', () => ({
  cookies: vi.fn(() => ({ getAll: vi.fn(() => []) })),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

import { POST } from '@/app/api/fetch-job-description/route'
import { createClient } from '@/lib/supabase/server'

function makeReq(body: unknown, jsonShouldThrow = false) {
  return {
    json: jsonShouldThrow
      ? vi.fn().mockRejectedValue(new Error('bad json'))
      : vi.fn().mockResolvedValue(body),
  } as any
}

function mockUser() {
  ;(createClient as ReturnType<typeof vi.fn>).mockReturnValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'uid-1' } } }) },
  })
}

function mockUnauthenticated() {
  ;(createClient as ReturnType<typeof vi.fn>).mockReturnValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
  })
}

function makeReader(chunks: Uint8Array[]) {
  let i = 0
  return {
    read: vi.fn().mockImplementation(async () => {
      if (i < chunks.length) {
        return { value: chunks[i++], done: false }
      }
      return { value: undefined, done: true }
    }),
    cancel: vi.fn().mockResolvedValue(undefined),
  }
}

const originalFetch = global.fetch

afterEach(() => {
  vi.clearAllMocks()
  global.fetch = originalFetch
})

describe('POST /api/fetch-job-description — auth', () => {
  it('returns 401 when unauthenticated', async () => {
    mockUnauthenticated()
    const res = await POST(makeReq({ url: 'https://example.com' }))
    expect(res.status).toBe(401)
  })
})

describe('POST /api/fetch-job-description — validation', () => {
  beforeEach(() => mockUser())

  it('returns 400 when URL is missing', async () => {
    const res = await POST(makeReq({}))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/URL is required/i)
  })

  it('returns 400 when URL is blank', async () => {
    const res = await POST(makeReq({ url: '   ' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when JSON body cannot be parsed', async () => {
    const res = await POST(makeReq(null, true))
    expect(res.status).toBe(400)
  })

  it('returns 400 when URL string is invalid', async () => {
    const res = await POST(makeReq({ url: 'not a url' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/Invalid URL/i)
  })

  it('returns 400 for non-http(s) protocol', async () => {
    const res = await POST(makeReq({ url: 'ftp://example.com/file' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/Invalid URL/i)
  })
})

describe('POST /api/fetch-job-description — fetch', () => {
  beforeEach(() => mockUser())

  it('returns 502 when upstream responds non-ok', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 404 }) as any
    const res = await POST(makeReq({ url: 'https://example.com/jobs/1' }))
    expect(res.status).toBe(502)
    const body = await res.json()
    expect(body.error).toMatch(/Failed to fetch/i)
  })

  it('returns 502 when upstream body is missing', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, body: null }) as any
    const res = await POST(makeReq({ url: 'https://example.com/jobs/1' }))
    expect(res.status).toBe(502)
    const body = await res.json()
    expect(body.error).toMatch(/Empty response/i)
  })

  it('returns html and truncated=false on success', async () => {
    const enc = new TextEncoder()
    const reader = makeReader([enc.encode('<p>hello world</p>')])
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      body: { getReader: () => reader },
    }) as any

    const res = await POST(makeReq({ url: 'https://example.com/jobs/1' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.html).toBe('<p>hello world</p>')
    expect(body.truncated).toBe(false)
  })

  it('truncates and sets truncated=true when payload exceeds the byte cap', async () => {
    const enc = new TextEncoder()
    const big = 'a'.repeat(600 * 1024)
    const reader = makeReader([enc.encode(big)])
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      body: { getReader: () => reader },
    }) as any

    const res = await POST(makeReq({ url: 'https://example.com/jobs/1' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.truncated).toBe(true)
    expect(body.html.length).toBeLessThanOrEqual(500 * 1024)
    expect(reader.cancel).toHaveBeenCalled()
  })

  it('returns 504 when the fetch is aborted', async () => {
    const aborted = Object.assign(new Error('aborted'), { name: 'AbortError' })
    global.fetch = vi.fn().mockRejectedValue(aborted) as any
    const res = await POST(makeReq({ url: 'https://example.com/jobs/1' }))
    expect(res.status).toBe(504)
    const body = await res.json()
    expect(body.error).toMatch(/timed out/i)
  })

  it('returns 502 on a generic fetch error', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('boom')) as any
    const res = await POST(makeReq({ url: 'https://example.com/jobs/1' }))
    expect(res.status).toBe(502)
    const body = await res.json()
    expect(body.error).toMatch(/Failed to fetch URL/i)
  })

  it('returns 502 on non-Error rejection (unknown error)', async () => {
    global.fetch = vi.fn().mockRejectedValue('weird') as any
    const res = await POST(makeReq({ url: 'https://example.com/jobs/1' }))
    expect(res.status).toBe(502)
  })

  it('handles a chunk where total + length stays under the cap', async () => {
    const enc = new TextEncoder()
    const reader = makeReader([
      enc.encode('first chunk '),
      enc.encode('second chunk'),
    ])
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      body: { getReader: () => reader },
    }) as any

    const res = await POST(makeReq({ url: 'https://example.com/jobs/1' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.html).toBe('first chunk second chunk')
    expect(body.truncated).toBe(false)
  })
})
