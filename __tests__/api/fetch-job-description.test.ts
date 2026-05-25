import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('next/headers', () => ({
  cookies: vi.fn(() => ({ getAll: vi.fn(() => []) })),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

import { POST } from '@/app/api/fetch-job-description/route'
import { createClient } from '@/lib/supabase/server'

function makeReq(body: unknown) {
  return { json: vi.fn().mockResolvedValue(body) } as any
}

function makeBadReq() {
  return { json: vi.fn().mockRejectedValue(new Error('bad json')) } as any
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
    read: vi.fn(async () => {
      if (i >= chunks.length) return { value: undefined, done: true }
      const value = chunks[i++]
      return { value, done: false }
    }),
    cancel: vi.fn(async () => {}),
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

describe('POST /api/fetch-job-description — URL validation', () => {
  beforeEach(() => mockUser())

  it('returns 400 when URL is missing', async () => {
    const res = await POST(makeReq({}))
    expect(res.status).toBe(400)
  })

  it('returns 400 when URL is malformed', async () => {
    const res = await POST(makeReq({ url: 'not a url' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when protocol is not http(s)', async () => {
    const res = await POST(makeReq({ url: 'ftp://example.com/file' }))
    expect(res.status).toBe(400)
  })

  it('treats unparseable JSON body as empty (returns 400)', async () => {
    const res = await POST(makeBadReq())
    expect(res.status).toBe(400)
  })
})

describe('POST /api/fetch-job-description — upstream errors', () => {
  beforeEach(() => mockUser())

  it('returns 502 when the upstream fetch throws', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('network down')) as any
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await POST(makeReq({ url: 'https://example.com' }))
    expect(res.status).toBe(502)
    expect(errorSpy).toHaveBeenCalled()
    errorSpy.mockRestore()
  })

  it('returns 502 when the upstream returns a non-OK status', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 503, body: null }) as any
    const res = await POST(makeReq({ url: 'https://example.com' }))
    expect(res.status).toBe(502)
    const data = await res.json()
    expect(data.error).toContain('503')
  })

  it('returns 502 when the response body is missing', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, body: null }) as any
    const res = await POST(makeReq({ url: 'https://example.com' }))
    expect(res.status).toBe(502)
  })

  it('returns 502 when a non-Error value is thrown from fetch', async () => {
    global.fetch = vi.fn().mockRejectedValue('plain string failure') as any
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await POST(makeReq({ url: 'https://example.com' }))
    expect(res.status).toBe(502)
    errorSpy.mockRestore()
  })
})

describe('POST /api/fetch-job-description — body streaming', () => {
  beforeEach(() => mockUser())

  it('reads the response body and returns the decoded HTML', async () => {
    const html = '<html><body>Hello world</body></html>'
    const chunks = [new TextEncoder().encode(html)]
    const reader = makeReader(chunks)
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      body: { getReader: () => reader },
    }) as any

    const res = await POST(makeReq({ url: 'https://example.com' }))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.html).toContain('Hello world')
    expect(data.truncated).toBe(false)
  })

  it('truncates when the body exceeds MAX_BYTES', async () => {
    const big = new Uint8Array(600 * 1024)
    big.fill(65)
    const reader = makeReader([big])
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      body: { getReader: () => reader },
    }) as any

    const res = await POST(makeReq({ url: 'https://example.com' }))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.truncated).toBe(true)
    expect(data.html.length).toBeLessThanOrEqual(500 * 1024)
    expect(reader.cancel).toHaveBeenCalled()
  })

  it('returns 502 when the stream read throws', async () => {
    const reader = {
      read: vi.fn().mockRejectedValue(new Error('connection reset')),
      cancel: vi.fn(),
    }
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      body: { getReader: () => reader },
    }) as any

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await POST(makeReq({ url: 'https://example.com' }))
    expect(res.status).toBe(502)
    errorSpy.mockRestore()
  })

  it('returns 502 with non-Error value thrown during stream read', async () => {
    const reader = {
      read: vi.fn().mockRejectedValue('weird non-error'),
      cancel: vi.fn(),
    }
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      body: { getReader: () => reader },
    }) as any

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await POST(makeReq({ url: 'https://example.com' }))
    expect(res.status).toBe(502)
    errorSpy.mockRestore()
  })

  it('ignores chunks with undefined value but continues reading', async () => {
    let calls = 0
    const reader = {
      read: vi.fn(async () => {
        calls++
        if (calls === 1) return { value: undefined, done: false }
        if (calls === 2) return { value: new TextEncoder().encode('<p>ok</p>'), done: false }
        return { value: undefined, done: true }
      }),
      cancel: vi.fn(),
    }
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      body: { getReader: () => reader },
    }) as any
    const res = await POST(makeReq({ url: 'https://example.com' }))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.html).toContain('ok')
  })

  it('handles reader.cancel() rejection gracefully when truncating', async () => {
    const big = new Uint8Array(600 * 1024)
    big.fill(66)
    const reader = {
      read: vi.fn()
        .mockResolvedValueOnce({ value: big, done: false })
        .mockResolvedValueOnce({ value: undefined, done: true }),
      cancel: vi.fn().mockRejectedValue(new Error('cancel boom')),
    }
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      body: { getReader: () => reader },
    }) as any
    const res = await POST(makeReq({ url: 'https://example.com' }))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.truncated).toBe(true)
  })
})
