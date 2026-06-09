import { NextRequest, NextResponse } from 'next/server'
import { extractJobContent, decodeHtmlEntities } from '@/lib/extract-job-content'
import { getAuthenticatedUser } from '@/lib/auth'

const MAX_BYTES = 500_000
const TIMEOUT_MS = 10_000
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

function buildMetaTable(title: string, rows: Array<[string, string]>): string {
  if (!title && rows.length === 0) return ''
  const header = title ? `<h1>${title}</h1>` : ''
  if (rows.length === 0) return header
  const tableRows = rows.map(([k, v]) => `<tr><th>${k}</th><td>${v}</td></tr>`).join('')
  return `${header}<table>${tableRows}</table><hr>`
}

function extractAddress(loc: unknown, fallbackToCountry = false): string {
  if (loc == null || typeof loc !== 'object') return ''
  const addr = (loc as Record<string, unknown>).address
  if (addr == null || typeof addr !== 'object') return ''
  const a = addr as Record<string, unknown>
  const cityRegion = [str(a.addressLocality), str(a.addressRegion)].filter(Boolean).join(', ')
  return fallbackToCountry ? cityRegion || str(a.addressCountry) : cityRegion
}

function extractJsonLdJobPosting(
  html: string,
  buildMeta: (ld: Record<string, unknown>) => string,
  postProcess: (desc: string) => string = (s) => s
): string | null {
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
          return buildMeta(ld) + postProcess((ld.description as string).trim())
        }
      }
    } catch {
      // invalid JSON-LD block — try next script tag
    }
  }
  return null
}

function buildWorkdayMeta(ld: Record<string, unknown>): string {
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

  return buildMetaTable(title, rows)
}

function buildUberMeta(ld: Record<string, unknown>): string {
  const rows: Array<[string, string]> = []
  const title = str(ld.title)
  const dept = str(ld.occupationalCategory)

  const locationRaw = ld.jobLocation
  const location = Array.isArray(locationRaw)
    ? (locationRaw as unknown[]).map((l) => extractAddress(l)).filter(Boolean).join(' | ')
    : extractAddress(locationRaw)

  const workType = str(ld.employmentType).replace(/-/g, ' ')

  if (dept) rows.push(['Department', dept])
  if (location) rows.push(['Location', location])
  if (workType) rows.push(['Work type', workType])

  return buildMetaTable(title, rows)
}

function buildGenericJobPostingMeta(ld: Record<string, unknown>): string {
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

  const locationRaw = ld.jobLocation
  const location = Array.isArray(locationRaw)
    ? (locationRaw as unknown[]).map((l) => extractAddress(l, true)).filter(Boolean).join(' | ')
    : extractAddress(locationRaw, true)

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

  return buildMetaTable(title, rows)
}

function buildWorkableMeta(data: Record<string, unknown>): string {
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

  return buildMetaTable(title, rows)
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
    const body = [str(data.description), str(data.requirements), str(data.benefits)]
      .filter(Boolean)
      .join('')
    if (!body) return null
    return buildWorkableMeta(data) + body
  } catch {
    return null
  }
}

// Ashby ATS — custom career domains (e.g. careers.confluent.io) block server-side
// fetches with Vercel bot protection. jobs.ashbyhq.com/{company}/{uuid} serves the
// same page without gating and embeds schema.org/JobPosting JSON-LD.
async function fetchAshbyJobFromCanonical(
  company: string,
  jobId: string,
  signal: AbortSignal
): Promise<string | null> {
  try {
    const pageRes = await fetch(
      `https://jobs.ashbyhq.com/${company}/${jobId}`,
      {
        signal,
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'text/html,application/xhtml+xml,*/*;q=0.8',
        },
      }
    )
    if (!pageRes.ok) return null
    const html = await pageRes.text()
    return extractGenericJobPostingFromPage(html)
  } catch {
    return null
  }
}

function buildGreenhouseMeta(data: Record<string, unknown>): string {
  const rows: Array<[string, string]> = []
  const title = str(data.title)
  const company = str(data.company_name)
  const location =
    data.location != null && typeof (data.location as Record<string, unknown>).name === 'string'
      ? str((data.location as Record<string, unknown>).name)
      : ''

  if (company) rows.push(['Company', company])
  if (location) rows.push(['Location', location])

  return buildMetaTable(title, rows)
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
    return buildGreenhouseMeta(data) + decodeHtmlEntities(data.content.trim())
  } catch {
    return null
  }
}

function extractNextDataGreenhouseJob(html: string): string | null {
  try {
    const match = html.match(
      /<script\s+id="__NEXT_DATA__"\s+type="application\/json">([\s\S]*?)<\/script>/
    )
    if (!match) return null
    const parsed = JSON.parse(match[1]) as Record<string, unknown>
    const pageProps = (parsed?.props as Record<string, unknown>)
      ?.pageProps as Record<string, unknown>
    const job = pageProps?.job as Record<string, unknown>
    if (typeof job?.content !== 'string') return null
    return buildGreenhouseMeta(job) + decodeHtmlEntities(job.content.trim())
  } catch {
    return null
  }
}

function buildLeverMeta(data: Record<string, unknown>): string {
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

  return buildMetaTable(title, rows)
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

    return buildLeverMeta(data) + body
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
  return buildMetaTable(parsed.title, rows)
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

  return buildMetaTable(title, rows)
}

function buildGemMeta(posting: Record<string, unknown>): string {
  const rows: Array<[string, string]> = []
  const title = str(posting.title)

  const jobRaw = posting.job
  const job =
    jobRaw != null && typeof jobRaw === 'object' ? (jobRaw as Record<string, unknown>) : {}

  const deptRaw = job.department
  const department =
    deptRaw != null && typeof deptRaw === 'object'
      ? str((deptRaw as Record<string, unknown>).name)
      : ''

  const team = str(job.teamDisplayName)

  const locationsRaw = posting.locations
  const location = Array.isArray(locationsRaw)
    ? (locationsRaw as unknown[])
        .map((l) => {
          if (l == null || typeof l !== 'object') return ''
          const loc = l as Record<string, unknown>
          const name = str(loc.name)
          if (!name) return ''
          return loc.isRemote === true ? `${name} (Remote)` : name
        })
        .filter(Boolean)
        .join(' | ')
    : ''

  const locationTypeMap: Record<string, string> = {
    IN_OFFICE: 'In office',
    REMOTE: 'Remote',
    HYBRID: 'Hybrid',
  }
  const workType = locationTypeMap[str(job.locationType)] ?? ''

  const employmentTypeMap: Record<string, string> = {
    FULL_TIME: 'Full-time',
    PART_TIME: 'Part-time',
    CONTRACT: 'Contract',
    INTERNSHIP: 'Internship',
    TEMPORARY: 'Temporary',
  }
  const employmentType = employmentTypeMap[str(job.employmentType)] ?? ''

  if (department) rows.push(['Department', department])
  if (team && team !== department) rows.push(['Team', team])
  if (location) rows.push(['Location', location])
  if (workType) rows.push(['Work type', workType])
  if (employmentType) rows.push(['Employment type', employmentType])

  return buildMetaTable(title, rows)
}

async function fetchGemJob(
  boardId: string,
  extId: string,
  signal: AbortSignal
): Promise<string | null> {
  const query = `query ExternalJobPostingQuery($boardId: String!, $extId: String!) {
  oatsExternalJobPosting(boardId: $boardId, extId: $extId) {
    id
    title
    descriptionHtml
    compensationHtml
    locations { name city isoCountry isRemote }
    job {
      locationType
      employmentType
      teamDisplayName
      department { name }
    }
  }
}`
  try {
    const apiRes = await fetch('https://jobs.gem.com/api/public/graphql', {
      method: 'POST',
      signal,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': USER_AGENT,
      },
      body: JSON.stringify({ query, variables: { boardId, extId } }),
    })
    if (!apiRes.ok) return null
    const body = (await apiRes.json()) as Record<string, unknown>
    if (Array.isArray(body.errors) && body.errors.length > 0) return null
    const data =
      body.data != null && typeof body.data === 'object'
        ? (body.data as Record<string, unknown>)
        : null
    if (!data) return null
    const postingRaw = data.oatsExternalJobPosting
    if (postingRaw == null || typeof postingRaw !== 'object') return null
    const posting = postingRaw as Record<string, unknown>
    const descriptionHtml =
      typeof posting.descriptionHtml === 'string' ? posting.descriptionHtml.trim() : ''
    if (!descriptionHtml) return null
    const compensationHtml =
      typeof posting.compensationHtml === 'string' ? posting.compensationHtml : ''
    return buildGemMeta(posting) + descriptionHtml + (compensationHtml ?? '')
  } catch {
    return null
  }
}

// Generic fallback: extracts schema.org/JobPosting JSON-LD from any career page.
// Handles sites like Expedia (careers.expediagroup.com) that embed standard markup
// but don't use a recognised ATS API. Runs after all ATS-specific handlers.
const extractGenericJobPostingFromPage = (html: string) =>
  extractJsonLdJobPosting(html, buildGenericJobPostingMeta)

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

  return buildMetaTable(title, rows) + body
}

function buildGoogleCareersMetaFallback(html: string, urlJobId: string): string | null {
  let title: string | null = null

  const titleTagMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  if (titleTagMatch) {
    const stripped = titleTagMatch[1].replace(/\s*—\s*google careers\s*$/i, '').trim()
    if (stripped) title = stripped
  }

  if (!title) {
    const ogMatch =
      html.match(/<meta\s[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["'][^>]*/i) ||
      html.match(/<meta\s[^>]*content=["']([^"']+)["'][^>]*property=["']og:title["'][^>]*/i)
    if (ogMatch) {
      const stripped = ogMatch[1].replace(/\s*—\s*google careers\s*$/i, '').trim()
      if (stripped) title = stripped
    }
  }

  const descMatch =
    html.match(/<meta\s[^>]*name=["']description["'][^>]*content=["']([^"']*)["'][^>]*/i) ||
    html.match(/<meta\s[^>]*content=["']([^"']*)["'][^>]*name=["']description["'][^>]*/i)
  const description = descMatch ? descMatch[1].trim() : ''
  if (!description) return null

  const rows: Array<[string, string]> = [['Company', 'Google']]
  if (urlJobId) rows.push(['Job ID', urlJobId])

  const header = title ? `<h1>${title}</h1>` : ''
  const tableRows = rows.map(([k, v]) => `<tr><th>${k}</th><td>${v}</td></tr>`).join('')
  return `${header}<table>${tableRows}</table><hr><p>${description}</p>`
}

// joinbytedance.com — ByteDance global careers site. Next.js App Router SSR page.
// Job data is embedded in RSC payload via self.__next_f.push([1, "..."]) script tags.
// No JSON-LD, no __NEXT_DATA__, no public API. The RSC text contains:
//   - Title in meta chunk: ["$","title","N",{"children":"..."}]
//   - Metadata rows (Location, Team, Employment Type, Job Code) in component tree
//   - Main description in a T{hex_len}, RSC text chunk (plain text)
//   - Qualifications in "children":"Minimum Qualifications\n..." component prop
function extractJoinByteDanceFromPage(html: string): string | null {
  const rscPushRegex = /self\.__next_f\.push\(\[1,([\s\S]*?)\]\)<\/script>/g
  let m: RegExpExecArray | null
  const parts: string[] = []
  while ((m = rscPushRegex.exec(html)) !== null) {
    try {
      const v: unknown = JSON.parse(m[1])
      if (typeof v === 'string') parts.push(v)
    } catch {}
  }
  const rsc = parts.join('')
  if (!rsc) return null

  const titleMatch = rsc.match(/\["\$","title","[^"]*",\{"children":"([^"]+)"\}\]/)
  const title = titleMatch ? titleMatch[1] : ''

  const rows: Array<[string, string]> = []
  for (const label of ['Location', 'Team', 'Employment Type', 'Job Code']) {
    const escLabel = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const re = new RegExp(`"children":\\["${escLabel}",":\\"].*?"children":"([^"]+)"`)
    const match = rsc.match(re)
    if (match) rows.push([label, match[1]])
  }

  // RSC T-type text chunk: \n{id}:T{hex_len},{content}
  // The hex_len byte count may include the next chunk's header bytes at the end;
  // strip trailing {id}:T if present (streaming artefact from Next.js RSC serialisation).
  let mainDesc = ''
  const tChunkMatch = rsc.match(/\n\w+:T([0-9a-f]+),/)
  if (tChunkMatch) {
    const hexLen = parseInt(tChunkMatch[1], 16)
    const contentStart = (tChunkMatch.index ?? 0) + tChunkMatch[0].length
    let content = rsc.slice(contentStart, contentStart + hexLen)
    content = content.replace(/[0-9a-f]+:T$/, '').trim()
    mainDesc = content
  }

  // Qualifications section (Minimum + Preferred) stored as a component tree children string
  let qualText = ''
  const qualMatch = rsc.match(/"children":"(Minimum Qualifications[^"]+)"/)
  if (qualMatch) qualText = qualMatch[1]

  if (!title && !mainDesc) return null

  const header = buildMetaTable(title, rows)
  const descParts = [mainDesc, qualText].filter(Boolean).join('\n\n')
  return header + descParts
}

export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser()
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

  const isJoinByteDance =
    parsed.hostname === 'joinbytedance.com' && /^\/search\/\d+$/.test(parsed.pathname)

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    // TikTok USDS careers site — JS-rendered SPA gated by ByteDance Stargate API.
    // Plain server-side fetches return only ~11 bytes of visible text; Stargate requires
    // a client-side CSRF token that cannot be replicated server-side. Headless Chromium
    // executes the SPA JavaScript naturally, allowing Stargate API calls to complete.
    if (parsed.hostname === 'careers.tiktokusds.com') {
      try {
        const { default: chromiumBin } = await import('@sparticuz/chromium')
        const { chromium } = await import('playwright-core')
        const executablePath = await chromiumBin.executablePath()
        const browser = await chromium.launch({
          args: chromiumBin.args,
          executablePath,
          headless: true,
        })
        try {
          const page = await browser.newPage()
          await page.goto(rawUrl, { waitUntil: 'networkidle' })
          const content: string = await page.evaluate(() => {
            const el = document.querySelector('main') ?? document.body
            return el?.innerText ?? ''
          })
          if (content.trim()) {
            return NextResponse.json({ html: content.trim() })
          }
        } finally {
          await browser.close().catch(() => {})
        }
      } catch {
        // launch or navigation failure — fall through to existing pipeline
      }
    }

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
            return NextResponse.json({ html: buildEightfoldMeta(data) + data.job_description.trim() })
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

    // Coupang careers (coupang.jobs) — Greenhouse-backed but Cloudflare blocks server-side
    // HTML fetches (403). Board slug is hardcoded to "coupang"; job ID comes from ?gh_jid=.
    const coupangGhJid =
      (parsed.hostname === 'www.coupang.jobs' || parsed.hostname === 'coupang.jobs')
        ? parsed.searchParams.get('gh_jid')
        : null
    if (coupangGhJid) {
      const ghHtml = await fetchGreenhouseJob('coupang', coupangGhJid, controller.signal)
      if (ghHtml !== null) return NextResponse.json({ html: ghHtml })
      // API unavailable — fall through to HTML scraping
    }

    // Databricks careers — www.databricks.com/company/careers/{dept}/{slug}-{id} is a
    // Greenhouse-backed custom Gatsby site (board "databricks"). The page HTML contains no
    // Greenhouse references so none of the post-fetch handlers match; detect by URL and call
    // the Greenhouse API directly using the numeric job ID at the end of the path segment.
    const databricksMatch =
      parsed.hostname === 'www.databricks.com' &&
      parsed.pathname.match(/^\/company\/careers\/[^/]+\/[A-Za-z0-9_-]+-(\d+)$/)
    if (databricksMatch) {
      const ghHtml = await fetchGreenhouseJob('databricks', databricksMatch[1], controller.signal)
      if (ghHtml !== null) return NextResponse.json({ html: ghHtml })
      // API unavailable — fall through to HTML scraping
    }

    // Ashby ATS — custom career domains (e.g. careers.confluent.io/jobs/job/{uuid}) block
    // server-side fetches with Vercel bot protection. The canonical jobs.ashbyhq.com URL
    // serves identical HTML with JSON-LD and no bot gating. Company slug is the second
    // hostname component (careers.confluent.io → "confluent"); falls through if wrong slug.
    const ashbyCustomMatch =
      parsed.hostname !== 'jobs.ashbyhq.com' &&
      parsed.pathname.match(
        /\/jobs\/job\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\/)?$/i
      )
    if (ashbyCustomMatch) {
      const hostParts = parsed.hostname.split('.')
      if (hostParts.length >= 3) {
        const company = hostParts[hostParts.length - 2]
        const ashbyHtml = await fetchAshbyJobFromCanonical(company, ashbyCustomMatch[1], controller.signal)
        if (ashbyHtml !== null) return NextResponse.json({ html: ashbyHtml })
        // Slug mismatch or page unavailable — fall through to HTML scraping
      }
    }

    // Ashby ATS — direct jobs.ashbyhq.com/{company}/{uuid} URLs
    const ashbyDirectMatch =
      parsed.hostname === 'jobs.ashbyhq.com' &&
      parsed.pathname.match(
        /^\/([A-Za-z0-9_-]+)\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\/)?$/i
      )
    if (ashbyDirectMatch) {
      const ashbyHtml = await fetchAshbyJobFromCanonical(ashbyDirectMatch[1], ashbyDirectMatch[2], controller.signal)
      if (ashbyHtml !== null) return NextResponse.json({ html: ashbyHtml })
      // Page unavailable — fall through to HTML scraping
    }

    const linkedInMatch =
      parsed.hostname === 'www.linkedin.com' &&
      parsed.pathname.match(/^\/jobs\/view\/.*?(\d+)\/?$/)
    if (linkedInMatch) {
      const linkedInHtml = await fetchLinkedInJob(linkedInMatch[1], controller.signal)
      if (linkedInHtml !== null) return NextResponse.json({ html: linkedInHtml })
      // API unavailable — fall through to HTML scraping
    }

    // Gem.com ATS — jobs.gem.com/{boardId}/{extId}. The page is a JS-rendered SPA with no
    // embedded job data; the public GraphQL endpoint at /api/public/graphql is the only
    // server-side data source. extId is base64url and passed verbatim to the API.
    const gemMatch =
      parsed.hostname === 'jobs.gem.com' &&
      parsed.pathname.match(/^\/([A-Za-z0-9_-]+)\/([A-Za-z0-9_=+-]+)$/)
    if (gemMatch) {
      const gemHtml = await fetchGemJob(gemMatch[1], gemMatch[2], controller.signal)
      if (gemHtml !== null) return NextResponse.json({ html: gemHtml })
      // API unavailable — fall through to HTML scraping
    }

    // www.google.com/about/careers/applications/ no longer embeds job data server-side
    // (changed ~June 2026 to async client-side loading). careers.google.com still does.
    const fetchTarget =
      isGoogleCareers && parsed.hostname === 'www.google.com'
        ? `https://careers.google.com/jobs/results/${parsed.pathname.slice('/about/careers/applications/jobs/results/'.length)}`
        : parsed.toString()

    const res = await fetch(fetchTarget, {
      signal: controller.signal,
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      redirect: 'follow',
    })

    if (!res.ok) {
      console.warn('fetch-job-description: non-2xx response', res.status, fetchTarget)
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
      const workdayHtml = extractJsonLdJobPosting(raw, buildWorkdayMeta)
      if (workdayHtml !== null) return NextResponse.json({ html: workdayHtml })
      // No usable JSON-LD — fall through to extractJobContent
    }

    // Uber ATS — JSON-LD JobPosting embedded in page HTML.
    // URL pattern: www.uber.com/global/en/careers/list/{id}/
    if (isUberJob) {
      const uberHtml = extractJsonLdJobPosting(raw, buildUberMeta, decodeHtmlEntities)
      if (uberHtml !== null) return NextResponse.json({ html: uberHtml })
      // No usable JSON-LD — fall through to extractJobContent
    }

    // Google Careers — data embedded in AF_initDataCallback({key: 'ds:0', ...}) in page HTML.
    // No JSON-LD and no public API. careers.google.com embeds the full job data in this callback;
    // www.google.com/about/careers/ no longer does (redirected to careers.google.com above).
    // The callback appears near the end of the ~1MB page — use full text, not the truncated raw.
    if (isGoogleCareers) {
      const googleHtml = extractGoogleCareersFromPage(text)
      if (googleHtml !== null) return NextResponse.json({ html: googleHtml })
      const urlJobIdMatch = parsed.pathname.match(/\/results\/(\d+)/)
      const urlJobId = urlJobIdMatch ? urlJobIdMatch[1] : ''
      const metaHtml = buildGoogleCareersMetaFallback(text, urlJobId)
      if (metaHtml !== null) return NextResponse.json({ html: metaHtml })
      // No usable data — fall through to extractJobContent
    }

    // joinbytedance.com — Next.js App Router SSR site. Job data is in RSC payload
    // (self.__next_f.push script tags), not JSON-LD or __NEXT_DATA__.
    if (isJoinByteDance) {
      const jbdHtml = extractJoinByteDanceFromPage(raw)
      if (jbdHtml !== null) return NextResponse.json({ html: jbdHtml })
      // No usable RSC content — fall through to extractJobContent
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
      const nextDataHtml = extractNextDataGreenhouseJob(raw)
      if (nextDataHtml !== null) return NextResponse.json({ html: nextDataHtml })
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
