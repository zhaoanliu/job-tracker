import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { extractJobContent } from '@/lib/extract-job-content'

const MAX_BYTES = 500_000
const TIMEOUT_MS = 10_000
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

function buildWorkdayMeta(ld: Record<string, unknown>): string {
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
  const rows: Array<[string, string]> = []

  const title = str(ld.title)

  const jobLocationRaw = ld.jobLocation
  let location = ''
  if (jobLocationRaw != null && typeof jobLocationRaw === 'object') {
    const addr = (jobLocationRaw as Record<string, unknown>).address
    if (addr != null && typeof addr === 'object') {
      const a = addr as Record<string, unknown>
      location = [str(a.addressLocality), str(a.addressCountry)].filter(Boolean).join(', ')
    }
  }

  const identifierRaw = ld.identifier
  let jobId = ''
  if (identifierRaw != null && typeof identifierRaw === 'object') {
    jobId = str((identifierRaw as Record<string, unknown>).value)
  }

  const datePosted = str(ld.datePosted)

  const employmentTypeRaw = str(ld.employmentType)
  const employmentType = employmentTypeRaw
    ? employmentTypeRaw.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase())
    : ''

  const hiringOrgRaw = ld.hiringOrganization
  let company = ''
  if (hiringOrgRaw != null && typeof hiringOrgRaw === 'object') {
    company = str((hiringOrgRaw as Record<string, unknown>).name)
  }

  if (jobId) rows.push(['Job ID', jobId])
  if (datePosted) rows.push(['Date posted', datePosted])
  if (location) rows.push(['Location', location])
  if (employmentType) rows.push(['Employment type', employmentType])
  if (company) rows.push(['Company', company])

  if (!title && rows.length === 0) return ''

  const header = title ? `<h1>${title}</h1>` : ''
  if (rows.length === 0) return header

  const tableRows = rows.map(([k, v]) => `<tr><th>${k}</th><td>${v}</td></tr>`).join('')
  return `${header}<table>${tableRows}</table><hr>`
}

function buildUberMeta(ld: Record<string, unknown>): string {
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
  const rows: Array<[string, string]> = []

  const title = str(ld.title)
  const dept = str(ld.occupationalCategory)

  const extractAddress = (loc: unknown): string => {
    if (loc == null || typeof loc !== 'object') return ''
    const addr = (loc as Record<string, unknown>).address
    if (addr == null || typeof addr !== 'object') return ''
    const a = addr as Record<string, unknown>
    return [str(a.addressLocality), str(a.addressRegion)].filter(Boolean).join(', ')
  }
  const locationRaw = ld.jobLocation
  const location = Array.isArray(locationRaw)
    ? (locationRaw as unknown[]).map(extractAddress).filter(Boolean).join(' | ')
    : extractAddress(locationRaw)

  const workType = str(ld.employmentType).replace(/-/g, ' ')

  if (dept) rows.push(['Department', dept])
  if (location) rows.push(['Location', location])
  if (workType) rows.push(['Work type', workType])

  if (!title && rows.length === 0) return ''

  const header = title ? `<h1>${title}</h1>` : ''
  if (rows.length === 0) return header

  const tableRows = rows.map(([k, v]) => `<tr><th>${k}</th><td>${v}</td></tr>`).join('')
  return `${header}<table>${tableRows}</table><hr>`
}

function buildGenericJobPostingMeta(ld: Record<string, unknown>): string {
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
  const rows: Array<[string, string]> = []

  const title = str(ld.title)

  const hiringOrgRaw = ld.hiringOrganization
  let company = ''
  if (hiringOrgRaw != null && typeof hiringOrgRaw === 'object') {
    company = str((hiringOrgRaw as Record<string, unknown>).name)
  }

  const identifierRaw = ld.identifier
  let jobId = ''
  if (typeof identifierRaw === 'string') {
    jobId = identifierRaw.trim()
  } else if (identifierRaw != null && typeof identifierRaw === 'object') {
    jobId = str((identifierRaw as Record<string, unknown>).value)
  }

  const extractAddress = (loc: unknown): string => {
    if (loc == null || typeof loc !== 'object') return ''
    const addr = (loc as Record<string, unknown>).address
    if (addr == null || typeof addr !== 'object') return ''
    const a = addr as Record<string, unknown>
    return [str(a.addressLocality), str(a.addressRegion)].filter(Boolean).join(', ')
  }
  const locationRaw = ld.jobLocation
  const location = Array.isArray(locationRaw)
    ? (locationRaw as unknown[]).map(extractAddress).filter(Boolean).join(' | ')
    : extractAddress(locationRaw)

  const datePosted = str(ld.datePosted)

  const employmentTypeRaw = str(ld.employmentType)
  const employmentType = employmentTypeRaw
    ? employmentTypeRaw.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase())
    : ''

  if (company) rows.push(['Company', company])
  if (jobId) rows.push(['Job ID', jobId])
  if (datePosted) rows.push(['Date posted', datePosted])
  if (location) rows.push(['Location', location])
  if (employmentType) rows.push(['Employment type', employmentType])

  if (!title && rows.length === 0) return ''

  const header = title ? `<h1>${title}</h1>` : ''
  if (rows.length === 0) return header

  const tableRows = rows.map(([k, v]) => `<tr><th>${k}</th><td>${v}</td></tr>`).join('')
  return `${header}<table>${tableRows}</table><hr>`
}

// Generic fallback: extracts schema.org/JobPosting JSON-LD from any career page.
// Handles sites like Expedia (careers.expediagroup.com) that embed standard markup
// but don't use a recognised ATS API. Runs after all ATS-specific handlers.
function extractGenericJobPostingFromPage(html: string): string | null {
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
          const ld = item as Record<string, unknown>
          const meta = buildGenericJobPostingMeta(ld)
          return meta + (ld.description as string).trim()
        }
      }
    } catch {
      // invalid JSON-LD block — try next script tag
    }
  }
  return null
}

// Parse JSON-LD JobPosting from page HTML and prepend a structured metadata header.
// Used for Workday: the CXS API requires browser cookies; JSON-LD is publicly available.
function extractWorkdayFromPage(html: string): string | null {
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
          const ld = item as Record<string, unknown>
          const meta = buildWorkdayMeta(ld)
          return meta + (ld.description as string).trim()
        }
      }
    } catch {
      // invalid JSON-LD block — try next script tag
    }
  }
  return null
}

// Parse JSON-LD JobPosting from Uber page HTML. Uber's description is HTML-entity-encoded.
function extractUberFromPage(html: string): string | null {
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
          const ld = item as Record<string, unknown>
          const meta = buildUberMeta(ld)
          return meta + decodeHtmlEntities((ld.description as string).trim())
        }
      }
    } catch {
      // invalid JSON-LD block — try next script tag
    }
  }
  return null
}

// Greenhouse `content` field is HTML-entity-encoded after JSON.parse — decode once.
function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&amp;/g, '&') // must be last
}

function buildWorkableMeta(data: Record<string, unknown>): string {
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
  const rows: Array<[string, string]> = []

  const title = str(data.title)

  const loc = data.location != null && typeof data.location === 'object'
    ? (data.location as Record<string, unknown>)
    : {}
  const city = str(loc.city)
  const region = str(loc.region)
  const country = str(loc.country)
  const location = [city, region || country].filter(Boolean).join(', ')

  const department = Array.isArray(data.department)
    ? (data.department as unknown[]).map((d) => str(d)).filter(Boolean).join(', ')
    : ''

  const typeMap: Record<string, string> = {
    full: 'Full-time',
    part: 'Part-time',
    contract: 'Contract',
    temporary: 'Temporary',
    internship: 'Internship',
  }
  const workType = typeMap[str(data.type)] ?? ''

  const wpRaw = str(data.workplace)
  const workplace = wpRaw ? wpRaw.charAt(0).toUpperCase() + wpRaw.slice(1) : ''

  if (location) rows.push(['Location', location])
  if (department) rows.push(['Department', department])
  if (workType) rows.push(['Work type', workType])
  if (workplace) rows.push(['Workplace', workplace])

  if (!title && rows.length === 0) return ''

  const header = title ? `<h1>${title}</h1>` : ''
  if (rows.length === 0) return header

  const tableRows = rows.map(([k, v]) => `<tr><th>${k}</th><td>${v}</td></tr>`).join('')
  return `${header}<table>${tableRows}</table><hr>`
}

async function fetchWorkableJob(
  company: string,
  shortcode: string,
  signal: AbortSignal
): Promise<string | null> {
  try {
    const apiRes = await fetch(
      `https://apply.workable.com/api/v1/accounts/${company}/jobs/${shortcode}`,
      { signal, headers: { Accept: 'application/json', 'User-Agent': USER_AGENT } }
    )
    if (!apiRes.ok) return null
    const data = (await apiRes.json()) as Record<string, unknown>
    const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
    const body = [str(data.description), str(data.requirements), str(data.benefits)]
      .filter(Boolean)
      .join('')
    if (!body) return null
    const meta = buildWorkableMeta(data)
    return meta + body
  } catch {
    return null
  }
}

function buildGreenhouseMeta(data: Record<string, unknown>): string {
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
  const rows: Array<[string, string]> = []

  const title = str(data.title)
  const company = str(data.company_name)
  const location =
    data.location != null && typeof (data.location as Record<string, unknown>).name === 'string'
      ? str((data.location as Record<string, unknown>).name)
      : ''

  if (company) rows.push(['Company', company])
  if (location) rows.push(['Location', location])

  if (!title && rows.length === 0) return ''

  const header = title ? `<h1>${title}</h1>` : ''
  if (rows.length === 0) return header

  const tableRows = rows.map(([k, v]) => `<tr><th>${k}</th><td>${v}</td></tr>`).join('')
  return `${header}<table>${tableRows}</table><hr>`
}

async function fetchGreenhouseJob(
  board: string,
  jobId: string,
  signal: AbortSignal
): Promise<string | null> {
  try {
    const apiRes = await fetch(
      `https://boards-api.greenhouse.io/v1/boards/${board}/jobs/${jobId}`,
      { signal, headers: { Accept: 'application/json', 'User-Agent': USER_AGENT } }
    )
    if (!apiRes.ok) return null
    const data = (await apiRes.json()) as Record<string, unknown>
    if (typeof data?.content !== 'string' || !data.content.trim()) return null
    const meta = buildGreenhouseMeta(data)
    return meta + decodeHtmlEntities(data.content.trim())
  } catch {
    return null
  }
}

function buildLeverMeta(data: Record<string, unknown>): string {
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
  const rows: Array<[string, string]> = []

  const title = str(data.text)
  const categories = data.categories != null && typeof data.categories === 'object'
    ? (data.categories as Record<string, unknown>)
    : {}
  const allLocations = Array.isArray(categories.allLocations)
    ? (categories.allLocations as unknown[]).map((l) => str(l)).filter(Boolean).join(', ')
    : str(categories.location)
  const team = str(categories.team)
  const workplaceType = str(data.workplaceType)

  if (team) rows.push(['Team', team])
  if (allLocations) rows.push(['Location', allLocations])
  if (workplaceType) rows.push(['Work type', workplaceType])

  if (!title && rows.length === 0) return ''

  const header = title ? `<h1>${title}</h1>` : ''
  if (rows.length === 0) return header

  const tableRows = rows.map(([k, v]) => `<tr><th>${k}</th><td>${v}</td></tr>`).join('')
  return `${header}<table>${tableRows}</table><hr>`
}

async function fetchLeverJob(
  company: string,
  postingId: string,
  signal: AbortSignal
): Promise<string | null> {
  try {
    const apiRes = await fetch(
      `https://api.lever.co/v0/postings/${company}/${postingId}`,
      { signal, headers: { Accept: 'application/json', 'User-Agent': USER_AGENT } }
    )
    if (!apiRes.ok) return null
    const data = (await apiRes.json()) as Record<string, unknown>

    const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
    const opening = str(data.opening)
    const description = str(data.description)
    const additional = str(data.additional)

    const listSections = Array.isArray(data.lists)
      ? (data.lists as Array<Record<string, unknown>>)
          .map((l) => {
            const header = str(l.text)
            const content = str(l.content)
            if (!content) return ''
            return header ? `<h3>${header}</h3>${content}` : content
          })
          .filter(Boolean)
          .join('')
      : ''

    const body = [opening, description, listSections, additional].filter(Boolean).join('')
    if (!body) return null

    const meta = buildLeverMeta(data)
    return meta + body
  } catch {
    return null
  }
}

function buildLinkedInMeta(parsed: {
  title: string
  company: string
  location: string
  criteria: Array<[string, string]>
}): string {
  const rows: Array<[string, string]> = []
  if (parsed.company) rows.push(['Company', parsed.company])
  if (parsed.location) rows.push(['Location', parsed.location])
  for (const [label, value] of parsed.criteria) {
    if (label && value) rows.push([label, value])
  }

  if (!parsed.title && rows.length === 0) return ''

  const header = parsed.title ? `<h1>${parsed.title}</h1>` : ''
  if (rows.length === 0) return header

  const tableRows = rows.map(([k, v]) => `<tr><th>${k}</th><td>${v}</td></tr>`).join('')
  return `${header}<table>${tableRows}</table><hr>`
}

async function fetchLinkedInJob(jobId: string, signal: AbortSignal): Promise<string | null> {
  try {
    const apiRes = await fetch(
      `https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/${jobId}`,
      { signal, headers: { 'User-Agent': USER_AGENT } }
    )
    if (!apiRes.ok) {
      console.warn('fetch-job-description: LinkedIn non-2xx', apiRes.status, jobId)
      return null
    }
    const raw = await apiRes.text()

    const descMatch = raw.match(
      /<div[^>]*class="[^"]*show-more-less-html__markup[^"]*"[^>]*>([\s\S]*?)<\/div>/i
    )
    if (!descMatch) return null

    const titleMatch = raw.match(
      /<h2[^>]*class="[^"]*topcard__title[^"]*"[^>]*>([\s\S]*?)<\/h2>/i
    )
    const orgMatch = raw.match(
      /<a[^>]*class="[^"]*topcard__org-name-link[^"]*"[^>]*>([\s\S]*?)<\/a>/i
    )
    const locationMatch = raw.match(
      /<span[^>]*class="[^"]*topcard__flavor--bullet[^"]*"[^>]*>([\s\S]*?)<\/span>/i
    )

    const criteria: Array<[string, string]> = []
    const itemRegex =
      /<li[^>]*class="[^"]*description__job-criteria-item[^"]*"[^>]*>([\s\S]*?)<\/li>/gi
    let itemMatch: RegExpExecArray | null
    while ((itemMatch = itemRegex.exec(raw)) !== null) {
      const labelMatch = itemMatch[1].match(/<h3[^>]*>([\s\S]*?)<\/h3>/i)
      const valueMatch = itemMatch[1].match(/<span[^>]*>([\s\S]*?)<\/span>/i)
      if (labelMatch && valueMatch) {
        criteria.push([labelMatch[1].trim(), valueMatch[1].trim()])
      }
    }

    const meta = buildLinkedInMeta({
      title: titleMatch ? titleMatch[1].trim() : '',
      company: orgMatch ? orgMatch[1].trim() : '',
      location: locationMatch ? locationMatch[1].trim() : '',
      criteria,
    })
    return meta + descMatch[1].trim()
  } catch {
    return null
  }
}

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

// Google Careers embeds full job data in AF_initDataCallback({key: 'ds:0', ..., data:[...]}).
// data[0]: [jobId, title, signinUrl, responsibilities, qualifications, projectPath,
//           null, company, locale, locations, about, ...]
// The page is a JS-rendered SPA with no JSON-LD, so this is the only server-side data source.
function extractGoogleCareersFromPage(html: string): string | null {
  const dsZeroIdx = html.indexOf("key: 'ds:0'")
  if (dsZeroIdx === -1) return null

  const dataIdx = html.indexOf('data:[', dsZeroIdx)
  if (dataIdx === -1 || dataIdx - dsZeroIdx > 200) return null

  const arrayStart = dataIdx + 5 // index of '['
  let depth = 0
  let i = arrayStart
  while (i < html.length) {
    if (html[i] === '[') depth++
    else if (html[i] === ']') {
      depth--
      if (depth === 0) break
    }
    i++
  }
  if (depth !== 0) return null

  let outer: unknown[][]
  try {
    outer = JSON.parse(html.slice(arrayStart, i + 1)) as unknown[][]
  } catch {
    return null
  }

  if (!Array.isArray(outer) || !Array.isArray(outer[0])) return null
  const job = outer[0] as unknown[]
  if (job.length < 11) return null

  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
  const getContent = (field: unknown): string => {
    if (Array.isArray(field) && typeof field[1] === 'string') return field[1].trim()
    return ''
  }

  const title = str(job[1])
  const company = str(job[7])
  const jobId = str(job[0])
  const locations = Array.isArray(job[9])
    ? (job[9] as unknown[]).map((l: unknown) => (Array.isArray(l) ? str(l[0]) : '')).filter(Boolean).join(' | ')
    : ''

  const about = getContent(job[10])
  const responsibilities = getContent(job[3])
  const qualifications = getContent(job[4])

  const sections: string[] = []
  if (about) sections.push(about)
  if (responsibilities) sections.push('<h3>Responsibilities</h3>' + responsibilities)
  if (qualifications) sections.push(qualifications)

  const body = sections.join('')
  if (!body) return null

  const rows: Array<[string, string]> = []
  if (company) rows.push(['Company', company])
  if (jobId) rows.push(['Job ID', jobId])
  if (locations) rows.push(['Location', locations])

  const header = title ? `<h1>${title}</h1>` : ''
  if (rows.length === 0) return header + body
  const tableRows = rows.map(([k, v]) => `<tr><th>${k}</th><td>${v}</td></tr>`).join('')
  return `${header}<table>${tableRows}</table><hr>${body}`
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

  const isWorkdayJob =
    /^[a-z0-9-]+\.wd\d+\.myworkdayjobs\.com$/.test(parsed.hostname) &&
    parsed.pathname.includes('/job/')

  const isUberJob =
    parsed.hostname === 'www.uber.com' && /\/careers\/list\/\d+/.test(parsed.pathname)

  const isGoogleCareers =
    (parsed.hostname === 'www.google.com' &&
      /^\/about\/careers\/applications\/jobs\/results\/\d+/.test(parsed.pathname)) ||
    (parsed.hostname === 'careers.google.com' && /^\/jobs\/results\/\d+/.test(parsed.pathname))

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

    // Workable ATS — apply.workable.com/{company}/j/{shortcode}
    const workableMatch =
      parsed.hostname === 'apply.workable.com' &&
      parsed.pathname.match(/^\/([A-Za-z0-9_-]+)\/j\/([A-Za-z0-9]+)$/)
    if (workableMatch) {
      const workableHtml = await fetchWorkableJob(workableMatch[1], workableMatch[2], controller.signal)
      if (workableHtml !== null) return NextResponse.json({ html: workableHtml })
      // API unavailable — fall through to HTML scraping
    }

    // Lever ATS (Netflix, Reddit, many startups) — jobs.lever.co/{company}/{uuid}
    const leverMatch =
      parsed.hostname === 'jobs.lever.co' &&
      parsed.pathname.match(
        /^\/([A-Za-z0-9_-]+)\/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/
      )
    if (leverMatch) {
      const leverHtml = await fetchLeverJob(leverMatch[1], leverMatch[2], controller.signal)
      if (leverHtml !== null) return NextResponse.json({ html: leverHtml })
      // API unavailable — fall through to HTML scraping
    }

    // Greenhouse ATS direct URLs (boards.greenhouse.io or job-boards.greenhouse.io)
    const directGhMatch =
      (parsed.hostname === 'boards.greenhouse.io' ||
        parsed.hostname === 'job-boards.greenhouse.io') &&
      parsed.pathname.match(/^\/([A-Za-z0-9_-]+)\/jobs\/(\d+)$/)
    if (directGhMatch) {
      const ghHtml = await fetchGreenhouseJob(directGhMatch[1], directGhMatch[2], controller.signal)
      if (ghHtml !== null) return NextResponse.json({ html: ghHtml })
      // API unavailable — fall through to HTML scraping
    }

    // Stripe careers — stripe.com/jobs/listing/{slug}/{id} is Greenhouse-backed (board "stripe").
    // The page HTML is JS-rendered with no Greenhouse references in the server response, so
    // none of the post-fetch handlers match; detect by URL and call the Greenhouse API directly.
    const stripeMatch =
      parsed.hostname === 'stripe.com' &&
      parsed.pathname.match(/^\/jobs\/listing\/[A-Za-z0-9_-]+\/(\d+)$/)
    if (stripeMatch) {
      const ghHtml = await fetchGreenhouseJob('stripe', stripeMatch[1], controller.signal)
      if (ghHtml !== null) return NextResponse.json({ html: ghHtml })
      // API unavailable — fall through to HTML scraping
    }

    // HubSpot careers — hubspot.com/careers/jobs/{id} is a Greenhouse board (slug: hubspotjobs)
    const hubspotMatch =
      (parsed.hostname === 'www.hubspot.com' || parsed.hostname === 'hubspot.com') &&
      parsed.pathname.match(/^\/careers\/jobs\/(\d+)\/?$/)
    if (hubspotMatch) {
      const ghHtml = await fetchGreenhouseJob('hubspotjobs', hubspotMatch[1], controller.signal)
      if (ghHtml !== null) return NextResponse.json({ html: ghHtml })
      // API unavailable — fall through to HTML scraping
    }

    const linkedInMatch =
      parsed.hostname === 'www.linkedin.com' &&
      parsed.pathname.match(/^\/jobs\/view\/.*?(\d+)\/?$/)
    if (linkedInMatch) {
      const linkedInHtml = await fetchLinkedInJob(linkedInMatch[1], controller.signal)
      if (linkedInHtml !== null) return NextResponse.json({ html: linkedInHtml })
      // API unavailable — fall through to HTML scraping
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
      console.warn('fetch-job-description: non-2xx response', res.status, parsed.toString())
      return NextResponse.json({ error: 'Failed to fetch job description' }, { status: 502 })
    }

    const contentType = res.headers.get('content-type') ?? ''
    if (contentType && !/text\/|application\/(xhtml|xml|json)/i.test(contentType)) {
      console.warn('fetch-job-description: non-text content-type', contentType)
      return NextResponse.json({ error: 'Failed to fetch job description' }, { status: 502 })
    }

    const text = await res.text()
    const raw = text.length > MAX_BYTES ? text.slice(0, MAX_BYTES) : text

    // Workday ATS — extract structured metadata from JSON-LD embedded in page HTML.
    // The Workday CXS API requires browser session cookies; JSON-LD is publicly available.
    if (isWorkdayJob) {
      const workdayHtml = extractWorkdayFromPage(raw)
      if (workdayHtml !== null) return NextResponse.json({ html: workdayHtml })
      // No usable JSON-LD — fall through to extractJobContent
    }

    // Uber ATS — JSON-LD JobPosting embedded in page HTML.
    // URL pattern: www.uber.com/global/en/careers/list/{id}/
    if (isUberJob) {
      const uberHtml = extractUberFromPage(raw)
      if (uberHtml !== null) return NextResponse.json({ html: uberHtml })
      // No usable JSON-LD — fall through to extractJobContent
    }

    // Google Careers — data embedded in AF_initDataCallback({key: 'ds:0', ...}) in page HTML.
    // No JSON-LD and no public API; server renders the full job data in this callback block.
    if (isGoogleCareers) {
      const googleHtml = extractGoogleCareersFromPage(raw)
      if (googleHtml !== null) return NextResponse.json({ html: googleHtml })
      // No usable data block — fall through to extractJobContent
    }

    // Greenhouse ATS embedded in third-party pages (e.g. Scale.com) — page HTML
    // contains a reference like greenhouse.io/{board}/jobs/{id}.
    const embeddedGhMatch = raw.match(/\bgreenhouse\.io\/([A-Za-z0-9_-]+)\/jobs\/(\d+)/)
    if (embeddedGhMatch) {
      const ghHtml = await fetchGreenhouseJob(embeddedGhMatch[1], embeddedGhMatch[2], controller.signal)
      if (ghHtml !== null) return NextResponse.json({ html: ghHtml })
      // API unavailable — fall through to extractJobContent
    }

    // Greenhouse embed board — career pages with ?gh_jid= param + embed script tag.
    // E.g. sofi.com/careers/job/?gh_jid=ID renders via Greenhouse embed JS; the board
    // name is in the embed script src (?for=board). Job content is JS-rendered so the
    // HTML scraping fallback returns nothing useful — must use the API.
    const ghJid = parsed.searchParams.get('gh_jid')
    if (ghJid && !embeddedGhMatch) {
      const embedBoardMatch = raw.match(/\bgreenhouse\.io\/embed\/job_board\/js\?for=([A-Za-z0-9_-]+)/)
      if (embedBoardMatch) {
        const ghHtml = await fetchGreenhouseJob(embedBoardMatch[1], ghJid, controller.signal)
        if (ghHtml !== null) return NextResponse.json({ html: ghHtml })
        // API unavailable — fall through to extractJobContent
      }
    }

    // Generic schema.org/JobPosting JSON-LD handler — covers career sites like Expedia
    // that embed standard markup but don't use a recognised ATS with a dedicated handler.
    const genericJobHtml = extractGenericJobPostingFromPage(raw)
    if (genericJobHtml !== null) return NextResponse.json({ html: genericJobHtml })

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
