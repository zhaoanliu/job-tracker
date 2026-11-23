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
import googleCareersJob from '../fixtures/google-careers-job.json'
const googleCareersMetaFallbackHtml = readFileSync(
  join(__dirname, '../fixtures/google-careers-meta-fallback.html'),
  'utf-8'
)
import ashbyConfluentJob from '../fixtures/ashby-confluent-job.json'
import ashbyDockerJob from '../fixtures/ashby-docker-job.json'
import ashbyOpenAIJob from '../fixtures/ashby-openai-job.json'
import gemAugerJob from '../fixtures/gem-auger-job.json'
import amperityNextdataJob from '../fixtures/amperity-nextdata-job.json'
import greenhouseDatabricksJob from '../fixtures/greenhouse-databricks-job.json'
import greenhouseCoupangJob from '../fixtures/greenhouse-coupang-job.json'
import greenhousePinterestJob from '../fixtures/greenhouse-pinterest-job.json'
import greenhouseDigitalOceanJob from '../fixtures/greenhouse-digitalocean-job.json'
import joinByteDanceChunks from '../fixtures/joinbytedance-job.json'
const shopifyJobHtml = readFileSync(
  join(__dirname, '../fixtures/shopify-job.html'),
  'utf-8'
)

vi.mock('next/headers', () => ({
  cookies: vi.fn(() => ({ getAll: vi.fn(() => []) })),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

vi.mock('playwright-core', () => ({
  chromium: { launch: vi.fn() },
}))

vi.mock('@sparticuz/chromium', () => ({
  default: {
    executablePath: vi.fn().mockResolvedValue('/fake/chromium-binary'),
    args: ['--no-sandbox'],
  },
}))

import { POST } from '@/app/api/fetch-job-description/route'
import { extractJobContent } from '@/lib/extract-job-content'
import { createClient } from '@/lib/supabase/server'
import { chromium } from 'playwright-core'

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

  it('does not call console.error on upstream rate-limit (429)', async () => {
    mockUser()
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(htmlResponse('rate limited', { status: 429 })))

    const res = await POST(makeReq({ url: 'https://example.com/job' }))

    expect(res.status).toBe(502)
    expect(console.error).not.toHaveBeenCalled()
    expect(warnSpy).toHaveBeenCalled()
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

  describe('Coupang careers (coupang.jobs, Greenhouse-backed, board "coupang")', () => {
    const COUPANG_URL =
      'https://www.coupang.jobs/en/jobs/7822518/l6-2-staff-back-end-engineer-security-infrastructure/?gh_jid=7822518'
    const COUPANG_GH_API =
      'https://boards-api.greenhouse.io/v1/boards/coupang/jobs/7822518'

    it('uses Greenhouse API with board "coupang" and prepends metadata header — real API fixture', async () => {
      mockUser()
      const fetchMock = vi.fn().mockImplementation((url: string) => {
        if (url === COUPANG_GH_API) return Promise.resolve(jsonResponse(greenhouseCoupangJob))
        return Promise.resolve(htmlResponse('<html><body>fallback</body></html>'))
      })
      vi.stubGlobal('fetch', fetchMock)

      const res = await POST(makeReq({ url: COUPANG_URL }))

      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.html).toContain(
        '<h1>[L6-2] Staff Back-end Engineer (Security Infrastructure)</h1>'
      )
      expect(data.html).toContain('Coupang')
      expect(data.html).toContain('Mountain View, USA; Seattle, USA')
      expect(data.html).toContain('wow our customers')
      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(fetchMock).toHaveBeenCalledWith(COUPANG_GH_API, expect.anything())
    })

    it('handles bare coupang.jobs hostname (no www.)', async () => {
      mockUser()
      const fetchMock = vi.fn().mockImplementation((url: string) => {
        if (url === COUPANG_GH_API) return Promise.resolve(jsonResponse(greenhouseCoupangJob))
        return Promise.resolve(htmlResponse('<html><body>fallback</body></html>'))
      })
      vi.stubGlobal('fetch', fetchMock)

      const res = await POST(
        makeReq({ url: 'https://coupang.jobs/en/jobs/7822518/some-role/?gh_jid=7822518' })
      )

      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.html).toContain('[L6-2] Staff Back-end Engineer (Security Infrastructure)')
      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(fetchMock).toHaveBeenCalledWith(COUPANG_GH_API, expect.anything())
    })

    it('falls back to HTML scraping when Greenhouse API returns 404', async () => {
      mockUser()
      const fetchMock = vi.fn().mockImplementation((url: string) => {
        if (url === COUPANG_GH_API) return Promise.resolve(jsonResponse({}, 404))
        return Promise.resolve(htmlResponse('<html><body><p>Scraped JD</p></body></html>'))
      })
      vi.stubGlobal('fetch', fetchMock)

      const res = await POST(makeReq({ url: COUPANG_URL }))

      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.html).toBe('<p>Scraped JD</p>')
    })

    it('falls back to HTML scraping when Greenhouse API throws', async () => {
      mockUser()
      const fetchMock = vi.fn().mockImplementation((url: string) => {
        if (url === COUPANG_GH_API) return Promise.reject(new Error('network error'))
        return Promise.resolve(htmlResponse('<html><body><p>Scraped JD</p></body></html>'))
      })
      vi.stubGlobal('fetch', fetchMock)

      const res = await POST(makeReq({ url: COUPANG_URL }))

      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.html).toBe('<p>Scraped JD</p>')
    })

    it('does not trigger handler when gh_jid param is absent', async () => {
      mockUser()
      const fetchMock = vi.fn().mockResolvedValue(
        htmlResponse('<html><body><p>No JD</p></body></html>')
      )
      vi.stubGlobal('fetch', fetchMock)

      const res = await POST(
        makeReq({ url: 'https://www.coupang.jobs/en/jobs/7822518/some-role/' })
      )

      expect(res.status).toBe(200)
      expect(fetchMock).not.toHaveBeenCalledWith(COUPANG_GH_API, expect.anything())
    })
  })

  describe('Pinterest careers (pinterestcareers.com, Greenhouse-backed, board "pinterest")', () => {
    const PINTEREST_URL =
      'https://www.pinterestcareers.com/jobs/7923195/staff-software-engineer-growth-ai/?gh_jid=7923195'
    const PINTEREST_GH_API =
      'https://boards-api.greenhouse.io/v1/boards/pinterest/jobs/7923195'

    it('uses Greenhouse API with board "pinterest" and prepends metadata header — real API fixture', async () => {
      mockUser()
      const fetchMock = vi.fn().mockImplementation((url: string) => {
        if (url === PINTEREST_GH_API) return Promise.resolve(jsonResponse(greenhousePinterestJob))
        return Promise.resolve(htmlResponse('<html><body>fallback</body></html>'))
      })
      vi.stubGlobal('fetch', fetchMock)

      const res = await POST(makeReq({ url: PINTEREST_URL }))

      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.html).toContain('<h1>Staff Software Engineer, Growth AI</h1>')
      expect(data.html).toContain('Pinterest')
      expect(data.html).toContain('San Francisco')
      expect(data.html).toContain('About Pinterest')
      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(fetchMock).toHaveBeenCalledWith(PINTEREST_GH_API, expect.anything())
    })

    it('handles bare pinterestcareers.com hostname (no www.)', async () => {
      mockUser()
      const fetchMock = vi.fn().mockImplementation((url: string) => {
        if (url === PINTEREST_GH_API) return Promise.resolve(jsonResponse(greenhousePinterestJob))
        return Promise.resolve(htmlResponse('<html><body>fallback</body></html>'))
      })
      vi.stubGlobal('fetch', fetchMock)

      const res = await POST(
        makeReq({ url: 'https://pinterestcareers.com/jobs/7923195/some-role/?gh_jid=7923195' })
      )

      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.html).toContain('Staff Software Engineer, Growth AI')
      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(fetchMock).toHaveBeenCalledWith(PINTEREST_GH_API, expect.anything())
    })

    it('falls back to HTML scraping when Greenhouse API returns 404', async () => {
      mockUser()
      const fetchMock = vi.fn().mockImplementation((url: string) => {
        if (url === PINTEREST_GH_API) return Promise.resolve(jsonResponse({}, 404))
        return Promise.resolve(htmlResponse('<html><body><p>Scraped JD</p></body></html>'))
      })
      vi.stubGlobal('fetch', fetchMock)

      const res = await POST(makeReq({ url: PINTEREST_URL }))

      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.html).toBe('<p>Scraped JD</p>')
    })

    it('falls back to HTML scraping when Greenhouse API throws', async () => {
      mockUser()
      const fetchMock = vi.fn().mockImplementation((url: string) => {
        if (url === PINTEREST_GH_API) return Promise.reject(new Error('network error'))
        return Promise.resolve(htmlResponse('<html><body><p>Scraped JD</p></body></html>'))
      })
      vi.stubGlobal('fetch', fetchMock)

      const res = await POST(makeReq({ url: PINTEREST_URL }))

      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.html).toBe('<p>Scraped JD</p>')
    })

    it('does not trigger handler when gh_jid param is absent', async () => {
      mockUser()
      const fetchMock = vi.fn().mockResolvedValue(
        htmlResponse('<html><body><p>No JD</p></body></html>')
      )
      vi.stubGlobal('fetch', fetchMock)

      const res = await POST(
        makeReq({ url: 'https://www.pinterestcareers.com/jobs/7923195/some-role/' })
      )

      expect(res.status).toBe(200)
      expect(fetchMock).not.toHaveBeenCalledWith(PINTEREST_GH_API, expect.anything())
    })
  })

  describe('DigitalOcean careers (www.digitalocean.com, Greenhouse-backed, board "digitalocean98")', () => {
    const DIGITALOCEAN_URL =
      'https://www.digitalocean.com/careers/position/apply?gh_jid=7975125&gh_src=312a08e31us'
    const DIGITALOCEAN_GH_API =
      'https://boards-api.greenhouse.io/v1/boards/digitalocean98/jobs/7975125'

    it('uses Greenhouse API with board "digitalocean98" and prepends metadata header — real API fixture [AC-714-1]', async () => {
      mockUser()
      const fetchMock = vi.fn().mockImplementation((url: string) => {
        if (url === DIGITALOCEAN_GH_API) return Promise.resolve(jsonResponse(greenhouseDigitalOceanJob))
        return Promise.resolve(htmlResponse('<html><body>fallback</body></html>'))
      })
      vi.stubGlobal('fetch', fetchMock)

      const res = await POST(makeReq({ url: DIGITALOCEAN_URL }))

      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.html).toContain('<h1>Principal Software Engineer</h1>')
      expect(data.html).toContain('DigitalOcean')
      expect(data.html).toContain('Seattle')
      expect(data.html).toContain('Dive in and do the best work of your career')
      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(fetchMock).toHaveBeenCalledWith(DIGITALOCEAN_GH_API, expect.anything())
    })

    it('falls back to HTML scraping when Greenhouse API returns non-2xx [AC-714-2]', async () => {
      mockUser()
      const fetchMock = vi.fn().mockImplementation((url: string) => {
        if (url === DIGITALOCEAN_GH_API) return Promise.resolve(jsonResponse({}, 404))
        return Promise.resolve(htmlResponse('<html><body><p>Scraped JD</p></body></html>'))
      })
      vi.stubGlobal('fetch', fetchMock)

      const res = await POST(makeReq({ url: DIGITALOCEAN_URL }))

      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.html).toBe('<p>Scraped JD</p>')
      expect(fetchMock).toHaveBeenCalledTimes(2)
    })

    it('falls back to HTML scraping when Greenhouse API throws a network error [AC-714-3]', async () => {
      mockUser()
      const fetchMock = vi.fn().mockImplementation((url: string) => {
        if (url === DIGITALOCEAN_GH_API) return Promise.reject(new Error('network error'))
        return Promise.resolve(htmlResponse('<html><body><p>Scraped JD</p></body></html>'))
      })
      vi.stubGlobal('fetch', fetchMock)

      const res = await POST(makeReq({ url: DIGITALOCEAN_URL }))

      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.html).toBe('<p>Scraped JD</p>')
    })

    it('does not trigger Greenhouse API call when gh_jid param is absent [AC-714-4]', async () => {
      mockUser()
      const fetchMock = vi.fn().mockResolvedValue(
        htmlResponse('<html><body><p>No JD</p></body></html>')
      )
      vi.stubGlobal('fetch', fetchMock)

      const res = await POST(
        makeReq({ url: 'https://www.digitalocean.com/careers/position/apply' })
      )

      expect(res.status).toBe(200)
      expect(fetchMock).not.toHaveBeenCalledWith(
        expect.stringContaining('digitalocean98'),
        expect.anything()
      )
    })
  })

  describe('Databricks careers (Greenhouse-backed, board "databricks")', () => {
    const DATABRICKS_URL =
      'https://www.databricks.com/company/careers/exec-engineering/sr-staff-software-engineer---unity-catalog-data-governance-7993609002'
    const DATABRICKS_GH_API =
      'https://boards-api.greenhouse.io/v1/boards/databricks/jobs/7993609002'

    it('uses Greenhouse API with board "databricks" and prepends metadata header — real API fixture', async () => {
      mockUser()
      const fetchMock = vi.fn().mockImplementation((url: string) => {
        if (url === DATABRICKS_GH_API) return Promise.resolve(jsonResponse(greenhouseDatabricksJob))
        return Promise.resolve(htmlResponse('<html><body>fallback</body></html>'))
      })
      vi.stubGlobal('fetch', fetchMock)

      const res = await POST(makeReq({ url: DATABRICKS_URL }))

      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.html).toContain(
        '<h1>Sr. Staff Software Engineer - Unity Catalog Data Governance</h1>'
      )
      expect(data.html).toContain('Databricks')
      expect(data.html).toContain('Bellevue, Washington')
      expect(data.html).toContain('enabling data teams to solve the world')
      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(fetchMock).toHaveBeenCalledWith(DATABRICKS_GH_API, expect.anything())
    })

    it('ignores gh_src query param — still routes to Greenhouse API', async () => {
      mockUser()
      const fetchMock = vi.fn().mockImplementation((url: string) => {
        if (url === DATABRICKS_GH_API) return Promise.resolve(jsonResponse(greenhouseDatabricksJob))
        return Promise.resolve(htmlResponse('<html><body>fallback</body></html>'))
      })
      vi.stubGlobal('fetch', fetchMock)

      const res = await POST(
        makeReq({ url: `${DATABRICKS_URL}?gh_src=62a881d62` })
      )

      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.html).toContain(
        '<h1>Sr. Staff Software Engineer - Unity Catalog Data Governance</h1>'
      )
      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(fetchMock).toHaveBeenCalledWith(DATABRICKS_GH_API, expect.anything())
    })

    it('falls back to HTML scraping when Greenhouse API returns 404', async () => {
      mockUser()
      const fetchMock = vi.fn().mockImplementation((url: string) => {
        if (url === DATABRICKS_GH_API) return Promise.resolve(jsonResponse({}, 404))
        return Promise.resolve(htmlResponse('<html><body><p>Scraped JD</p></body></html>'))
      })
      vi.stubGlobal('fetch', fetchMock)

      const res = await POST(makeReq({ url: DATABRICKS_URL }))

      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.html).toBe('<p>Scraped JD</p>')
    })

    it('falls back to HTML scraping when Greenhouse API throws', async () => {
      mockUser()
      const fetchMock = vi.fn().mockImplementation((url: string) => {
        if (url === DATABRICKS_GH_API) return Promise.reject(new Error('network error'))
        return Promise.resolve(htmlResponse('<html><body><p>Scraped JD</p></body></html>'))
      })
      vi.stubGlobal('fetch', fetchMock)

      const res = await POST(makeReq({ url: DATABRICKS_URL }))

      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.html).toBe('<p>Scraped JD</p>')
    })

    it('does not trigger for non-careers Databricks URL', async () => {
      mockUser()
      const fetchMock = vi.fn().mockResolvedValue(
        htmlResponse('<html><body><p>Databricks home</p></body></html>')
      )
      vi.stubGlobal('fetch', fetchMock)

      const res = await POST(makeReq({ url: 'https://www.databricks.com/blog' }))

      expect(res.status).toBe(200)
      expect(fetchMock).not.toHaveBeenCalledWith(DATABRICKS_GH_API, expect.anything())
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

  describe('Google Careers (www.google.com/about/careers and careers.google.com)', () => {
    // Real URL from the job page used to capture the fixture
    const GOOGLE_URL =
      'https://www.google.com/about/careers/applications/jobs/results/92918703267422918-staff-software-engineer-ai-agent-google-cloud-iam-infrastructure'
    const CAREERS_GOOGLE_URL =
      'https://careers.google.com/jobs/results/92918703267422918-staff-software-engineer-ai-agent-google-cloud-iam-infrastructure'

    // googleCareersJob is a snapshot of the AF_initDataCallback ds:0 data array from the real
    // Google Careers page (observed 2026-05-31). Google embeds the full job data in this callback;
    // no JSON-LD and no public API exist for server-side access.
    function googleCareersPage(dataArray: unknown[][]): string {
      return `<html><head></head><body><script>AF_initDataCallback({key: 'ds:0', hash: '1', data:${JSON.stringify(dataArray)}, sideChannel: {}});</script></body></html>`
    }

    it('extracts metadata header and job content from AF_initDataCallback — real fixture data', async () => {
      mockUser()
      const fetchMock = vi.fn().mockResolvedValue(htmlResponse(googleCareersPage(googleCareersJob)))
      vi.stubGlobal('fetch', fetchMock)

      const res = await POST(makeReq({ url: GOOGLE_URL }))

      expect(res.status).toBe(200)
      const data = await res.json()
      // Title from fixture
      expect(data.html).toContain('<h1>Staff Software Engineer, AI Agent, Google Cloud IAM Infrastructure</h1>')
      // Company from fixture
      expect(data.html).toContain('Google')
      // Job ID from fixture
      expect(data.html).toContain('92918703267422918')
      // Location from fixture
      expect(data.html).toContain('Kirkland, WA, USA')
      // Responsibilities section heading added by handler
      expect(data.html).toContain('<h3>Responsibilities</h3>')
      // Responsibilities content from fixture
      expect(data.html).toContain('agentic authorization')
      // Qualifications heading from fixture
      expect(data.html).toContain('Minimum qualifications')
      // Only one fetch — page HTML, no separate API call.
      // www.google.com URL is transparently redirected to careers.google.com for the fetch
      // (www.google.com no longer embeds job data server-side as of ~June 2026).
      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(fetchMock).toHaveBeenCalledWith(CAREERS_GOOGLE_URL, expect.anything())
    })

    it('handles careers.google.com URL variant', async () => {
      mockUser()
      const fetchMock = vi.fn().mockResolvedValue(htmlResponse(googleCareersPage(googleCareersJob)))
      vi.stubGlobal('fetch', fetchMock)

      const res = await POST(makeReq({ url: CAREERS_GOOGLE_URL }))

      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.html).toContain('<h1>Staff Software Engineer, AI Agent, Google Cloud IAM Infrastructure</h1>')
    })

    it('falls back to extractJobContent when page has no AF_initDataCallback', async () => {
      mockUser()
      const fetchMock = vi.fn().mockResolvedValue(
        htmlResponse('<html><body><p>Scraped fallback</p></body></html>')
      )
      vi.stubGlobal('fetch', fetchMock)

      const res = await POST(makeReq({ url: GOOGLE_URL }))

      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.html).toBe('<p>Scraped fallback</p>')
    })

    it('falls back to extractJobContent when AF_initDataCallback data is invalid JSON', async () => {
      mockUser()
      const fetchMock = vi.fn().mockResolvedValue(
        htmlResponse(
          `<html><body><script>AF_initDataCallback({key: 'ds:0', hash: '1', data:not_json, sideChannel: {}});</script><p>Body</p></body></html>`
        )
      )
      vi.stubGlobal('fetch', fetchMock)

      const res = await POST(makeReq({ url: GOOGLE_URL }))

      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.html).toBe('<p>Body</p>')
    })

    it('falls back to extractJobContent when job entry has no content fields', async () => {
      // Synthetic: real fixture always has about/responsibilities/qualifications; this tests the empty-body branch
      mockUser()
      const emptyJob = [['job-id', 'Title', 'https://...', null, null, null, null, 'Google', 'en-US', [], null]]
      const html = `<html><head></head><body><script>AF_initDataCallback({key: 'ds:0', hash: '1', data:${JSON.stringify(emptyJob)}, sideChannel: {}});</script><p>Fallback text</p></body></html>`
      const fetchMock = vi.fn().mockResolvedValue(htmlResponse(html))
      vi.stubGlobal('fetch', fetchMock)

      const res = await POST(makeReq({ url: GOOGLE_URL }))

      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.html).toBe('<p>Fallback text</p>')
    })

    it('returns 502 when the page fetch fails', async () => {
      mockUser()
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(htmlResponse('', { status: 403 })))

      const res = await POST(makeReq({ url: GOOGLE_URL }))

      expect(res.status).toBe(502)
    })

    it('does not apply Google Careers handler for non-Google Careers URLs', async () => {
      mockUser()
      const fetchMock = vi.fn().mockResolvedValue(htmlResponse('<html><body><p>Regular</p></body></html>'))
      vi.stubGlobal('fetch', fetchMock)

      const res = await POST(makeReq({ url: 'https://www.google.com/search?q=jobs' }))

      expect(res.status).toBe(200)
      const data = await res.json()
      // No Google Careers metadata header prepended
      expect(data.html).not.toContain('AF_initDataCallback')
      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(fetchMock).toHaveBeenCalledWith('https://www.google.com/search?q=jobs', expect.anything())
    })

    const META_FALLBACK_URL =
      'https://www.google.com/about/careers/applications/jobs/results/83118315894907590-staff-software-engineer-google-compute-engine'

    it('meta fallback: builds structured result from <title> and meta description when AF_initDataCallback is absent', async () => {
      mockUser()
      const fetchMock = vi.fn().mockResolvedValue(htmlResponse(googleCareersMetaFallbackHtml))
      vi.stubGlobal('fetch', fetchMock)

      const res = await POST(makeReq({ url: META_FALLBACK_URL }))

      expect(res.status).toBe(200)
      const data = await res.json()
      // Title stripped of " — Google Careers" suffix
      expect(data.html).toContain('<h1>Staff Software Engineer, Google Compute Engine</h1>')
      // Company row hardcoded to Google
      expect(data.html).toContain('<th>Company</th><td>Google</td>')
      // Job ID from URL path
      expect(data.html).toContain('<th>Job ID</th><td>83118315894907590</td>')
      // Description wrapped in <p>
      expect(data.html).toContain('<p>The description text.</p>')
      // Single fetch — no extra API calls
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    it('meta fallback: uses og:title when <title> tag is absent', async () => {
      mockUser()
      const noTitleHtml = `<html><head>
        <meta property="og:title" content="Senior Engineer, Cloud — Google Careers">
        <meta name="description" content="Join our team.">
      </head><body></body></html>`
      const fetchMock = vi.fn().mockResolvedValue(htmlResponse(noTitleHtml))
      vi.stubGlobal('fetch', fetchMock)

      const res = await POST(makeReq({ url: META_FALLBACK_URL }))

      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.html).toContain('<h1>Senior Engineer, Cloud</h1>')
    })

    it('meta fallback: suffix stripping is case-insensitive', async () => {
      mockUser()
      const html = `<html><head>
        <title>Software Engineer — GOOGLE CAREERS</title>
        <meta name="description" content="Do cool things.">
      </head><body></body></html>`
      const fetchMock = vi.fn().mockResolvedValue(htmlResponse(html))
      vi.stubGlobal('fetch', fetchMock)

      const res = await POST(makeReq({ url: META_FALLBACK_URL }))

      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.html).toContain('<h1>Software Engineer</h1>')
      expect(data.html).not.toContain('GOOGLE CAREERS')
    })

    it('meta fallback: falls through to extractJobContent when meta description is absent', async () => {
      mockUser()
      const noDescHtml = `<html><head>
        <title>Engineer — Google Careers</title>
      </head><body><p>Scraped body</p></body></html>`
      const fetchMock = vi.fn().mockResolvedValue(htmlResponse(noDescHtml))
      vi.stubGlobal('fetch', fetchMock)

      const res = await POST(makeReq({ url: META_FALLBACK_URL }))

      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.html).toBe('<p>Scraped body</p>')
    })
  })

  describe('Ashby ATS', () => {
    // ashbyConfluentJob is the schema.org/JobPosting JSON-LD block embedded in the real
    // jobs.ashbyhq.com/confluent/85107937-8f12-4336-abb8-e88f344c6bcc page (2026-06-01).
    // Custom domain careers.confluent.io blocks server-side fetches (Vercel bot protection / 429);
    // the handler redirects to jobs.ashbyhq.com which serves the same page without gating.
    const CUSTOM_URL = 'https://careers.confluent.io/jobs/job/85107937-8f12-4336-abb8-e88f344c6bcc'
    const DIRECT_URL = 'https://jobs.ashbyhq.com/confluent/85107937-8f12-4336-abb8-e88f344c6bcc'
    const CANONICAL_FETCH_URL = 'https://jobs.ashbyhq.com/confluent/85107937-8f12-4336-abb8-e88f344c6bcc'

    function ashbyPage(ld: object): string {
      return `<html><head><script type="application/ld+json">${JSON.stringify(ld)}</script></head><body></body></html>`
    }

    it('fetches from jobs.ashbyhq.com for custom career domain — real fixture data', async () => {
      mockUser()
      const fetchMock = vi.fn().mockImplementation((url: string) => {
        if (url === CANONICAL_FETCH_URL) return Promise.resolve(htmlResponse(ashbyPage(ashbyConfluentJob)))
        return Promise.resolve(htmlResponse('<html><body><p>SENTINEL-FALLBACK</p></body></html>'))
      })
      vi.stubGlobal('fetch', fetchMock)

      const res = await POST(makeReq({ url: CUSTOM_URL }))

      expect(res.status).toBe(200)
      const data = await res.json()
      // Title from fixture
      expect(data.html).toContain('<h1>Principal Engineer, Engineering AI Productivity</h1>')
      // Company from hiringOrganization.name
      expect(data.html).toContain('Confluent')
      // Date posted from fixture
      expect(data.html).toContain('2026-05-13')
      // Location from jobLocation.address.addressCountry
      expect(data.html).toContain('United States')
      // Description content from fixture
      expect(data.html).toContain('We’re not just building better tech')
      // Fetches from canonical Ashby URL only — custom domain is never fetched
      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(fetchMock).toHaveBeenCalledWith(CANONICAL_FETCH_URL, expect.anything())
      expect(fetchMock).not.toHaveBeenCalledWith(CUSTOM_URL, expect.anything())
    })

    it('extracts metadata header and description for direct jobs.ashbyhq.com URL — real fixture data', async () => {
      mockUser()
      const fetchMock = vi.fn().mockImplementation((url: string) => {
        if (url === CANONICAL_FETCH_URL) return Promise.resolve(htmlResponse(ashbyPage(ashbyConfluentJob)))
        return Promise.resolve(htmlResponse('<html><body><p>SENTINEL-FALLBACK</p></body></html>'))
      })
      vi.stubGlobal('fetch', fetchMock)

      const res = await POST(makeReq({ url: DIRECT_URL }))

      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.html).toContain('<h1>Principal Engineer, Engineering AI Productivity</h1>')
      expect(data.html).toContain('Confluent')
      expect(data.html).toContain('We’re not just building better tech')
      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(fetchMock).toHaveBeenCalledWith(CANONICAL_FETCH_URL, expect.anything())
    })

    it('falls back to HTML scraping when jobs.ashbyhq.com returns non-2xx (custom domain)', async () => {
      mockUser()
      const fetchMock = vi.fn().mockImplementation((url: string) => {
        if (url === CANONICAL_FETCH_URL) return Promise.resolve(htmlResponse('', { status: 404 }))
        return Promise.resolve(htmlResponse('<html><body><p>SENTINEL-FALLBACK</p></body></html>'))
      })
      vi.stubGlobal('fetch', fetchMock)

      const res = await POST(makeReq({ url: CUSTOM_URL }))

      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.html).toBe('<p>SENTINEL-FALLBACK</p>')
    })

    it('falls back to HTML scraping when jobs.ashbyhq.com has no JobPosting JSON-LD', async () => {
      mockUser()
      const fetchMock = vi.fn().mockImplementation((url: string) => {
        if (url === CANONICAL_FETCH_URL) return Promise.resolve(htmlResponse('<html><body><p>No JSON-LD</p></body></html>'))
        return Promise.resolve(htmlResponse('<html><body><p>SENTINEL-FALLBACK</p></body></html>'))
      })
      vi.stubGlobal('fetch', fetchMock)

      const res = await POST(makeReq({ url: CUSTOM_URL }))

      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.html).toBe('<p>SENTINEL-FALLBACK</p>')
    })

    it('falls back to HTML scraping when jobs.ashbyhq.com throws', async () => {
      mockUser()
      const fetchMock = vi.fn().mockImplementation((url: string) => {
        if (url === CANONICAL_FETCH_URL) return Promise.reject(new Error('network error'))
        return Promise.resolve(htmlResponse('<html><body><p>SENTINEL-FALLBACK</p></body></html>'))
      })
      vi.stubGlobal('fetch', fetchMock)

      const res = await POST(makeReq({ url: CUSTOM_URL }))

      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.html).toBe('<p>SENTINEL-FALLBACK</p>')
    })

    it('does not trigger Ashby handler for custom domain with only 2-part hostname', async () => {
      // Synthetic: Ashby handler requires 3+ hostname parts to derive company slug;
      // a bare 2-part hostname like "confluent.io/jobs/job/{uuid}" is not a recognised Ashby pattern
      mockUser()
      const fetchMock = vi.fn().mockResolvedValue(htmlResponse('<html><body><p>Regular</p></body></html>'))
      vi.stubGlobal('fetch', fetchMock)

      const res = await POST(makeReq({ url: 'https://confluent.io/jobs/job/85107937-8f12-4336-abb8-e88f344c6bcc' }))

      expect(res.status).toBe(200)
      // No Ashby fetch — only the direct page fetch
      expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining('jobs.ashbyhq.com'), expect.anything())
    })

    it('does not trigger Ashby handler for non-UUID path segments', async () => {
      mockUser()
      const fetchMock = vi.fn().mockResolvedValue(htmlResponse('<html><body><p>Regular</p></body></html>'))
      vi.stubGlobal('fetch', fetchMock)

      const res = await POST(makeReq({ url: 'https://careers.confluent.io/jobs/job/12345' }))

      expect(res.status).toBe(200)
      expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining('jobs.ashbyhq.com'), expect.anything())
    })
  })

  describe('Ashby embed board (?ashby_jid= + embed script)', () => {
    // ashbyDockerJob is the schema.org/JobPosting JSON-LD block from the real
    // jobs.ashbyhq.com/docker/9bbe3ad7-f4be-4efa-8889-b93e9d62c1ed page (2026-06-11).
    // docker.com/career-openings/?ashby_jid={uuid} embeds the job board via JS;
    // the board slug comes from jobs.ashbyhq.com/docker/embed in the page HTML.
    const DOCKER_URL =
      'https://www.docker.com/career-openings/?ashby_jid=9bbe3ad7-f4be-4efa-8889-b93e9d62c1ed'
    const CANONICAL_URL =
      'https://jobs.ashbyhq.com/docker/9bbe3ad7-f4be-4efa-8889-b93e9d62c1ed'
    const embedPageHtml =
      '<html><body><script src="https://jobs.ashbyhq.com/docker/embed"></script></body></html>'

    function ashbyPage(ld: object): string {
      return `<html><head><script type="application/ld+json">${JSON.stringify(ld)}</script></head><body></body></html>`
    }

    it('detects embed board via ?ashby_jid= param + embed script and fetches canonical URL — real fixture', async () => {
      mockUser()
      const fetchMock = vi.fn().mockImplementation((url: string) => {
        if (url === CANONICAL_URL) return Promise.resolve(htmlResponse(ashbyPage(ashbyDockerJob)))
        return Promise.resolve(htmlResponse(embedPageHtml))
      })
      vi.stubGlobal('fetch', fetchMock)

      const res = await POST(makeReq({ url: DOCKER_URL }))

      expect(res.status).toBe(200)
      const data = await res.json()
      // Title from fixture
      expect(data.html).toContain('<h1>Staff Software Engineer, Infrastructure</h1>')
      // Company from hiringOrganization.name
      expect(data.html).toContain('Docker')
      // Date posted from fixture
      expect(data.html).toContain('2026-06-08')
      // Location from jobLocation.address.addressCountry (fallback since no city/region)
      expect(data.html).toContain('Canada')
      // Description content from fixture
      expect(data.html).toContain('Docker has been one of the most loved brands')
      // Docker career page was fetched first, then canonical Ashby URL
      expect(fetchMock).toHaveBeenCalledWith(DOCKER_URL, expect.anything())
      expect(fetchMock).toHaveBeenCalledWith(CANONICAL_URL, expect.anything())
    })

    it('falls back to HTML scraping when canonical Ashby URL returns non-2xx', async () => {
      mockUser()
      const fetchMock = vi.fn().mockImplementation((url: string) => {
        if (url === CANONICAL_URL) return Promise.resolve(htmlResponse('', { status: 404 }))
        return Promise.resolve(htmlResponse('<html><body>' + embedPageHtml + '<p>SENTINEL-FALLBACK</p></body></html>'))
      })
      vi.stubGlobal('fetch', fetchMock)

      const res = await POST(makeReq({ url: DOCKER_URL }))

      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.html).toContain('SENTINEL-FALLBACK')
    })

    it('falls back to HTML scraping when no embed script in page HTML', async () => {
      mockUser()
      const fetchMock = vi.fn().mockImplementation((url: string) => {
        if (url === CANONICAL_URL) return Promise.resolve(htmlResponse(ashbyPage(ashbyDockerJob)))
        // Page has ?ashby_jid= but no embed script
        return Promise.resolve(htmlResponse('<html><body><p>No embed script</p></body></html>'))
      })
      vi.stubGlobal('fetch', fetchMock)

      const res = await POST(makeReq({ url: DOCKER_URL }))

      expect(res.status).toBe(200)
      // Canonical Ashby URL should NOT have been called
      expect(fetchMock).not.toHaveBeenCalledWith(CANONICAL_URL, expect.anything())
    })

    it('does not trigger for URL without ?ashby_jid= param', async () => {
      mockUser()
      const fetchMock = vi.fn().mockResolvedValue(htmlResponse(embedPageHtml))
      vi.stubGlobal('fetch', fetchMock)

      const res = await POST(makeReq({ url: 'https://www.docker.com/career-openings/' }))

      expect(res.status).toBe(200)
      expect(fetchMock).not.toHaveBeenCalledWith(CANONICAL_URL, expect.anything())
    })
  })

  describe('Gem.com ATS', () => {
    // gemAugerJob is a snapshot of the real jobs.gem.com GraphQL response envelope
    // ({"data":{"oatsExternalJobPosting":{...}}}) for boardId=auger and the base64url extId
    // captured 2026-06-01.
    const GEM_URL = 'https://jobs.gem.com/auger/am9icG9zdDqF9OtLq0iQ9-wa_O4b2WV2'
    const GEM_API = 'https://jobs.gem.com/api/public/graphql'

    it('uses Gem GraphQL API and prepends metadata header — real API fixture', async () => {
      mockUser()
      const fetchMock = vi.fn().mockImplementation((url: string) => {
        if (url === GEM_API) return Promise.resolve(jsonResponse(gemAugerJob))
        return Promise.resolve(htmlResponse('<html><body>fallback</body></html>'))
      })
      vi.stubGlobal('fetch', fetchMock)

      const res = await POST(makeReq({ url: GEM_URL }))

      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.html).toContain('<h1>Principal Software Development Engineer</h1>')
      expect(data.html).toContain('Bellevue')
      expect(data.html).toContain('AI Enablement Engineering')
      expect(data.html).toContain('Full-time')
      expect(data.html).toContain('In office')
      expect(data.html).toContain('autonomous operating system for the supply chain')
      expect(data.html).toContain('$280,000')
      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(fetchMock).toHaveBeenCalledWith(GEM_API, expect.anything())
    })

    it('falls back to extractJobContent when GraphQL endpoint returns non-2xx', async () => {
      mockUser()
      const fetchMock = vi.fn().mockImplementation((url: string) => {
        if (url === GEM_API) return Promise.resolve(jsonResponse({}, 500))
        return Promise.resolve(htmlResponse('<html><body><p>Scraped JD</p></body></html>'))
      })
      vi.stubGlobal('fetch', fetchMock)

      const res = await POST(makeReq({ url: GEM_URL }))

      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.html).toBe('<p>Scraped JD</p>')
    })

    it('falls back to extractJobContent when GraphQL returns errors[] payload (HTTP 200)', async () => {
      mockUser()
      const fetchMock = vi.fn().mockImplementation((url: string) => {
        if (url === GEM_API)
          return Promise.resolve(jsonResponse({ errors: [{ message: 'Posting not found' }] }))
        return Promise.resolve(htmlResponse('<html><body><p>Scraped JD</p></body></html>'))
      })
      vi.stubGlobal('fetch', fetchMock)

      const res = await POST(makeReq({ url: GEM_URL }))

      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.html).toBe('<p>Scraped JD</p>')
    })

    it('falls back to extractJobContent when GraphQL returns null oatsExternalJobPosting', async () => {
      mockUser()
      const fetchMock = vi.fn().mockImplementation((url: string) => {
        if (url === GEM_API)
          return Promise.resolve(jsonResponse({ data: { oatsExternalJobPosting: null } }))
        return Promise.resolve(htmlResponse('<html><body><p>Scraped JD</p></body></html>'))
      })
      vi.stubGlobal('fetch', fetchMock)

      const res = await POST(makeReq({ url: GEM_URL }))

      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.html).toBe('<p>Scraped JD</p>')
    })

    it('falls back to extractJobContent when descriptionHtml is empty', async () => {
      mockUser()
      const empty = {
        data: {
          oatsExternalJobPosting: {
            ...gemAugerJob.data.oatsExternalJobPosting,
            descriptionHtml: '',
          },
        },
      }
      const fetchMock = vi.fn().mockImplementation((url: string) => {
        if (url === GEM_API) return Promise.resolve(jsonResponse(empty))
        return Promise.resolve(htmlResponse('<html><body><p>Scraped JD</p></body></html>'))
      })
      vi.stubGlobal('fetch', fetchMock)

      const res = await POST(makeReq({ url: GEM_URL }))

      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.html).toBe('<p>Scraped JD</p>')
    })

    it('does not trigger Gem handler for non-matching path (single path segment)', async () => {
      mockUser()
      const NON_MATCH_URL = 'https://jobs.gem.com/auger'
      const fetchMock = vi.fn().mockResolvedValue(
        htmlResponse('<html><body><p>Regular</p></body></html>')
      )
      vi.stubGlobal('fetch', fetchMock)

      const res = await POST(makeReq({ url: NON_MATCH_URL }))

      expect(res.status).toBe(200)
      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(fetchMock).toHaveBeenCalledWith(NON_MATCH_URL, expect.anything())
      expect(fetchMock).not.toHaveBeenCalledWith(GEM_API, expect.anything())
    })

    it('renders multi-location posting joined by " | " with "(Remote)" appended', async () => {
      // Synthetic: the real fixture has a single in-office location; multi-location postings
      // with isRemote set on one entry are possible in practice on Gem boards.
      mockUser()
      const multi = {
        data: {
          oatsExternalJobPosting: {
            title: 'Distributed Engineer',
            descriptionHtml: '<p>Body</p>',
            compensationHtml: '',
            locations: [
              { name: 'Bellevue', city: 'Bellevue', isoCountry: 'USA', isRemote: false },
              { name: 'United States', city: '', isoCountry: 'USA', isRemote: true },
            ],
            job: {
              locationType: 'HYBRID',
              employmentType: 'FULL_TIME',
              teamDisplayName: 'Platform',
              department: { name: 'Engineering' },
            },
          },
        },
      }
      const fetchMock = vi.fn().mockImplementation((url: string) => {
        if (url === GEM_API) return Promise.resolve(jsonResponse(multi))
        return Promise.resolve(htmlResponse('<html><body>fallback</body></html>'))
      })
      vi.stubGlobal('fetch', fetchMock)

      const res = await POST(makeReq({ url: GEM_URL }))

      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.html).toContain('Bellevue | United States (Remote)')
    })
  })

  describe('Greenhouse __NEXT_DATA__ embed', () => {
    const AMPERITY_URL = 'https://amperity.com/careers/7931915?gh_jid=7931915'

    function nextDataPage(nextData: object): string {
      return `<html><head><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(nextData)}</script></head><body></body></html>`
    }

    it('happy path — returns title, company, location, and body text from __NEXT_DATA__', async () => {
      mockUser()
      const fetchMock = vi.fn().mockResolvedValue(htmlResponse(nextDataPage(amperityNextdataJob)))
      vi.stubGlobal('fetch', fetchMock)

      const res = await POST(makeReq({ url: AMPERITY_URL }))

      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.html).toContain('Lead Software Development Engineer - Infrastructure')
      expect(data.html).toContain('Amperity')
      expect(data.html).toContain('Seattle, WA')
      expect(data.html).toContain('AI-first company')
      expect(fetchMock).not.toHaveBeenCalledWith(
        expect.stringContaining('boards-api.greenhouse.io'),
        expect.anything()
      )
    })

    it('missing content — falls through to extractJobContent when job.content is absent', async () => {
      mockUser()
      const noContentFixture = {
        props: {
          pageProps: {
            job: { title: 'Some Job', company_name: 'Acme', location: { name: 'Remote' } },
          },
        },
      }
      const pageHtml = `<html><head><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(noContentFixture)}</script></head><body><p>Scraped content</p></body></html>`
      const fetchMock = vi.fn().mockResolvedValue(htmlResponse(pageHtml))
      vi.stubGlobal('fetch', fetchMock)

      const res = await POST(makeReq({ url: AMPERITY_URL }))

      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.html).toContain('Scraped content')
      expect(data.html).not.toContain('<h1>Some Job</h1>')
    })

    it('malformed JSON — does not throw, falls through to extractJobContent', async () => {
      mockUser()
      const malformedHtml = `<html><head><script id="__NEXT_DATA__" type="application/json">{not valid json}</script></head><body><p>Fallback body</p></body></html>`
      const fetchMock = vi.fn().mockResolvedValue(htmlResponse(malformedHtml))
      vi.stubGlobal('fetch', fetchMock)

      const res = await POST(makeReq({ url: AMPERITY_URL }))

      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.html).toContain('Fallback body')
    })

    it('URL without ?gh_jid= — fetch to greenhouse.io is never called', async () => {
      mockUser()
      const fetchMock = vi.fn().mockResolvedValue(htmlResponse(nextDataPage(amperityNextdataJob)))
      vi.stubGlobal('fetch', fetchMock)

      const res = await POST(makeReq({ url: 'https://amperity.com/careers/7931915' }))

      expect(res.status).toBe(200)
      expect(fetchMock).not.toHaveBeenCalledWith(
        expect.stringContaining('greenhouse.io'),
        expect.anything()
      )
    })

    it('URL with embed script tag (SoFi-style) — uses embed-board API, not __NEXT_DATA__ path', async () => {
      mockUser()
      const SOFI_URL = 'https://www.sofi.com/careers/job/?gh_jid=7679621003'
      const SOFI_GH_API = 'https://boards-api.greenhouse.io/v1/boards/sofi/jobs/7679621003'
      const pageHtml = `<html><head>
        <script id="__NEXT_DATA__" type="application/json">${JSON.stringify(amperityNextdataJob)}</script>
      </head><body>
        <script src="https://boards.greenhouse.io/embed/job_board/js?for=sofi"></script>
      </body></html>`

      const fetchMock = vi.fn().mockImplementation((url: string) => {
        if (url === SOFI_GH_API) return Promise.resolve(jsonResponse(greenhouseSoFi))
        return Promise.resolve(htmlResponse(pageHtml))
      })
      vi.stubGlobal('fetch', fetchMock)

      const res = await POST(makeReq({ url: SOFI_URL }))

      expect(res.status).toBe(200)
      const data = await res.json()
      expect(fetchMock).toHaveBeenCalledWith(SOFI_GH_API, expect.anything())
      expect(data.html).toContain('Principal Engineer, Digital Identity')
      expect(data.html).not.toContain('Lead Software Development Engineer - Infrastructure')
    })
  })

  describe('lifeattiktok.com / joinbytedance.com', () => {
    const LIFEATTIKTOK_URL = 'https://lifeattiktok.com/search/7602378131098831157'
    const JOINBYTEDANCE_URL = 'https://joinbytedance.com/search/7256932480371837240'
    const lifeAtTikTokHtml = readFileSync(
      join(__dirname, '../fixtures/lifeattiktok-job.html'),
      'utf-8'
    )
    const joinByteDanceHtml = readFileSync(
      join(__dirname, '../fixtures/joinbytedance-job.html'),
      'utf-8'
    )

    it('returns title, Location, Employment Type, Job Code, and description for lifeattiktok.com URL [AC-627-1]', async () => {
      mockUser()
      const fetchMock = vi.fn().mockResolvedValue(htmlResponse(lifeAtTikTokHtml))
      vi.stubGlobal('fetch', fetchMock)

      const res = await POST(makeReq({ url: LIFEATTIKTOK_URL }))

      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.html).toContain('<h1>(General Hire) Backend Software Engineer - Trust and Safety</h1>')
      expect(data.html).toContain('<th>Location</th><td>Seattle</td>')
      expect(data.html).toContain('<th>Employment Type</th><td>Regular</td>')
      expect(data.html).toContain('<th>Job Code</th><td>A250153</td>')
      expect(data.html).toContain('Backend engineer role.')
      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(fetchMock).toHaveBeenCalledWith(LIFEATTIKTOK_URL, expect.anything())
    })

    it('returns title, Location, and description for joinbytedance.com URL [AC-627-2]', async () => {
      mockUser()
      const fetchMock = vi.fn().mockResolvedValue(htmlResponse(joinByteDanceHtml))
      vi.stubGlobal('fetch', fetchMock)

      const res = await POST(makeReq({ url: JOINBYTEDANCE_URL }))

      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.html).toContain('<h1>Senior Research Scientist, Intelligent Editing (Multimodality)</h1>')
      expect(data.html).toContain('<th>Location</th><td>Seattle</td>')
      expect(data.html).toContain('<th>Job Code</th><td>A257435</td>')
      expect(data.html).toContain('Research scientist role.')
      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(fetchMock).toHaveBeenCalledWith(JOINBYTEDANCE_URL, expect.anything())
    })

    it('falls through to extractJobContent when RSC has no editor-content T-payload (USDS fallback case) [AC-627-3]', async () => {
      // Synthetic: USDS jobs on lifeattiktok.com have RSC metadata rows but no editor-content div
      mockUser()
      const noEditorContentHtml = `<html><head><title>USDS Software Engineer</title></head><body>
<script>self.__next_f.push([1,"metadata rsc without editor content div"])</script>
<p>USDS job description here</p>
</body></html>`
      const fetchMock = vi.fn().mockResolvedValue(htmlResponse(noEditorContentHtml))
      vi.stubGlobal('fetch', fetchMock)

      const res = await POST(makeReq({ url: LIFEATTIKTOK_URL }))

      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.html).toContain('USDS job description here')
      expect(data.html).not.toContain('<h1>USDS Software Engineer</h1>')
    })

    it('falls through to extractJobContent when page has no self.__next_f.push calls at all [AC-627-4]', async () => {
      mockUser()
      const noRscHtml = `<html><body><p>No RSC pushes here</p></body></html>`
      const fetchMock = vi.fn().mockResolvedValue(htmlResponse(noRscHtml))
      vi.stubGlobal('fetch', fetchMock)

      const res = await POST(makeReq({ url: JOINBYTEDANCE_URL }))

      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.html).toContain('No RSC pushes here')
    })

    it('non-lifeattiktok URL triggers exactly one fetch with no lifeattiktok parsing [AC-627-5]', async () => {
      mockUser()
      const fetchMock = vi.fn().mockResolvedValue(htmlResponse('<html><body><p>Regular</p></body></html>'))
      vi.stubGlobal('fetch', fetchMock)

      const res = await POST(makeReq({ url: 'https://example.com/jobs/123' }))

      expect(res.status).toBe(200)
      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(fetchMock).toHaveBeenCalledWith('https://example.com/jobs/123', expect.anything())
      const data = await res.json()
      expect(data.html).toBe('<p>Regular</p>')
    })

    it('returns 502 when page fetch fails for lifeattiktok URL', async () => {
      mockUser()
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(htmlResponse('', { status: 403 })))

      const res = await POST(makeReq({ url: LIFEATTIKTOK_URL }))

      expect(res.status).toBe(502)
    })

    it('does not trigger handler for lifeattiktok.com URL not matching /search/{id} path', async () => {
      // Synthetic: handler only activates for /search/{id} pattern
      mockUser()
      const fetchMock = vi.fn().mockResolvedValue(htmlResponse('<html><body><p>Home</p></body></html>'))
      vi.stubGlobal('fetch', fetchMock)

      const res = await POST(makeReq({ url: 'https://lifeattiktok.com/home' }))

      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.html).toBe('<p>Home</p>')
    })
  })

  describe('TikTok USDS (careers.tiktokusds.com)', () => {
    const TIKTOK_URL =
      'https://careers.tiktokusds.com/usds/position/7629863744949815557/detail'

    beforeEach(() => {
      ;(chromium.launch as ReturnType<typeof vi.fn>).mockReset()
    })

    it('returns 200 with extracted content from headless browser [AC-622-1] [AC-622-2]', async () => {
      mockUser()
      const fakeContent =
        'Engineering Tech Lead, Data Platform – USDS\nSeattle\nResponsibilities:\nBuild and operate large-scale data systems.'
      const fakePage = {
        goto: vi.fn().mockResolvedValue(null),
        evaluate: vi.fn().mockResolvedValue(fakeContent),
      }
      const fakeBrowser = {
        newPage: vi.fn().mockResolvedValue(fakePage),
        close: vi.fn().mockResolvedValue(null),
      }
      ;(chromium.launch as ReturnType<typeof vi.fn>).mockResolvedValue(fakeBrowser)
      const fetchMock = vi.fn()
      vi.stubGlobal('fetch', fetchMock)

      const res = await POST(makeReq({ url: TIKTOK_URL }))

      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.html).toBe(fakeContent)
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('falls through to plain-fetch pipeline when launch fails', async () => {
      mockUser()
      ;(chromium.launch as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Chromium launch failed')
      )
      const fetchMock = vi.fn().mockResolvedValue(
        htmlResponse('<html><body><p>Fallback content</p></body></html>')
      )
      vi.stubGlobal('fetch', fetchMock)

      const res = await POST(makeReq({ url: TIKTOK_URL }))

      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.html).toBe('<p>Fallback content</p>')
      expect(fetchMock).toHaveBeenCalledWith(TIKTOK_URL, expect.anything())
    })

    it('does not trigger headless path for non-USDS URL [AC-622-3]', async () => {
      mockUser()
      const fetchMock = vi.fn().mockResolvedValue(
        htmlResponse('<html><body><p>Greenhouse content</p></body></html>')
      )
      vi.stubGlobal('fetch', fetchMock)

      const res = await POST(
        makeReq({ url: 'https://boards.greenhouse.io/acme/jobs/123' })
      )

      expect(res.status).toBe(200)
      expect(chromium.launch as ReturnType<typeof vi.fn>).not.toHaveBeenCalled()
      expect(fetchMock).toHaveBeenCalled()
    })
  })

  describe('joinbytedance.com (ByteDance careers, RSC payload)', () => {
    const JBD_URL = 'https://joinbytedance.com/search/7541471324356069639'

    // joinByteDanceChunks is an array of 5 decoded RSC push strings from the real page
    // (chunks 14, 15, 16, 17, 19 from the HTML response captured 2026-06-08).
    function joinByteDancePage(chunks: string[]): string {
      const scripts = chunks
        .map((c) => `<script>self.__next_f.push([1,${JSON.stringify(c)}])</script>`)
        .join('\n')
      return `<html><head></head><body>${scripts}</body></html>`
    }

    it('extracts metadata header and job description from RSC payload — real fixture data', async () => {
      mockUser()
      const fetchMock = vi
        .fn()
        .mockResolvedValue(htmlResponse(joinByteDancePage(joinByteDanceChunks as string[])))
      vi.stubGlobal('fetch', fetchMock)

      const res = await POST(makeReq({ url: JBD_URL }))

      expect(res.status).toBe(200)
      const data = await res.json()
      // Title from fixture meta chunk
      expect(data.html).toContain('<h1>Tech Lead - Data Infrastructure Site Reliability</h1>')
      // Location metadata row from fixture component tree
      expect(data.html).toContain('Seattle')
      // Team metadata row from fixture
      expect(data.html).toContain('Technology')
      // Job Code from fixture
      expect(data.html).toContain('A223980A')
      // Main description from RSC T-type text chunk
      expect(data.html).toContain('Team Introduction')
      expect(data.html).toContain('Responsibilities')
      // Qualifications from component tree children prop
      expect(data.html).toContain('Minimum Qualifications')
      // Only one fetch — page HTML, no separate API call
      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(fetchMock).toHaveBeenCalledWith(JBD_URL, expect.anything())
    })

    it('falls back to extractJobContent when no RSC push chunks present', async () => {
      mockUser()
      const fetchMock = vi
        .fn()
        .mockResolvedValue(
          htmlResponse('<html><body><p>Plain fallback</p></body></html>')
        )
      vi.stubGlobal('fetch', fetchMock)

      const res = await POST(makeReq({ url: JBD_URL }))

      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.html).toBe('<p>Plain fallback</p>')
    })

    it('falls back to extractJobContent when RSC chunks have no T-type chunk and no title', async () => {
      // Synthetic: RSC present but contains only import/module lines with no job data
      mockUser()
      const fetchMock = vi.fn().mockResolvedValue(
        htmlResponse(
          joinByteDancePage(['0:["$","div",null,{"children":"some content"}]\n'])
        )
      )
      vi.stubGlobal('fetch', fetchMock)

      const res = await POST(makeReq({ url: JBD_URL }))

      expect(res.status).toBe(200)
      const data = await res.json()
      // extractJobContent strips scripts; body has no meaningful text from RSC-only page
      expect(typeof data.html).toBe('string')
    })

    it('does not trigger joinbytedance handler for non-search paths', async () => {
      mockUser()
      const fetchMock = vi.fn().mockResolvedValue(
        htmlResponse('<html><body><p>Home page</p></body></html>')
      )
      vi.stubGlobal('fetch', fetchMock)

      const res = await POST(makeReq({ url: 'https://joinbytedance.com/locations' }))

      expect(res.status).toBe(200)
      const data = await res.json()
      // Plain body scrape — RSC handler not triggered because path doesn't match /search/\d+
      expect(data.html).toBe('<p>Home page</p>')
    })

    it('returns 502 when the page fetch fails', async () => {
      mockUser()
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(htmlResponse('', { status: 503 })))

      const res = await POST(makeReq({ url: JBD_URL }))

      expect(res.status).toBe(502)
    })
  })

  describe('Amazon careers (amazon.jobs URLs)', () => {
    const amazonJobHtml = readFileSync(
      join(__dirname, '../fixtures/amazon-job.html'),
      'utf-8'
    )
    const AMAZON_URL =
      'https://amazon.jobs/en/jobs/3200392/principal-engineer-amazon-multiple-locations-usa-global-specialty-recruiting-team'

    it('extracts metadata header and all content sections — real fixture data', async () => {
      mockUser()
      const fetchMock = vi.fn().mockResolvedValue(htmlResponse(amazonJobHtml))
      vi.stubGlobal('fetch', fetchMock)

      const res = await POST(makeReq({ url: AMAZON_URL }))

      expect(res.status).toBe(200)
      const data = await res.json()
      // Title from og:title
      expect(data.html).toContain(
        '<h1>Principal Engineer, Amazon | Multiple Locations, USA, Global Specialty Recruiting Team</h1>'
      )
      // Locations from sidebar
      expect(data.html).toContain('USA, MA, Boston')
      expect(data.html).toContain('USA, WA, Seattle')
      // Category from sidebar
      expect(data.html).toContain('Software Development')
      // Meta table present
      expect(data.html).toContain('<table>')
      // Description section content
      expect(data.html).toContain('Principal Engineers are both visionary leaders')
      // Basic Qualifications section
      expect(data.html).toContain('12+ years')
      // Preferred Qualifications section
      expect(data.html).toContain('Deep hands-on technical expertise')
      // Section headings
      expect(data.html).toContain('<h2>Description</h2>')
      expect(data.html).toContain('<h2>Basic Qualifications</h2>')
      expect(data.html).toContain('<h2>Preferred Qualifications</h2>')
      // Only one fetch — main page HTML, no separate API call
      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(fetchMock).toHaveBeenCalledWith(AMAZON_URL, expect.anything())
    })

    it('handles www.amazon.jobs URL variant', async () => {
      mockUser()
      const fetchMock = vi.fn().mockResolvedValue(htmlResponse(amazonJobHtml))
      vi.stubGlobal('fetch', fetchMock)

      const res = await POST(
        makeReq({
          url: 'https://www.amazon.jobs/en/jobs/3200392/principal-engineer-amazon',
        })
      )

      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.html).toContain('Principal Engineers are both visionary leaders')
    })

    it('falls back to extractJobContent when page has no job-detail-body', async () => {
      mockUser()
      const fetchMock = vi.fn().mockResolvedValue(
        htmlResponse('<html><body><p>SENTINEL-FALLBACK</p></body></html>')
      )
      vi.stubGlobal('fetch', fetchMock)

      const res = await POST(makeReq({ url: AMAZON_URL }))

      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.html).toBe('<p>SENTINEL-FALLBACK</p>')
    })

    it('does not trigger Amazon handler for non-job paths', async () => {
      mockUser()
      const fetchMock = vi.fn().mockResolvedValue(
        htmlResponse('<html><body><p>Home</p></body></html>')
      )
      vi.stubGlobal('fetch', fetchMock)

      const res = await POST(makeReq({ url: 'https://amazon.jobs/en' }))

      expect(res.status).toBe(200)
      const data = await res.json()
      // Plain body scrape — path /en doesn't match /[a-z-]+/jobs/\d+
      expect(data.html).toBe('<p>Home</p>')
    })

    it('returns 502 when the page fetch fails', async () => {
      mockUser()
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(htmlResponse('', { status: 503 })))

      const res = await POST(makeReq({ url: AMAZON_URL }))

      expect(res.status).toBe(502)
    })
  })

  describe('Shopify careers (www.shopify.com/careers/{slug}_{uuid})', () => {
    const SHOPIFY_URL =
      'https://www.shopify.com/careers/senior-staff-engineer-privacy-engineering_cad17f83-4d2f-45a9-8728-f149b3a50ddf'

    it('returns title, team, location, work type, employment type, date, and description from fixture', async () => {
      mockUser()
      const fetchMock = vi.fn().mockResolvedValue(htmlResponse(shopifyJobHtml))
      vi.stubGlobal('fetch', fetchMock)

      const res = await POST(makeReq({ url: SHOPIFY_URL }))

      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.html).toContain('Senior Staff Engineer - Privacy Engineering')
      expect(data.html).toContain('Engineering')       // teamName
      expect(data.html).toContain('Americas')          // locationName
      expect(data.html).toContain('Remote')            // workplaceType
      expect(data.html).toContain('Full-time')         // employmentType (FullTime → Full-time)
      expect(data.html).toContain('2026-05-06')        // publishedDate
      expect(data.html).toContain('As Senior Staff Engineer on the Privacy Engineering team')
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    it('falls back to HTML scraping when page has no streamController.enqueue', async () => {
      mockUser()
      const fetchMock = vi.fn().mockResolvedValue(
        htmlResponse('<html><body><p>Privacy job description here.</p></body></html>')
      )
      vi.stubGlobal('fetch', fetchMock)

      const res = await POST(makeReq({ url: SHOPIFY_URL }))

      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.html).toBe('<p>Privacy job description here.</p>')
    })

    it('falls back to HTML scraping when descriptionHtml is empty', async () => {
      mockUser()
      // Synthetic: a valid enqueue structure where descriptionHtml is empty
      const arr = [
        'title', 'Senior Staff Engineer',
        'descriptionHtml', '',
        'jobPosting', { _0: 1, _2: 3 }, { _4: 5 },
      ]
      const html = `<html><body><script>window.__reactRouterContext.streamController.enqueue(${JSON.stringify(JSON.stringify(arr))})</script><p>Fallback</p></body></html>`
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(htmlResponse(html)))

      const res = await POST(makeReq({ url: SHOPIFY_URL }))

      const data = await res.json()
      expect(data.html).toBe('<p>Fallback</p>')
    })

    it('does not trigger Shopify handler for non-Shopify careers URL', async () => {
      mockUser()
      const fetchMock = vi.fn().mockResolvedValue(
        htmlResponse('<html><body><p>Other job</p></body></html>')
      )
      vi.stubGlobal('fetch', fetchMock)

      const res = await POST(makeReq({ url: 'https://example.com/careers/job_cad17f83-4d2f-45a9-8728-f149b3a50ddf' }))

      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.html).toBe('<p>Other job</p>')
      // Single fetch for the page itself — no second Shopify-specific fetch
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    it('returns 502 when page fetch fails for Shopify URL', async () => {
      mockUser()
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(htmlResponse('', { status: 503 })))

      const res = await POST(makeReq({ url: SHOPIFY_URL }))

      expect(res.status).toBe(502)
    })
  })

  describe('OpenAI careers (Ashby board listing)', () => {
    const OPENAI_CAREER_URL =
      'https://openai.com/careers/principal-software-engineer-infrastructure-security-remote-us/'
    const OPENAI_BOARD_API = 'https://api.ashbyhq.com/posting-api/job-board/openai'

    it('returns title, company, location, and non-empty description from board listing fixture [AC-721-1]', async () => {
      mockUser()
      const fetchMock = vi.fn().mockImplementation((url: string) => {
        if (url === OPENAI_BOARD_API) return Promise.resolve(jsonResponse(ashbyOpenAIJob))
        return Promise.resolve(htmlResponse('<html><body>fallback</body></html>'))
      })
      vi.stubGlobal('fetch', fetchMock)

      const res = await POST(makeReq({ url: OPENAI_CAREER_URL }))

      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.html).toContain('Principal Software Engineer')
      expect(data.html).toContain('OpenAI')
      expect(data.html).toContain('Remote')
      expect(data.html).toContain('Infrastructure Security')
      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(fetchMock).toHaveBeenCalledWith(OPENAI_BOARD_API, expect.anything())
    })

    it('falls back to HTML scraping when board listing API returns 404 [AC-721-2]', async () => {
      mockUser()
      const fetchMock = vi.fn().mockImplementation((url: string) => {
        if (url === OPENAI_BOARD_API) return Promise.resolve(jsonResponse({}, 404))
        return Promise.resolve(htmlResponse('<html><body><p>Scraped JD</p></body></html>'))
      })
      vi.stubGlobal('fetch', fetchMock)

      const res = await POST(makeReq({ url: OPENAI_CAREER_URL }))

      expect(res.status).toBe(200)
      expect(fetchMock).toHaveBeenCalledWith(OPENAI_CAREER_URL, expect.anything())
    })

    it('falls back to HTML scraping when board listing API throws a network error [AC-721-3]', async () => {
      mockUser()
      const fetchMock = vi.fn().mockImplementation((url: string) => {
        if (url === OPENAI_BOARD_API) return Promise.reject(new Error('network error'))
        return Promise.resolve(htmlResponse('<html><body><p>Scraped JD</p></body></html>'))
      })
      vi.stubGlobal('fetch', fetchMock)

      const res = await POST(makeReq({ url: OPENAI_CAREER_URL }))

      expect(res.status).toBe(200)
      expect(fetchMock).toHaveBeenCalledWith(OPENAI_CAREER_URL, expect.anything())
    })

    it('does not call board listing API for non-careers openai.com paths [AC-721-4]', async () => {
      mockUser()
      const fetchMock = vi.fn().mockResolvedValue(
        htmlResponse('<html><body><p>Blog post</p></body></html>')
      )
      vi.stubGlobal('fetch', fetchMock)

      const res = await POST(makeReq({ url: 'https://openai.com/blog/some-post' }))

      expect(res.status).toBe(200)
      expect(fetchMock).not.toHaveBeenCalledWith(OPENAI_BOARD_API, expect.anything())
    })
  })
})
