import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { extractJobContent } from '@/lib/extract-job-content'

const MAX_BYTES = 500_000
const TIMEOUT_MS = 10_000
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

function buildEightfoldMeta(data: Record<string, unknown>): string {
  const rows: Array<[string, string]> = []

  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

  const title = str(data.name)
  const jobId = str(data.display_job_id)
  const location =
    Array.isArray(data.locations) && data.locations.length > 0
      ? (data.locations as unknown[])
          .map((l) => str(l))
          .filter((l) => l && !l.toLowerCase().includes('multiple locations'))
          .join(', ')
      : str(data.location)
  const workSite = str(data.work_location_option)
  const department = str(data.department)
  const businessUnit = str(data.business_unit)
  const travel = str(data.travel_required)

  let datePosted = ''
  const tc = data.t_create
  if (typeof tc === 'number' && tc > 0) {
    const d = new Date(tc * 1000)
    if (!isNaN(d.getTime())) datePosted = d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  } else if (typeof tc === 'string') {
    const d = new Date(tc)
    if (!isNaN(d.getTime())) datePosted = d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  }

  if (jobId) rows.push(['Job number', jobId])
  if (datePosted) rows.push(['Date posted', datePosted])
  if (location) rows.push(['Location', location])
  if (workSite) rows.push(['Work site', workSite])
  if (travel) rows.push(['Travel', travel])
  if (department) rows.push(['Department', department])
  if (businessUnit) rows.push(['Business unit', businessUnit])

  if (!title && rows.length === 0) return ''

  const header = title ? `<h1>${title}</h1>` : ''
  if (rows.length === 0) return header

  const tableRows = rows.map(([k, v]) => `<tr><th>${k}</th><td>${v}</td></tr>`).join('')
  return `${header}<table>${tableRows}</table><hr>`
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
    // Eightfold.ai ATS (Microsoft, Nvidia, Uber, etc.) — /careers/job/{id} URLs expose a
    // JSON API that returns the formatted job_description HTML directly, avoiding JS rendering.
    const eightfoldMatch = parsed.pathname.match(/\/careers\/job\/(\d+)$/)
    if (eightfoldMatch) {
      const apiUrl = `${parsed.origin}/api/apply/v2/jobs/${eightfoldMatch[1]}`
      try {
        const apiRes = await fetch(apiUrl, {
          signal: controller.signal,
          headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
        })
        if (apiRes.ok) {
          const data = (await apiRes.json()) as Record<string, unknown>
          if (typeof data?.job_description === 'string' && data.job_description.trim()) {
            const meta = buildEightfoldMeta(data)
            return NextResponse.json({ html: meta + data.job_description.trim() })
          }
        }
      } catch {
        // API unavailable — fall through to HTML scraping
      }
    }

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
