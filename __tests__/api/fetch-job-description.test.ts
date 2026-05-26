import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('next/headers', () => ({
  cookies: vi.fn(() => ({ getAll: vi.fn(() => []) })),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

import { POST } from '@/app/api/fetch-job-description/route'
import { extractJobContent } from '@/lib/extract-job-content'
import { createClient } from '@/lib/supabase/server'

function makeReq(body: unknown) {
  return {
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Parameters<typeof POST>[0]
}

function mockUser() {
  ;(createClient as ReturnType<typeof vi.fn>).mockReturnValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'uid-1' } } }),
    },
  })
}

function mockUnauthenticated() {
  ;(createClient as ReturnType<typeof vi.fn>).mockReturnValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
    },
  })
}

function htmlResponse(text: string, init: { status?: number; contentType?: string } = {}) {
  const headers = new Map<string, string>()
  headers.set('content-type', init.contentType ?? 'text/html; charset=utf-8')
  return {
    ok: (init.status ?? 200) >= 200 && (init.status ?? 200) < 300,
    status: init.status ?? 200,
    headers: {
      get: (k: string) => headers.get(k.toLowerCase()) ?? null,
    },
    text: vi.fn().mockResolvedValue(text),
  }
}

function jsonResponse(data: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => 'application/json' },
    json: vi.fn().mockResolvedValue(data),
  }
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('extractJobContent', () => {
  it('extracts description from JSON-LD JobPosting', () => {
    const html = `<html><head>
      <script type="application/ld+json">{"@type":"JobPosting","description":"Build great things at Acme."}</script>
    </head><body><div id="root"></div></body></html>`
    expect(extractJobContent(html)).toBe('Build great things at Acme.')
  })

  it('handles JSON-LD array wrapping', () => {
    const html = `<script type="application/ld+json">[{"@type":"JobPosting","description":"Array-wrapped desc."}]</script>`
    expect(extractJobContent(html)).toBe('Array-wrapped desc.')
  })

  it('skips invalid JSON-LD and falls back to meta description', () => {
    const html = `<html><head>
      <script type="application/ld+json">not valid json</script>
      <meta name="description" content="Senior Engineer role at Acme Corp.">
    </head><body></body></html>`
    expect(extractJobContent(html)).toBe('Senior Engineer role at Acme Corp.')
  })

  it('decodes HTML entities in meta description', () => {
    const html = `<meta name="description" content="You&#39;ll love it &amp; so will we.">`
    expect(extractJobContent(html)).toBe("You'll love it & so will we.")
  })

  it('falls back to body content when no JSON-LD or meta', () => {
    const html = `<html><body><h2>Responsibilities</h2><ul><li>Code</li></ul></body></html>`
    expect(extractJobContent(html)).toBe('<h2>Responsibilities</h2><ul><li>Code</li></ul>')
  })

  it('strips scripts and styles from body fallback', () => {
    const html = `<html><body><script>alert(1)</script><style>.x{}</style><p>Job details</p></body></html>`
    expect(extractJobContent(html)).toBe('<p>Job details</p>')
  })

  it('returns content as-is when no body tag (HTML fragment)', () => {
    const html = `<p>Senior Software Engineer</p><ul><li>5+ years</li></ul>`
    expect(extractJobContent(html)).toBe(html)
  })
})

describe('POST /api/fetch-job-description', () => {
  it('returns 401 when user is not authenticated', async () => {
    mockUnauthenticated()
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const res = await POST(makeReq({ url: 'https://example.com/job' }))

    expect(res.status).toBe(401)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('returns 400 when URL is missing', async () => {
    mockUser()
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const res = await POST(makeReq({}))

    expect(res.status).toBe(400)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('returns 400 when URL is not parseable', async () => {
    mockUser()
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const res = await POST(makeReq({ url: 'not a url' }))

    expect(res.status).toBe(400)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('returns 400 when URL is not http(s)', async () => {
    mockUser()
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const res = await POST(makeReq({ url: 'file:///etc/passwd' }))

    expect(res.status).toBe(400)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('returns extracted body content on success', async () => {
    mockUser()
    const fetchMock = vi
      .fn()
      .mockResolvedValue(htmlResponse('<html><body><p>Job description</p></body></html>'))
    vi.stubGlobal('fetch', fetchMock)

    const res = await POST(makeReq({ url: 'https://example.com/job' }))

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.html).toBe('<p>Job description</p>')
    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.com/job',
      expect.objectContaining({
        headers: expect.objectContaining({
          'User-Agent': expect.stringContaining('Mozilla/5.0'),
        }),
      })
    )
  })

  it('returns 502 on non-2xx response', async () => {
    mockUser()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(htmlResponse('forbidden', { status: 403 })))

    const res = await POST(makeReq({ url: 'https://example.com/job' }))

    expect(res.status).toBe(502)
    const data = await res.json()
    expect(data.error).toBe('Failed to fetch job description')
  })

  it('returns 502 on network error', async () => {
    mockUser()
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')))

    const res = await POST(makeReq({ url: 'https://example.com/job' }))

    expect(res.status).toBe(502)
  })

  it('returns 502 on non-text content-type', async () => {
    mockUser()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(htmlResponse('binary', { contentType: 'image/png' }))
    )

    const res = await POST(makeReq({ url: 'https://example.com/job' }))

    expect(res.status).toBe(502)
  })

  it('truncates html to 500 KB cap', async () => {
    mockUser()
    const huge = 'a'.repeat(600_000)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(htmlResponse(huge)))

    const res = await POST(makeReq({ url: 'https://example.com/job' }))

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.html.length).toBe(500_000)
  })

  it('passes an AbortSignal to fetch (timeout protection)', async () => {
    mockUser()
    const fetchMock = vi.fn().mockResolvedValue(htmlResponse('<html></html>'))
    vi.stubGlobal('fetch', fetchMock)

    await POST(makeReq({ url: 'https://example.com/job' }))

    const call = fetchMock.mock.calls[0][1]
    expect(call.signal).toBeDefined()
    expect(call.signal).toBeInstanceOf(AbortSignal)
  })

  describe('Eightfold.ai ATS (/careers/job/{id} URLs)', () => {
    const EIGHTFOLD_URL = 'https://apply.careers.microsoft.com/careers/job/1234567'
    const EIGHTFOLD_API = 'https://apply.careers.microsoft.com/api/apply/v2/jobs/1234567'

    it('uses Eightfold API and prepends metadata header', async () => {
      mockUser()
      const apiData = {
        name: 'Principal Data Scientist',
        display_job_id: '200037915',
        t_create: 1747699200,
        locations: ['United States, Multiple Locations', 'United States, Washington, Redmond'],
        work_location_option: '0 days/week remote',
        department: 'Data Science',
        business_unit: 'Research',
        job_description: '<b>Overview</b><p>Great role.</p>',
      }
      const fetchMock = vi.fn().mockImplementation((url: string) => {
        if (url === EIGHTFOLD_API) return Promise.resolve(jsonResponse(apiData))
        return Promise.resolve(htmlResponse('<html><body>fallback</body></html>'))
      })
      vi.stubGlobal('fetch', fetchMock)

      const res = await POST(makeReq({ url: EIGHTFOLD_URL }))

      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.html).toContain('<h1>Principal Data Scientist</h1>')
      expect(data.html).toContain('200037915')
      expect(data.html).toContain('Data Science')
      expect(data.html).toContain('Washington, Redmond')
      expect(data.html).not.toContain('Multiple Locations')
      expect(data.html).toContain('<b>Overview</b>')
      // Eightfold API hit first, HTML scraping not used
      expect(fetchMock).toHaveBeenCalledWith(EIGHTFOLD_API, expect.anything())
      expect(fetchMock).not.toHaveBeenCalledWith(EIGHTFOLD_URL, expect.anything())
    })

    it('falls back to HTML scraping when Eightfold API returns non-2xx', async () => {
      mockUser()
      const fetchMock = vi.fn().mockImplementation((url: string) => {
        if (url === EIGHTFOLD_API) return Promise.resolve(jsonResponse({}, 404))
        return Promise.resolve(htmlResponse('<html><body><p>Scraped JD</p></body></html>'))
      })
      vi.stubGlobal('fetch', fetchMock)

      const res = await POST(makeReq({ url: EIGHTFOLD_URL }))

      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.html).toBe('<p>Scraped JD</p>')
    })

    it('falls back to HTML scraping when Eightfold API has no job_description', async () => {
      mockUser()
      const fetchMock = vi.fn().mockImplementation((url: string) => {
        if (url === EIGHTFOLD_API) return Promise.resolve(jsonResponse({ name: 'Engineer' }))
        return Promise.resolve(htmlResponse('<html><body><p>Scraped JD</p></body></html>'))
      })
      vi.stubGlobal('fetch', fetchMock)

      const res = await POST(makeReq({ url: EIGHTFOLD_URL }))

      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.html).toBe('<p>Scraped JD</p>')
    })

    it('falls back to HTML scraping when Eightfold API throws', async () => {
      mockUser()
      const fetchMock = vi.fn().mockImplementation((url: string) => {
        if (url === EIGHTFOLD_API) return Promise.reject(new Error('network error'))
        return Promise.resolve(htmlResponse('<html><body><p>Scraped JD</p></body></html>'))
      })
      vi.stubGlobal('fetch', fetchMock)

      const res = await POST(makeReq({ url: EIGHTFOLD_URL }))

      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.html).toBe('<p>Scraped JD</p>')
    })

    it('does not call Eightfold API for non-matching URLs', async () => {
      mockUser()
      const fetchMock = vi.fn().mockResolvedValue(htmlResponse('<html><body><p>Regular</p></body></html>'))
      vi.stubGlobal('fetch', fetchMock)

      const res = await POST(makeReq({ url: 'https://example.com/jobs/123' }))

      expect(res.status).toBe(200)
      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(fetchMock).toHaveBeenCalledWith('https://example.com/jobs/123', expect.anything())
    })
  })
})
