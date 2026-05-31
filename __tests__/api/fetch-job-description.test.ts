import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import leverNoLists from '../fixtures/lever-posting-no-lists.json'
import leverWithLists from '../fixtures/lever-posting-with-lists.json'
import greenhouseScaleAI from '../fixtures/greenhouse-scaleai-job.json'
import greenhouseSoFi from '../fixtures/greenhouse-sofi-job.json'
import greenhouseStripe from '../fixtures/greenhouse-stripe-job.json'
import eightfoldMicrosoft from '../fixtures/eightfold-microsoft-job.json'
import workdayAdobeJob from '../fixtures/workday-adobe-job.json'
import uberJob from '../fixtures/uber-job.json'
import expediaJob from '../fixtures/expedia-job.json'
import workableGableJob from '../fixtures/workable-gable-job.json'
import hubspotJob from '../fixtures/hubspot-job.json'

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

  it('decodes HTML-entity-encoded description in JSON-LD (e.g. Uber)', () => {
    const html = `<html><head>
      <script type="application/ld+json">{"@type":"JobPosting","description":"&lt;p&gt;&lt;strong&gt;About the Role&lt;/strong&gt;&lt;/p&gt;&lt;p&gt;You&#39;ll build great things &amp; more.&lt;/p&gt;"}</script>
    </head><body></body></html>`
    expect(extractJobContent(html)).toBe(
      "<p><strong>About the Role</strong></p><p>You'll build great things & more.</p>"
    )
  })

  it('decodes entity-encoded description from real Uber JSON-LD fixture (uber-job.json)', () => {
    const html = `<html><head><script type="application/ld+json">${JSON.stringify(uberJob)}</script></head><body></body></html>`
    const result = extractJobContent(html)
    expect(result).toContain('<p><strong>About the Role</strong></p>')
    expect(result).not.toContain('&lt;')
    expect(result).not.toContain('&gt;')
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

  describe('Stripe careers (stripe.com/jobs/listing/{slug}/{id})', () => {
    const STRIPE_URL =
      'https://stripe.com/jobs/listing/software-engineer-product-security-data-platforms/7761694'
    const STRIPE_URL_WITH_SRC =
      'https://stripe.com/jobs/listing/software-engineer-product-security-data-platforms/7761694?gh_src=73vnei'
    const STRIPE_GH_API = 'https://boards-api.greenhouse.io/v1/boards/stripe/jobs/7761694'

    it('uses Greenhouse API with board "stripe" and prepends metadata header — real API fixture', async () => {
      mockUser()
      const fetchMock = vi.fn().mockImplementation((url: string) => {
        if (url === STRIPE_GH_API) return Promise.resolve(jsonResponse(greenhouseStripe))
        return Promise.resolve(htmlResponse('<html><body>fallback</body></html>'))
      })
      vi.stubGlobal('fetch', fetchMock)

      const res = await POST(makeReq({ url: STRIPE_URL_WITH_SRC }))

      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.html).toContain('<h1>Software Engineer, Product Security Data Platforms</h1>')
      expect(data.html).toContain('Stripe')
      expect(data.html).toContain('Seattle')
      expect(data.html).toContain('<h2><strong>About the team</strong></h2>')
      expect(data.html).not.toContain('&lt;h2')
      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(fetchMock).toHaveBeenCalledWith(STRIPE_GH_API, expect.anything())
      expect(fetchMock).not.toHaveBeenCalledWith(
        expect.stringContaining('stripe.com/jobs/listing'),
        expect.anything()
      )
    })

    it('matches URL without the ?gh_src= tracking param', async () => {
      mockUser()
      const fetchMock = vi.fn().mockImplementation((url: string) => {
        if (url === STRIPE_GH_API) return Promise.resolve(jsonResponse(greenhouseStripe))
        return Promise.resolve(htmlResponse('<html><body>fallback</body></html>'))
      })
      vi.stubGlobal('fetch', fetchMock)

      const res = await POST(makeReq({ url: STRIPE_URL }))

      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.html).toContain('<h1>Software Engineer, Product Security Data Platforms</h1>')
      expect(fetchMock).toHaveBeenCalledWith(STRIPE_GH_API, expect.anything())
    })

    it('falls back to HTML scraping when Greenhouse API returns non-2xx', async () => {
      mockUser()
      const fetchMock = vi.fn().mockImplementation((url: string) => {
        if (url === STRIPE_GH_API) return Promise.resolve(jsonResponse({}, 404))
        return Promise.resolve(htmlResponse('<html><body><p>Scraped JD</p></body></html>'))
      })
      vi.stubGlobal('fetch', fetchMock)

      const res = await POST(makeReq({ url: STRIPE_URL }))

      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.html).toBe('<p>Scraped JD</p>')
    })

    it('falls back to HTML scraping when Greenhouse API throws', async () => {
      mockUser()
      const fetchMock = vi.fn().mockImplementation((url: string) => {
        if (url === STRIPE_GH_API) return Promise.reject(new Error('network error'))
        return Promise.resolve(htmlResponse('<html><body><p>Scraped JD</p></body></html>'))
      })
      vi.stubGlobal('fetch', fetchMock)

      const res = await POST(makeReq({ url: STRIPE_URL }))

      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.html).toBe('<p>Scraped JD</p>')
    })

    it('does not trigger handler for stripe.com URLs that are not /jobs/listing/{slug}/{id}', async () => {
      mockUser()
      const fetchMock = vi.fn().mockImplementation((url: string) => {
        if (url === STRIPE_GH_API) return Promise.resolve(jsonResponse(greenhouseStripe))
        return Promise.resolve(htmlResponse('<html><body><p>Other page</p></body></html>'))
      })
      vi.stubGlobal('fetch', fetchMock)

      const res = await POST(makeReq({ url: 'https://stripe.com/jobs/search?gh_jid=7761694' }))

      expect(res.status).toBe(200)
      expect(fetchMock).not.toHaveBeenCalledWith(STRIPE_GH_API, expect.anything())
    })
  })

  describe('Greenhouse embed board (?gh_jid= + embed script)', () => {
    const SOFI_URL = 'https://www.sofi.com/careers/job/?gh_jid=7679621003'
    const SOFI_GH_API = 'https://boards-api.greenhouse.io/v1/boards/sofi/jobs/7679621003'
    const embedPageHtml =
      '<html><body><script src="https://boards.greenhouse.io/embed/job_board/js?for=sofi"></script></body></html>'

    it('detects embed board via ?gh_jid= param + embed script and uses Greenhouse API — real fixture', async () => {
      mockUser()
      const fetchMock = vi.fn().mockImplementation((url: string) => {
        if (url === SOFI_GH_API) return Promise.resolve(jsonResponse(greenhouseSoFi))
        return Promise.resolve(htmlResponse(embedPageHtml))
      })
      vi.stubGlobal('fetch', fetchMock)

      const res = await POST(makeReq({ url: SOFI_URL }))

      expect(res.status).toBe(200)
      const data = await res.json()
      // Title and metadata from real fixture
      expect(data.html).toContain('<h1>Principal Engineer, Digital Identity</h1>')
      expect(data.html).toContain('SoFi')
      expect(data.html).toContain('WA - Seattle; CA - San Francisco')
      // Content is double-encoded and must be decoded
      expect(data.html).toContain('<div')
      expect(data.html).not.toContain('&lt;div')
      // Page was fetched, then API was called
      expect(fetchMock).toHaveBeenCalledWith(SOFI_URL, expect.anything())
      expect(fetchMock).toHaveBeenCalledWith(SOFI_GH_API, expect.anything())
    })

    it('falls back to HTML scraping when embed board API returns non-2xx', async () => {
      mockUser()
      const fallbackHtml =
        '<html><body><script src="https://boards.greenhouse.io/embed/job_board/js?for=sofi"></script><p>Scraped JD</p></body></html>'
      const fetchMock = vi.fn().mockImplementation((url: string) => {
        if (url === SOFI_GH_API) return Promise.resolve(jsonResponse({}, 404))
        return Promise.resolve(htmlResponse(fallbackHtml))
      })
      vi.stubGlobal('fetch', fetchMock)

      const res = await POST(makeReq({ url: SOFI_URL }))

      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.html).toBe('<p>Scraped JD</p>')
    })

    it('falls back to HTML scraping when embed board API throws', async () => {
      mockUser()
      const fallbackHtml =
        '<html><body><script src="https://boards.greenhouse.io/embed/job_board/js?for=sofi"></script><p>Scraped JD</p></body></html>'
      const fetchMock = vi.fn().mockImplementation((url: string) => {
        if (url === SOFI_GH_API) return Promise.reject(new Error('network error'))
        return Promise.resolve(htmlResponse(fallbackHtml))
      })
      vi.stubGlobal('fetch', fetchMock)

      const res = await POST(makeReq({ url: SOFI_URL }))

      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.html).toBe('<p>Scraped JD</p>')
    })

    it('does not call embed board API when no embed script in page HTML', async () => {
      mockUser()
      const fetchMock = vi.fn().mockImplementation((url: string) => {
        if (url === SOFI_GH_API) return Promise.resolve(jsonResponse(greenhouseSoFi))
        // Page has ?gh_jid= in URL but no embed script
        return Promise.resolve(htmlResponse('<html><body><p>No embed script</p></body></html>'))
      })
      vi.stubGlobal('fetch', fetchMock)

      const res = await POST(makeReq({ url: SOFI_URL }))

      expect(res.status).toBe(200)
      // Greenhouse API should NOT have been called
      expect(fetchMock).not.toHaveBeenCalledWith(SOFI_GH_API, expect.anything())
    })

    it('does not trigger for URL without ?gh_jid= param', async () => {
      mockUser()
      const fetchMock = vi.fn().mockImplementation((url: string) => {
        if (url === SOFI_GH_API) return Promise.resolve(jsonResponse(greenhouseSoFi))
        return Promise.resolve(htmlResponse(embedPageHtml))
      })
      vi.stubGlobal('fetch', fetchMock)

      const res = await POST(makeReq({ url: 'https://www.sofi.com/careers/job/' }))

      expect(res.status).toBe(200)
      // Only one fetch call — the page fetch; no Greenhouse API call
      expect(fetchMock).not.toHaveBeenCalledWith(SOFI_GH_API, expect.anything())
    })
  })

  describe('HubSpot careers (Greenhouse-backed)', () => {
    const HUBSPOT_GH_API = 'https://boards-api.greenhouse.io/v1/boards/hubspotjobs/jobs/7621322'

    it('handles www.hubspot.com careers URL — real Greenhouse API fixture', async () => {
      mockUser()
      const fetchMock = vi.fn().mockImplementation((url: string) => {
        if (url === HUBSPOT_GH_API) return Promise.resolve(jsonResponse(hubspotJob))
        return Promise.resolve(htmlResponse('<html><body>fallback</body></html>'))
      })
      vi.stubGlobal('fetch', fetchMock)

      const res = await POST(makeReq({ url: 'https://www.hubspot.com/careers/jobs/7621322' }))

      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.html).toContain(
        '<h1>Principal Software Engineer, Security, Detection & Response</h1>'
      )
      expect(data.html).toContain('HubSpot')
      expect(data.html).toContain('Remote - USA')
      expect(data.html).toContain('HubSpot is looking for a talented Principal Software Engineer')
      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(fetchMock).toHaveBeenCalledWith(HUBSPOT_GH_API, expect.anything())
    })

    it('handles bare hubspot.com hostname', async () => {
      mockUser()
      const fetchMock = vi.fn().mockImplementation((url: string) => {
        if (url === HUBSPOT_GH_API) return Promise.resolve(jsonResponse(hubspotJob))
        return Promise.resolve(htmlResponse('<html><body>fallback</body></html>'))
      })
      vi.stubGlobal('fetch', fetchMock)

      const res = await POST(makeReq({ url: 'https://hubspot.com/careers/jobs/7621322' }))

      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.html).toContain(
        '<h1>Principal Software Engineer, Security, Detection & Response</h1>'
      )
      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(fetchMock).toHaveBeenCalledWith(HUBSPOT_GH_API, expect.anything())
    })

    it('handles trailing slash in pathname', async () => {
      mockUser()
      const fetchMock = vi.fn().mockImplementation((url: string) => {
        if (url === HUBSPOT_GH_API) return Promise.resolve(jsonResponse(hubspotJob))
        return Promise.resolve(htmlResponse('<html><body>fallback</body></html>'))
      })
      vi.stubGlobal('fetch', fetchMock)

      const res = await POST(makeReq({ url: 'https://www.hubspot.com/careers/jobs/7621322/' }))

      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.html).toContain(
        '<h1>Principal Software Engineer, Security, Detection & Response</h1>'
      )
      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(fetchMock).toHaveBeenCalledWith(HUBSPOT_GH_API, expect.anything())
    })

    it('falls back to HTML scraping when Greenhouse API returns 404', async () => {
      mockUser()
      const fetchMock = vi.fn().mockImplementation((url: string) => {
        if (url === HUBSPOT_GH_API) return Promise.resolve(jsonResponse({}, 404))
        return Promise.resolve(htmlResponse('<html><body><p>Scraped JD</p></body></html>'))
      })
      vi.stubGlobal('fetch', fetchMock)

      const res = await POST(makeReq({ url: 'https://www.hubspot.com/careers/jobs/7621322' }))

      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.html).toBe('<p>Scraped JD</p>')
    })

    it('falls back to HTML scraping when Greenhouse API throws', async () => {
      mockUser()
      const fetchMock = vi.fn().mockImplementation((url: string) => {
        if (url === HUBSPOT_GH_API) return Promise.reject(new Error('network error'))
        return Promise.resolve(htmlResponse('<html><body><p>Scraped JD</p></body></html>'))
      })
      vi.stubGlobal('fetch', fetchMock)

      const res = await POST(makeReq({ url: 'https://www.hubspot.com/careers/jobs/7621322' }))

      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.html).toBe('<p>Scraped JD</p>')
    })

    it('does not trigger for non-job HubSpot URL', async () => {
      mockUser()
      const fetchMock = vi.fn().mockImplementation((url: string) => {
        if (url === HUBSPOT_GH_API) return Promise.resolve(jsonResponse(hubspotJob))
        return Promise.resolve(htmlResponse('<html><body><p>Products page</p></body></html>'))
      })
      vi.stubGlobal('fetch', fetchMock)

      const res = await POST(makeReq({ url: 'https://www.hubspot.com/products' }))

      expect(res.status).toBe(200)
      expect(fetchMock).not.toHaveBeenCalledWith(HUBSPOT_GH_API, expect.anything())
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

  describe('Workday ATS (*.wd*.myworkdayjobs.com)', () => {
    // Real URL from the Adobe Workday job page used to capture the fixture
    const WORKDAY_URL =
      'https://adobe.wd5.myworkdayjobs.com/en-US/external_experienced/job/San-Francisco/Senior-Software-Engineer--Test-Automation_R168193'

    // workdayAdobeJob is a snapshot of the JSON-LD JobPosting block from the real
    // adobe.wd5.myworkdayjobs.com page (observed 2026-05-26). Workday embeds this in
    // the initial HTML; the CXS API requires browser cookies so is not used server-side.
    function workdayPage(ld: object): string {
      return `<html><head><script type="application/ld+json">${JSON.stringify(ld)}</script></head><body><div id="root"></div></body></html>`
    }

    it('extracts metadata header and description from JSON-LD — real fixture data', async () => {
      mockUser()
      const fetchMock = vi.fn().mockResolvedValue(htmlResponse(workdayPage(workdayAdobeJob)))
      vi.stubGlobal('fetch', fetchMock)

      const res = await POST(makeReq({ url: WORKDAY_URL }))

      expect(res.status).toBe(200)
      const data = await res.json()
      // Title from fixture
      expect(data.html).toContain('<h1>Senior Software Engineer</h1>')
      // Job ID from identifier.value in fixture
      expect(data.html).toContain('R168193')
      // Date posted from fixture
      expect(data.html).toContain('2026-05-26')
      // Location from jobLocation.address in fixture
      expect(data.html).toContain('San Francisco, United States of America')
      // Employment type: FULL_TIME → Full time
      expect(data.html).toContain('Full time')
      // Company from hiringOrganization.name in fixture
      expect(data.html).toContain('ADUS-Adobe Inc.')
      // Description content from fixture (plain text from Workday JSON-LD)
      expect(data.html).toContain('Project Graph')
      // Only one fetch — page HTML, no separate API call
      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(fetchMock).toHaveBeenCalledWith(WORKDAY_URL, expect.anything())
    })

    it('handles URL without en-US locale prefix', async () => {
      mockUser()
      const fetchMock = vi.fn().mockResolvedValue(htmlResponse(workdayPage(workdayAdobeJob)))
      vi.stubGlobal('fetch', fetchMock)

      const res = await POST(
        makeReq({ url: 'https://adobe.wd5.myworkdayjobs.com/external_experienced/job/Senior-Software-Engineer_R168193' })
      )

      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.html).toContain('<h1>Senior Software Engineer</h1>')
    })

    it('handles wd1 through wd9 instance numbers', async () => {
      mockUser()
      const fetchMock = vi.fn().mockResolvedValue(htmlResponse(workdayPage(workdayAdobeJob)))
      vi.stubGlobal('fetch', fetchMock)

      const res = await POST(
        makeReq({ url: 'https://amazon.wd1.myworkdayjobs.com/en-US/amazon_external/job/Title_REQ-12345' })
      )

      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.html).toContain('<h1>Senior Software Engineer</h1>')
    })

    it('falls back to extractJobContent when JSON-LD has no description', async () => {
      // Synthetic: real fixture always has description; this tests the missing-field branch
      mockUser()
      const noDescLd = { '@type': 'JobPosting', title: 'Engineer' }
      const fetchMock = vi.fn().mockResolvedValue(
        htmlResponse(`<html><head><script type="application/ld+json">${JSON.stringify(noDescLd)}</script></head><body><p>Body content</p></body></html>`)
      )
      vi.stubGlobal('fetch', fetchMock)

      const res = await POST(makeReq({ url: WORKDAY_URL }))

      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.html).toBe('<p>Body content</p>')
    })

    it('falls back to extractJobContent when page has no JSON-LD', async () => {
      mockUser()
      const fetchMock = vi.fn().mockResolvedValue(
        htmlResponse('<html><body><p>Scraped JD</p></body></html>')
      )
      vi.stubGlobal('fetch', fetchMock)

      const res = await POST(makeReq({ url: WORKDAY_URL }))

      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.html).toBe('<p>Scraped JD</p>')
    })

    it('falls back to extractJobContent when JSON-LD is invalid JSON', async () => {
      mockUser()
      const fetchMock = vi.fn().mockResolvedValue(
        htmlResponse('<html><head><script type="application/ld+json">not valid json</script></head><body><p>Body</p></body></html>')
      )
      vi.stubGlobal('fetch', fetchMock)

      const res = await POST(makeReq({ url: WORKDAY_URL }))

      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.html).toBe('<p>Body</p>')
    })

    it('returns 502 when the page fetch fails', async () => {
      mockUser()
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(htmlResponse('', { status: 403 })))

      const res = await POST(makeReq({ url: WORKDAY_URL }))

      expect(res.status).toBe(502)
    })

    it('does not apply Workday handler for non-Workday URLs', async () => {
      mockUser()
      const fetchMock = vi.fn().mockResolvedValue(htmlResponse('<html><body><p>Regular</p></body></html>'))
      vi.stubGlobal('fetch', fetchMock)

      const res = await POST(makeReq({ url: 'https://example.com/jobs/123' }))

      expect(res.status).toBe(200)
      const data = await res.json()
      // No Workday metadata header prepended
      expect(data.html).not.toContain('<table>')
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })
  })

  describe('Uber ATS (www.uber.com/global/en/careers/list)', () => {
    const UBER_URL = 'https://www.uber.com/global/en/careers/list/156729/'

    // uberJob is a snapshot of the JSON-LD JobPosting block from the real Uber job page
    // (www.uber.com/global/en/careers/list/156729/, observed 2026-05-26).
    function uberPage(ld: object): string {
      return `<html><head><script type="application/ld+json">${JSON.stringify(ld)}</script></head><body></body></html>`
    }

    it('extracts metadata header and decoded description from JSON-LD — real fixture data', async () => {
      mockUser()
      const fetchMock = vi.fn().mockResolvedValue(htmlResponse(uberPage(uberJob)))
      vi.stubGlobal('fetch', fetchMock)

      const res = await POST(makeReq({ url: UBER_URL }))

      expect(res.status).toBe(200)
      const data = await res.json()
      // Title from fixture
      expect(data.html).toContain('<h1>Staff Software Engineer</h1>')
      // Department from occupationalCategory in fixture
      expect(data.html).toContain('Engineering')
      // Location from jobLocation.address in fixture (city, state)
      expect(data.html).toContain('Seattle, Washington')
      // Work type: "Full-Time" → "Full Time"
      expect(data.html).toContain('Full Time')
      // Description decoded: entity-encoded HTML should be real tags
      expect(data.html).toContain('<p><strong>About the Role</strong></p>')
      expect(data.html).not.toContain('&lt;')
      // Only one fetch — page HTML, no separate API call
      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(fetchMock).toHaveBeenCalledWith(UBER_URL, expect.anything())
    })

    it('handles array jobLocation with multiple entries', async () => {
      // Synthetic: real fixture has one location; multi-location is possible in practice
      mockUser()
      const multiLoc = {
        ...uberJob,
        jobLocation: [
          { '@type': 'Place', address: { '@type': 'PostalAddress', addressLocality: 'Seattle', addressRegion: 'Washington' } },
          { '@type': 'Place', address: { '@type': 'PostalAddress', addressLocality: 'Sunnyvale', addressRegion: 'California' } },
        ],
      }
      const fetchMock = vi.fn().mockResolvedValue(htmlResponse(uberPage(multiLoc)))
      vi.stubGlobal('fetch', fetchMock)

      const res = await POST(makeReq({ url: UBER_URL }))

      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.html).toContain('Seattle, Washington | Sunnyvale, California')
    })

    it('falls back to extractJobContent when JSON-LD has no description', async () => {
      // Synthetic: real fixture always has description; tests the missing-field branch
      mockUser()
      const noDesc = { '@type': 'JobPosting', title: 'Staff Software Engineer' }
      const fetchMock = vi.fn().mockResolvedValue(
        htmlResponse(`<html><head><script type="application/ld+json">${JSON.stringify(noDesc)}</script></head><body><p>Body content</p></body></html>`)
      )
      vi.stubGlobal('fetch', fetchMock)

      const res = await POST(makeReq({ url: UBER_URL }))

      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.html).toBe('<p>Body content</p>')
    })

    it('falls back to extractJobContent when page has no JSON-LD', async () => {
      mockUser()
      const fetchMock = vi.fn().mockResolvedValue(
        htmlResponse('<html><body><p>Scraped JD</p></body></html>')
      )
      vi.stubGlobal('fetch', fetchMock)

      const res = await POST(makeReq({ url: UBER_URL }))

      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.html).toBe('<p>Scraped JD</p>')
    })

    it('returns 502 when the page fetch fails', async () => {
      mockUser()
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(htmlResponse('', { status: 403 })))

      const res = await POST(makeReq({ url: UBER_URL }))

      expect(res.status).toBe(502)
    })

    it('does not apply Uber handler for non-Uber URLs', async () => {
      mockUser()
      const fetchMock = vi.fn().mockResolvedValue(htmlResponse('<html><body><p>Regular</p></body></html>'))
      vi.stubGlobal('fetch', fetchMock)

      const res = await POST(makeReq({ url: 'https://example.com/global/en/careers/list/123/' }))

      expect(res.status).toBe(200)
      expect(fetchMock).toHaveBeenCalledTimes(1)
      const data = await res.json()
      expect(data.html).not.toContain('<table>')
    })
  })

  describe('Workable ATS (apply.workable.com)', () => {
    const WORKABLE_URL = 'https://apply.workable.com/gable/j/6EF9ADEAB7'
    const WORKABLE_API = 'https://apply.workable.com/api/v1/accounts/gable/jobs/6EF9ADEAB7'

    it('uses Workable API and prepends metadata header — real API fixture', async () => {
      mockUser()
      const fetchMock = vi.fn().mockImplementation((url: string) => {
        if (url === WORKABLE_API) return Promise.resolve(jsonResponse(workableGableJob))
        return Promise.resolve(htmlResponse('<html><body>fallback</body></html>'))
      })
      vi.stubGlobal('fetch', fetchMock)

      const res = await POST(makeReq({ url: WORKABLE_URL }))

      expect(res.status).toBe(200)
      const data = await res.json()
      // Title from fixture
      expect(data.html).toContain('<h1>Staff Software Engineer, Infrastructure</h1>')
      // Location: city + region from fixture
      expect(data.html).toContain('Seattle, Washington')
      // Department from fixture
      expect(data.html).toContain('Engineering')
      // type "full" → "Full-time"
      expect(data.html).toContain('Full-time')
      // workplace "hybrid" → "Hybrid"
      expect(data.html).toContain('Hybrid')
      // Description body content from fixture
      expect(data.html).toContain('Gable helps engineering teams')
      // Requirements body content from fixture
      expect(data.html).toContain('7+ years')
      // Benefits body content from fixture
      expect(data.html).toContain('Unlimited PTO')
      // Only one fetch — API, no HTML scraping
      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(fetchMock).toHaveBeenCalledWith(WORKABLE_API, expect.anything())
    })

    it('falls back to HTML scraping when Workable API returns non-2xx', async () => {
      mockUser()
      const fetchMock = vi.fn().mockImplementation((url: string) => {
        if (url === WORKABLE_API) return Promise.resolve(jsonResponse({}, 404))
        return Promise.resolve(htmlResponse('<html><body><p>Scraped JD</p></body></html>'))
      })
      vi.stubGlobal('fetch', fetchMock)

      const res = await POST(makeReq({ url: WORKABLE_URL }))

      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.html).toBe('<p>Scraped JD</p>')
    })

    it('falls back to HTML scraping when Workable API has no body content', async () => {
      mockUser()
      const fetchMock = vi.fn().mockImplementation((url: string) => {
        if (url === WORKABLE_API) return Promise.resolve(jsonResponse({ title: 'Engineer' }))
        return Promise.resolve(htmlResponse('<html><body><p>Scraped JD</p></body></html>'))
      })
      vi.stubGlobal('fetch', fetchMock)

      const res = await POST(makeReq({ url: WORKABLE_URL }))

      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.html).toBe('<p>Scraped JD</p>')
    })

    it('falls back to HTML scraping when Workable API throws', async () => {
      mockUser()
      const fetchMock = vi.fn().mockImplementation((url: string) => {
        if (url === WORKABLE_API) return Promise.reject(new Error('network error'))
        return Promise.resolve(htmlResponse('<html><body><p>Scraped JD</p></body></html>'))
      })
      vi.stubGlobal('fetch', fetchMock)

      const res = await POST(makeReq({ url: WORKABLE_URL }))

      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.html).toBe('<p>Scraped JD</p>')
    })

    it('does not call Workable API for non-matching URLs', async () => {
      mockUser()
      const fetchMock = vi.fn().mockResolvedValue(htmlResponse('<html><body><p>Regular</p></body></html>'))
      vi.stubGlobal('fetch', fetchMock)

      const res = await POST(makeReq({ url: 'https://example.com/jobs/6EF9ADEAB7' }))

      expect(res.status).toBe(200)
      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining('apply.workable.com'), expect.anything())
    })

    it('handles posting with title only and no metadata fields', async () => {
      // Synthetic: real fixture has every metadata field populated; this exercises the
      // false branches of location/department/type/workplace handling and the
      // `rows.length === 0` early-return path inside buildWorkableMeta.
      mockUser()
      const minimalJob = {
        title: 'Minimal Engineer',
        description: '<p>Body content</p>',
      }
      const fetchMock = vi.fn().mockImplementation((url: string) => {
        if (url === WORKABLE_API) return Promise.resolve(jsonResponse(minimalJob))
        return Promise.resolve(htmlResponse('<html><body>fallback</body></html>'))
      })
      vi.stubGlobal('fetch', fetchMock)

      const res = await POST(makeReq({ url: WORKABLE_URL }))

      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.html).toContain('<h1>Minimal Engineer</h1>')
      expect(data.html).toContain('<p>Body content</p>')
      expect(data.html).not.toContain('<table>')
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    it('uses country when region is missing and omits title when absent', async () => {
      // Synthetic: real fixture has region populated and a title; this exercises the
      // `region || country` fallback and the title-less header path in buildWorkableMeta.
      mockUser()
      const job = {
        description: '<p>Body</p>',
        location: { city: 'London', region: '', country: 'United Kingdom' },
        department: ['Platform'],
        type: 'unknown',
        workplace: 'remote',
      }
      const fetchMock = vi.fn().mockImplementation((url: string) => {
        if (url === WORKABLE_API) return Promise.resolve(jsonResponse(job))
        return Promise.resolve(htmlResponse('<html><body>fallback</body></html>'))
      })
      vi.stubGlobal('fetch', fetchMock)

      const res = await POST(makeReq({ url: WORKABLE_URL }))

      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.html).not.toContain('<h1>')
      expect(data.html).toContain('London, United Kingdom')
      expect(data.html).toContain('Platform')
      expect(data.html).toContain('Remote')
      expect(data.html).not.toContain('Work type')
    })
  })

  describe('Generic schema.org/JobPosting JSON-LD (e.g. Expedia careers.expediagroup.com)', () => {
    // Real URL from careers.expediagroup.com — used as the input URL in tests
    const EXPEDIA_URL =
      'https://careers.expediagroup.com/job/principal-software-development-engineer-developer-productivity-amp-insights/seattle-wa/R-105467-3/'

    // expediaJob is a snapshot of the JobPosting JSON-LD block embedded in the real
    // careers.expediagroup.com page (observed 2026-05-30). The site is WordPress-powered
    // and inlines standard schema.org/JobPosting markup with identifier as a plain string.
    function expediaPage(ld: object): string {
      return `<html><head><script type="application/ld+json">${JSON.stringify(ld)}</script></head><body></body></html>`
    }

    it('extracts metadata header and description from JSON-LD — real fixture data', async () => {
      mockUser()
      const fetchMock = vi.fn().mockResolvedValue(htmlResponse(expediaPage(expediaJob)))
      vi.stubGlobal('fetch', fetchMock)

      const res = await POST(makeReq({ url: EXPEDIA_URL }))

      expect(res.status).toBe(200)
      const data = await res.json()
      // Title from fixture (HTML entities render correctly in <h1>)
      expect(data.html).toContain('<h1>Principal Software Development Engineer - Developer Productivity &amp; Insights</h1>')
      // Company from hiringOrganization.name in fixture
      expect(data.html).toContain('Expedia Group')
      // Job ID: fixture has identifier as a plain string "R-105467-3"
      expect(data.html).toContain('R-105467-3')
      // Date posted from fixture
      expect(data.html).toContain('2026-05-22')
      // Location from jobLocation.address.addressLocality + addressRegion in fixture
      expect(data.html).toContain('Seattle, WA')
      // Description content from fixture
      expect(data.html).toContain('Developer Productivity')
      // Only one fetch — page HTML, no separate API call
      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(fetchMock).toHaveBeenCalledWith(EXPEDIA_URL, expect.anything())
    })

    it('handles identifier as an object with value field', async () => {
      // Synthetic: real fixture has identifier as string; object form appears in Workday-style JSON-LD
      mockUser()
      const withObjId = { ...expediaJob, identifier: { '@type': 'PropertyValue', value: 'EXP-99999' } }
      const fetchMock = vi.fn().mockResolvedValue(htmlResponse(expediaPage(withObjId)))
      vi.stubGlobal('fetch', fetchMock)

      const res = await POST(makeReq({ url: EXPEDIA_URL }))

      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.html).toContain('EXP-99999')
    })

    it('handles array jobLocation with multiple entries', async () => {
      // Synthetic: real fixture has one jobLocation; multi-location is possible in practice
      mockUser()
      const multiLoc = {
        ...expediaJob,
        jobLocation: [
          { '@type': 'Place', address: { '@type': 'PostalAddress', addressLocality: 'Seattle', addressRegion: 'WA' } },
          { '@type': 'Place', address: { '@type': 'PostalAddress', addressLocality: 'Austin', addressRegion: 'TX' } },
        ],
      }
      const fetchMock = vi.fn().mockResolvedValue(htmlResponse(expediaPage(multiLoc)))
      vi.stubGlobal('fetch', fetchMock)

      const res = await POST(makeReq({ url: EXPEDIA_URL }))

      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.html).toContain('Seattle, WA | Austin, TX')
    })

    it('falls back to extractJobContent when JSON-LD has no description', async () => {
      mockUser()
      const noDesc = { '@type': 'JobPosting', title: 'Principal SDE', identifier: 'R-105467-3' }
      const fetchMock = vi.fn().mockResolvedValue(
        htmlResponse(`<html><head><script type="application/ld+json">${JSON.stringify(noDesc)}</script></head><body><p>Body content</p></body></html>`)
      )
      vi.stubGlobal('fetch', fetchMock)

      const res = await POST(makeReq({ url: EXPEDIA_URL }))

      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.html).toBe('<p>Body content</p>')
    })

    it('falls back to extractJobContent when page has no JSON-LD', async () => {
      mockUser()
      const fetchMock = vi.fn().mockResolvedValue(
        htmlResponse('<html><body><p>Scraped JD</p></body></html>')
      )
      vi.stubGlobal('fetch', fetchMock)

      const res = await POST(makeReq({ url: EXPEDIA_URL }))

      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.html).toBe('<p>Scraped JD</p>')
    })

    it('returns 502 when the page fetch fails', async () => {
      mockUser()
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(htmlResponse('', { status: 403 })))

      const res = await POST(makeReq({ url: EXPEDIA_URL }))

      expect(res.status).toBe(502)
    })

    it('does not fire generic handler for pages with no JobPosting JSON-LD', async () => {
      mockUser()
      const fetchMock = vi.fn().mockResolvedValue(htmlResponse('<html><body><p>Regular</p></body></html>'))
      vi.stubGlobal('fetch', fetchMock)

      const res = await POST(makeReq({ url: 'https://example.com/jobs/123' }))

      expect(res.status).toBe(200)
      expect(fetchMock).toHaveBeenCalledTimes(1)
      const data = await res.json()
      // No metadata table prepended when there is no JobPosting JSON-LD
      expect(data.html).not.toContain('<table>')
    })
  })

  describe('LinkedIn ATS (linkedin.com/jobs/view/{id} URLs)', () => {
    const linkedinJobHtml = readFileSync(
      join(__dirname, '../fixtures/linkedin-job.html'),
      'utf-8'
    )
    const LINKEDIN_URL = 'https://www.linkedin.com/jobs/view/4415502323'
    const LINKEDIN_API =
      'https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/4415502323'

    it('extracts metadata header and description — real fixture data', async () => {
      mockUser()
      const fetchMock = vi.fn().mockImplementation((url: string) => {
        if (url === LINKEDIN_API) return Promise.resolve(htmlResponse(linkedinJobHtml))
        return Promise.resolve(htmlResponse('<html><body>fallback</body></html>'))
      })
      vi.stubGlobal('fetch', fetchMock)

      const res = await POST(makeReq({ url: LINKEDIN_URL }))

      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.html).toContain(
        '<h1>Principal Staff Software Engineer, Development Infrastructure</h1>'
      )
      expect(data.html).toContain('LinkedIn')
      expect(data.html).toContain('Bellevue, WA')
      expect(data.html).toContain('Full-time')
      expect(data.html).toContain('Director')
      expect(data.html).toContain('Engineering')
      expect(data.html).toContain('Technology, Information and Internet')
      expect(data.html).toContain('transform the way the world works')
      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(fetchMock).toHaveBeenCalledWith(LINKEDIN_API, expect.anything())
    })

    it('matches URLs with query strings (tracking params)', async () => {
      mockUser()
      const fetchMock = vi.fn().mockImplementation((url: string) => {
        if (url === LINKEDIN_API) return Promise.resolve(htmlResponse(linkedinJobHtml))
        return Promise.resolve(htmlResponse('<html><body>fallback</body></html>'))
      })
      vi.stubGlobal('fetch', fetchMock)

      const res = await POST(
        makeReq({ url: `${LINKEDIN_URL}?trackingId=abc&refId=xyz` })
      )

      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.html).toContain(
        '<h1>Principal Staff Software Engineer, Development Infrastructure</h1>'
      )
      expect(fetchMock).toHaveBeenCalledWith(LINKEDIN_API, expect.anything())
    })

    it('matches URLs with a SEO slug prefix in the path', async () => {
      mockUser()
      const fetchMock = vi.fn().mockImplementation((url: string) => {
        if (url === LINKEDIN_API) return Promise.resolve(htmlResponse(linkedinJobHtml))
        return Promise.resolve(htmlResponse('<html><body>fallback</body></html>'))
      })
      vi.stubGlobal('fetch', fetchMock)

      const res = await POST(
        makeReq({
          url: 'https://www.linkedin.com/jobs/view/principal-staff-software-engineer-development-infrastructure-at-linkedin-4415502323',
        })
      )

      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.html).toContain(
        '<h1>Principal Staff Software Engineer, Development Infrastructure</h1>'
      )
      expect(fetchMock).toHaveBeenCalledWith(LINKEDIN_API, expect.anything())
    })

    it('falls back to extractJobContent when LinkedIn API returns 404', async () => {
      mockUser()
      const fetchMock = vi.fn().mockImplementation((url: string) => {
        if (url === LINKEDIN_API) return Promise.resolve(htmlResponse('', { status: 404 }))
        return Promise.resolve(htmlResponse('<html><body><p>SENTINEL-FALLBACK-BODY</p></body></html>'))
      })
      vi.stubGlobal('fetch', fetchMock)

      const res = await POST(makeReq({ url: LINKEDIN_URL }))

      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.html).toBe('<p>SENTINEL-FALLBACK-BODY</p>')
    })

    it('falls back to extractJobContent when API response has no show-more-less-html__markup div', async () => {
      mockUser()
      const fetchMock = vi.fn().mockImplementation((url: string) => {
        if (url === LINKEDIN_API) return Promise.resolve(htmlResponse('<html><body><h2 class="topcard__title">Title</h2></body></html>'))
        return Promise.resolve(htmlResponse('<html><body><p>SENTINEL-FALLBACK-BODY</p></body></html>'))
      })
      vi.stubGlobal('fetch', fetchMock)

      const res = await POST(makeReq({ url: LINKEDIN_URL }))

      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.html).toBe('<p>SENTINEL-FALLBACK-BODY</p>')
    })

    it('falls back to HTML scraping when LinkedIn API throws', async () => {
      mockUser()
      const fetchMock = vi.fn().mockImplementation((url: string) => {
        if (url === LINKEDIN_API) return Promise.reject(new Error('network error'))
        return Promise.resolve(htmlResponse('<html><body><p>SENTINEL-FALLBACK-BODY</p></body></html>'))
      })
      vi.stubGlobal('fetch', fetchMock)

      const res = await POST(makeReq({ url: LINKEDIN_URL }))

      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.html).toBe('<p>SENTINEL-FALLBACK-BODY</p>')
    })

    it('does not trigger handler for non-job LinkedIn URLs', async () => {
      mockUser()
      const fetchMock = vi.fn().mockImplementation((url: string) => {
        if (url === LINKEDIN_API) return Promise.resolve(htmlResponse(linkedinJobHtml))
        return Promise.resolve(htmlResponse('<html><body><p>Feed</p></body></html>'))
      })
      vi.stubGlobal('fetch', fetchMock)

      const res = await POST(makeReq({ url: 'https://www.linkedin.com/feed/' }))

      expect(res.status).toBe(200)
      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(fetchMock).not.toHaveBeenCalledWith(LINKEDIN_API, expect.anything())
      expect(fetchMock).toHaveBeenCalledWith('https://www.linkedin.com/feed/', expect.anything())
    })
  })
})
