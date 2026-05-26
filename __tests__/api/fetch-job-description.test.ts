import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import leverNoLists from '../fixtures/lever-posting-no-lists.json'
import leverWithLists from '../fixtures/lever-posting-with-lists.json'
import greenhouseScaleAI from '../fixtures/greenhouse-scaleai-job.json'
import eightfoldMicrosoft from '../fixtures/eightfold-microsoft-job.json'

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
    // Real URL from apply.careers.microsoft.com — used as routing key in fetch mock, not called live
    const EIGHTFOLD_URL = 'https://apply.careers.microsoft.com/careers/job/1970393556868060'
    const EIGHTFOLD_API = 'https://apply.careers.microsoft.com/api/apply/v2/jobs/1970393556868060'

    it('uses Eightfold API and prepends metadata header — real API fixture', async () => {
      // eightfoldMicrosoft is a snapshot of the real apply.careers.microsoft.com API response
      mockUser()
      const fetchMock = vi.fn().mockImplementation((url: string) => {
        if (url === EIGHTFOLD_API) return Promise.resolve(jsonResponse(eightfoldMicrosoft))
        return Promise.resolve(htmlResponse('<html><body>fallback</body></html>'))
      })
      vi.stubGlobal('fetch', fetchMock)

      const res = await POST(makeReq({ url: EIGHTFOLD_URL }))

      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.html).toContain('<h1>Principal Data Scientist</h1>')
      // display_job_id from real fixture
      expect(data.html).toContain('200037915')
      // department from real fixture
      expect(data.html).toContain('Data Science')
      // real locations include 'Washington, Redmond' (non-"Multiple Locations" entry)
      expect(data.html).toContain('Washington, Redmond')
      // 'Multiple Locations' entries are filtered out by buildEightfoldMeta
      expect(data.html).not.toContain('Multiple Locations')
      // real job_description starts with <b>Overview</b>
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

  describe('Greenhouse ATS', () => {
    const GH_API = 'https://boards-api.greenhouse.io/v1/boards/scaleai/jobs/4599700005'

    it('handles direct boards.greenhouse.io URL — real API fixture', async () => {
      // greenhouseScaleAI is a snapshot of the real boards-api.greenhouse.io response
      mockUser()
      const fetchMock = vi.fn().mockImplementation((url: string) => {
        if (url === GH_API) return Promise.resolve(jsonResponse(greenhouseScaleAI))
        return Promise.resolve(htmlResponse('<html><body>fallback</body></html>'))
      })
      vi.stubGlobal('fetch', fetchMock)

      const res = await POST(makeReq({ url: 'https://boards.greenhouse.io/scaleai/jobs/4599700005' }))

      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.html).toContain('<h1>Staff Infrastructure Software Engineer, Enterprise AI</h1>')
      expect(data.html).toContain('Scale AI')
      expect(data.html).toContain('New York, NY; San Francisco, CA')
      // Real content from fixture: double-encoded HTML should be decoded
      expect(data.html).toContain('<div')
      expect(data.html).toContain('Scale GP is building')
      // Only one fetch call — no HTML scraping
      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(fetchMock).toHaveBeenCalledWith(GH_API, expect.anything())
    })

    it('handles direct job-boards.greenhouse.io URL', async () => {
      mockUser()
      const fetchMock = vi.fn().mockImplementation((url: string) => {
        if (url === GH_API) return Promise.resolve(jsonResponse(greenhouseScaleAI))
        return Promise.resolve(htmlResponse('<html><body>fallback</body></html>'))
      })
      vi.stubGlobal('fetch', fetchMock)

      const res = await POST(makeReq({ url: 'https://job-boards.greenhouse.io/scaleai/jobs/4599700005' }))

      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.html).toContain('<h1>Staff Infrastructure Software Engineer, Enterprise AI</h1>')
      expect(fetchMock).toHaveBeenCalledWith(GH_API, expect.anything())
      expect(fetchMock).not.toHaveBeenCalledWith(
        'https://job-boards.greenhouse.io/scaleai/jobs/4599700005',
        expect.anything()
      )
    })

    it('detects Greenhouse from embedded page HTML (e.g. Scale.com)', async () => {
      mockUser()
      const pageHtml =
        '<html><body><script>window.__env={"jobUrl":"https://boards.greenhouse.io/scaleai/jobs/4599700005"}</script></body></html>'
      const fetchMock = vi.fn().mockImplementation((url: string) => {
        if (url === GH_API) return Promise.resolve(jsonResponse(greenhouseScaleAI))
        return Promise.resolve(htmlResponse(pageHtml))
      })
      vi.stubGlobal('fetch', fetchMock)

      const res = await POST(makeReq({ url: 'https://scale.com/careers/4599700005' }))

      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.html).toContain('<h1>Staff Infrastructure Software Engineer, Enterprise AI</h1>')
      expect(data.html).toContain('Scale GP is building')
      // Page was fetched, then API was called
      expect(fetchMock).toHaveBeenCalledWith('https://scale.com/careers/4599700005', expect.anything())
      expect(fetchMock).toHaveBeenCalledWith(GH_API, expect.anything())
    })

    it('falls back to extractJobContent when Greenhouse API returns non-2xx', async () => {
      mockUser()
      const pageHtml = '<html><body><script>greenhouse.io/scaleai/jobs/4599700005</script><p>Scraped JD</p></body></html>'
      const fetchMock = vi.fn().mockImplementation((url: string) => {
        if (url === GH_API) return Promise.resolve(jsonResponse({}, 404))
        return Promise.resolve(htmlResponse(pageHtml))
      })
      vi.stubGlobal('fetch', fetchMock)

      const res = await POST(makeReq({ url: 'https://scale.com/careers/4599700005' }))

      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.html).toBe('<p>Scraped JD</p>')
    })

    it('falls back to extractJobContent when Greenhouse API has no content', async () => {
      mockUser()
      const pageHtml = '<html><body><script>greenhouse.io/scaleai/jobs/4599700005</script><p>Scraped JD</p></body></html>'
      const fetchMock = vi.fn().mockImplementation((url: string) => {
        if (url === GH_API) return Promise.resolve(jsonResponse({ title: 'Engineer' }))
        return Promise.resolve(htmlResponse(pageHtml))
      })
      vi.stubGlobal('fetch', fetchMock)

      const res = await POST(makeReq({ url: 'https://scale.com/careers/4599700005' }))

      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.html).toBe('<p>Scraped JD</p>')
    })

    it('falls back to HTML scraping when direct Greenhouse API throws', async () => {
      mockUser()
      const fetchMock = vi.fn().mockImplementation((url: string) => {
        if (url === GH_API) return Promise.reject(new Error('network error'))
        return Promise.resolve(htmlResponse('<html><body><p>Scraped JD</p></body></html>'))
      })
      vi.stubGlobal('fetch', fetchMock)

      const res = await POST(makeReq({ url: 'https://boards.greenhouse.io/scaleai/jobs/4599700005' }))

      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.html).toBe('<p>Scraped JD</p>')
    })

    it('decodes double-encoded HTML entities in content — real fixture exercises this path', async () => {
      // greenhouseScaleAI.content is already double-encoded (&lt;div ...&gt;)
      // This test verifies the decoded output contains real HTML tags
      mockUser()
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse(greenhouseScaleAI))
      vi.stubGlobal('fetch', fetchMock)

      const res = await POST(makeReq({ url: 'https://boards.greenhouse.io/scaleai/jobs/4599700005' }))

      expect(res.status).toBe(200)
      const data = await res.json()
      // Decoded: &lt;div ...&gt; becomes <div ...>
      expect(data.html).toContain('<div')
      // Decoded: &quot; becomes "
      expect(data.html).toContain('"')
      // No raw entities should remain in the output
      expect(data.html).not.toContain('&lt;div')
    })
  })

  describe('Lever ATS (jobs.lever.co)', () => {
    // Real URLs from the Lever API — used as routing keys in fetch mocks, not called live in tests
    const LEVER_URL_NO_LISTS = 'https://jobs.lever.co/mistral/618c9763-cb22-4343-baca-cf1cf6b05f5c'
    const LEVER_API_NO_LISTS = 'https://api.lever.co/v0/postings/mistral/618c9763-cb22-4343-baca-cf1cf6b05f5c'
    const LEVER_URL_WITH_LISTS = 'https://jobs.lever.co/mistral/3e8b03e7-ff33-4cd1-8042-90b7ac3c4683'
    const LEVER_API_WITH_LISTS = 'https://api.lever.co/v0/postings/mistral/3e8b03e7-ff33-4cd1-8042-90b7ac3c4683'

    it('uses Lever API and prepends metadata header — real API fixture (no lists)', async () => {
      // leverNoLists is a snapshot of the real api.lever.co response for this posting
      mockUser()
      const fetchMock = vi.fn().mockImplementation((url: string) => {
        if (url === LEVER_API_NO_LISTS) return Promise.resolve(jsonResponse(leverNoLists))
        return Promise.resolve(htmlResponse('<html><body>fallback</body></html>'))
      })
      vi.stubGlobal('fetch', fetchMock)

      const res = await POST(makeReq({ url: LEVER_URL_NO_LISTS }))

      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.html).toContain('<h1>Account Executive, Digital Native US</h1>')
      expect(data.html).toContain('Business')
      expect(data.html).toContain('Palo Alto')
      expect(data.html).toContain('hybrid')
      // Real description content from the fixture
      expect(data.html).toContain('About Mistral')
      // Only one fetch — no HTML scraping
      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(fetchMock).toHaveBeenCalledWith(LEVER_API_NO_LISTS, expect.anything())
    })

    it('renders lists and opening sections — real API fixture (with lists + opening)', async () => {
      // leverWithLists has opening: "<div>About Mistral...</div>" and lists: [{ text: "What we offer", content: "..." }]
      mockUser()
      const fetchMock = vi.fn().mockImplementation((url: string) => {
        if (url === LEVER_API_WITH_LISTS) return Promise.resolve(jsonResponse(leverWithLists))
        return Promise.resolve(htmlResponse('<html><body>fallback</body></html>'))
      })
      vi.stubGlobal('fetch', fetchMock)

      const res = await POST(makeReq({ url: LEVER_URL_WITH_LISTS }))

      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.html).toContain('<h1>AI Developer Advocate - Singapore</h1>')
      // Opening section from real fixture
      expect(data.html).toContain('About Mistral')
      // List section header from real fixture
      expect(data.html).toContain('<h3>What we offer</h3>')
      // List content from real fixture
      expect(data.html).toContain('Competitive cash salary')
    })

    it('includes additional field when present', async () => {
      // No real fixture has additional populated; test the code path with minimal synthetic data
      mockUser()
      const withAdditional = { ...leverNoLists, additional: '<p>Equal opportunity employer</p>' }
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse(withAdditional))
      vi.stubGlobal('fetch', fetchMock)

      const res = await POST(makeReq({ url: LEVER_URL_NO_LISTS }))

      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.html).toContain('<p>Equal opportunity employer</p>')
    })

    it('falls back to HTML scraping when Lever API returns non-2xx', async () => {
      mockUser()
      const fetchMock = vi.fn().mockImplementation((url: string) => {
        if (url === LEVER_API_NO_LISTS) return Promise.resolve(jsonResponse({}, 404))
        return Promise.resolve(htmlResponse('<html><body><p>Scraped JD</p></body></html>'))
      })
      vi.stubGlobal('fetch', fetchMock)

      const res = await POST(makeReq({ url: LEVER_URL_NO_LISTS }))

      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.html).toBe('<p>Scraped JD</p>')
    })

    it('falls back to HTML scraping when Lever API has no body content', async () => {
      mockUser()
      const fetchMock = vi.fn().mockImplementation((url: string) => {
        if (url === LEVER_API_NO_LISTS) return Promise.resolve(jsonResponse({ text: 'Engineer' }))
        return Promise.resolve(htmlResponse('<html><body><p>Scraped JD</p></body></html>'))
      })
      vi.stubGlobal('fetch', fetchMock)

      const res = await POST(makeReq({ url: LEVER_URL_NO_LISTS }))

      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.html).toBe('<p>Scraped JD</p>')
    })

    it('falls back to HTML scraping when Lever API throws', async () => {
      mockUser()
      const fetchMock = vi.fn().mockImplementation((url: string) => {
        if (url === LEVER_API_NO_LISTS) return Promise.reject(new Error('network error'))
        return Promise.resolve(htmlResponse('<html><body><p>Scraped JD</p></body></html>'))
      })
      vi.stubGlobal('fetch', fetchMock)

      const res = await POST(makeReq({ url: LEVER_URL_NO_LISTS }))

      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.html).toBe('<p>Scraped JD</p>')
    })

    it('does not call Lever API for non-Lever URLs', async () => {
      mockUser()
      const fetchMock = vi.fn().mockResolvedValue(htmlResponse('<html><body><p>Regular</p></body></html>'))
      vi.stubGlobal('fetch', fetchMock)

      const res = await POST(makeReq({ url: 'https://example.com/jobs/abc123' }))

      expect(res.status).toBe(200)
      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining('api.lever.co'), expect.anything())
    })
  })
})
