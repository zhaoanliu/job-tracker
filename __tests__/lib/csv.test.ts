import { describe, it, expect } from 'vitest'
import { exportToCsv, parseCsv } from '@/lib/csv'
import { Application } from '@/lib/types'

function makeApp(overrides: Partial<Application> = {}): Application {
  return {
    id: 'id-1',
    user_id: 'user-1',
    company: 'Acme',
    role: 'Engineer',
    status: 'applied',
    type: 'Principal Engineer',
    priority: 'High',
    location: 'Seattle WA',
    workmode: 'Hybrid',
    date: '2026-05-01',
    link: 'https://example.com',
    source: 'LinkedIn',
    referrer: null,
    notes: null,
    next_step: null,
    jd: null,
    order: 0,
    created_at: '2026-05-01T00:00:00Z',
    updated_at: '2026-05-01T00:00:00Z',
    ...overrides,
  }
}

// ─── exportToCsv ─────────────────────────────────────────────────────────────

describe('exportToCsv', () => {
  it('produces a header row as the first line', () => {
    const csv = exportToCsv([makeApp()])
    const header = csv.split('\n')[0]
    expect(header).toContain('company')
    expect(header).toContain('role')
    expect(header).toContain('status')
    expect(header).toContain('priority')
  })

  it('includes one data row per application', () => {
    const csv = exportToCsv([makeApp(), makeApp({ company: 'Beta Corp' })])
    const lines = csv.trim().split('\n')
    expect(lines).toHaveLength(3) // header + 2 data rows
  })

  it('quotes values that contain commas', () => {
    const csv = exportToCsv([makeApp({ company: 'Acme, Inc.' })])
    expect(csv).toContain('"Acme, Inc."')
  })

  it('quotes values that contain newlines', () => {
    const csv = exportToCsv([makeApp({ notes: 'Line one\nLine two' })])
    expect(csv).toContain('"Line one\nLine two"')
  })

  it('doubles up internal double-quotes', () => {
    const csv = exportToCsv([makeApp({ notes: 'She said "hello"' })])
    expect(csv).toContain('""hello""')
  })

  it('outputs empty string for null fields', () => {
    const csv = exportToCsv([makeApp({ referrer: null })])
    // referrer column should be empty, not "null"
    expect(csv).not.toContain('null')
  })

  it('returns only the header row for an empty array', () => {
    const csv = exportToCsv([])
    const lines = csv.trim().split('\n')
    expect(lines).toHaveLength(1)
  })
})

// ─── parseCsv ────────────────────────────────────────────────────────────────

describe('parseCsv', () => {
  const HEADER = 'company,role,status,type,priority,location,workmode,date,link,source,referrer,notes,next_step,jd,order'

  it('parses a standard row correctly', () => {
    const csv = `${HEADER}\nAcme,Engineer,applied,Principal Engineer,High,Seattle WA,Hybrid,2026-05-01,https://example.com,LinkedIn,,,,,0`
    const result = parseCsv(csv)
    expect(result).toHaveLength(1)
    expect(result[0].company).toBe('Acme')
    expect(result[0].status).toBe('applied')
    expect(result[0].priority).toBe('High')
  })

  it('parses multiple rows', () => {
    const csv = `${HEADER}\nAcme,Eng,applied,,,,,,,LinkedIn,,,,,0\nBeta,PM,future,,,,,,,LinkedIn,,,,,1`
    expect(parseCsv(csv)).toHaveLength(2)
  })

  it('handles quoted values containing commas', () => {
    const csv = `${HEADER}\n"Acme, Inc.",Engineer,applied,,,,,,,LinkedIn,,,,,0`
    const result = parseCsv(csv)
    expect(result[0].company).toBe('Acme, Inc.')
  })

  it('handles quoted values containing newlines', () => {
    // notes is header position 11; one empty field for referrer (10) before it
    const csv = `${HEADER}\nAcme,Eng,applied,,,,,,,LinkedIn,,"Line 1\nLine 2",,,0`
    const result = parseCsv(csv)
    expect(result[0].notes).toBe('Line 1\nLine 2')
  })

  it('handles escaped double-quotes inside quoted fields', () => {
    // notes is header position 11; one empty field for referrer (10) before it
    const csv = `${HEADER}\nAcme,Eng,applied,,,,,,,LinkedIn,,"She said ""hello""",,,0`
    const result = parseCsv(csv)
    expect(result[0].notes).toBe('She said "hello"')
  })

  it('converts order to integer', () => {
    const csv = `${HEADER}\nAcme,Eng,applied,,,,,,,LinkedIn,,,,,3`
    expect(parseCsv(csv)[0].order).toBe(3)
  })

  it('defaults missing optional fields to null', () => {
    const csv = `${HEADER}\nAcme,,applied,,,,,,,LinkedIn,,,,,0`
    const result = parseCsv(csv)
    expect(result[0].role).toBeNull()
    expect(result[0].referrer).toBeNull()
  })

  it('returns empty array for header-only input', () => {
    expect(parseCsv(HEADER)).toHaveLength(0)
  })

  it('ignores blank lines', () => {
    const csv = `${HEADER}\nAcme,Eng,applied,,,,,,,LinkedIn,,,,,0\n\n`
    expect(parseCsv(csv)).toHaveLength(1)
  })

  it('skips rows missing a company', () => {
    const csv = `${HEADER}\n,Eng,applied,,,,,,,LinkedIn,,,,,0`
    expect(parseCsv(csv)).toHaveLength(0)
  })
})

// ─── Round-trip ───────────────────────────────────────────────────────────────

describe('CSV round-trip', () => {
  it('export → parse preserves all scalar fields', () => {
    const original = makeApp({
      company: 'Round-trip Corp',
      role: 'Principal Engineer',
      status: 'interview',
      priority: 'High',
      location: 'Seattle WA',
      workmode: 'Hybrid',
      date: '2026-06-01',
      source: 'LinkedIn',
      order: 5,
    })

    const csv = exportToCsv([original])
    const parsed = parseCsv(csv)

    expect(parsed[0].company).toBe(original.company)
    expect(parsed[0].role).toBe(original.role)
    expect(parsed[0].status).toBe(original.status)
    expect(parsed[0].priority).toBe(original.priority)
    expect(parsed[0].location).toBe(original.location)
    expect(parsed[0].workmode).toBe(original.workmode)
    expect(parsed[0].date).toBe(original.date)
    expect(parsed[0].order).toBe(original.order)
  })

  it('preserves values with special characters through round-trip', () => {
    const original = makeApp({
      company: 'Acme, Inc.',
      notes: 'Recruiter said "great fit"\nFollow up Friday',
    })

    const csv = exportToCsv([original])
    const parsed = parseCsv(csv)

    expect(parsed[0].company).toBe('Acme, Inc.')
    expect(parsed[0].notes).toBe('Recruiter said "great fit"\nFollow up Friday')
  })
})
