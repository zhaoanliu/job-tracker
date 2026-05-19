import { describe, it, expect } from 'vitest'
import { exportToCsv, parseCsv } from '@/lib/csv'
import { Application, CsvHistoryEntry } from '@/lib/types'

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

  it('includes status_history column in header', () => {
    const csv = exportToCsv([makeApp()])
    expect(csv.split('\n')[0]).toContain('status_history')
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

  it('serializes history entries as JSON in status_history column', () => {
    const history: CsvHistoryEntry[] = [
      { status: 'applied', changed_at: '2024-01-01T00:00:00Z' },
      { status: 'interview', changed_at: '2024-01-15T00:00:00Z' },
    ]
    const historyMap = new Map([['id-1', history]])
    const csv = exportToCsv([makeApp()], historyMap)
    // JSON is CSV-quoted: internal double-quotes are doubled
    const escapedJson = JSON.stringify(history).replace(/"/g, '""')
    expect(csv).toContain(`"${escapedJson}"`)
  })

  it('outputs empty status_history for apps not in historyMap', () => {
    const csv = exportToCsv([makeApp()], new Map())
    const dataRow = csv.split('\n')[1]
    expect(dataRow.endsWith(',')).toBe(true)
  })

  it('outputs empty status_history when no historyMap provided', () => {
    const csv = exportToCsv([makeApp()])
    const dataRow = csv.split('\n')[1]
    expect(dataRow.endsWith(',')).toBe(true)
  })
})

// ─── parseCsv ────────────────────────────────────────────────────────────────

describe('parseCsv', () => {
  const HEADER = 'company,role,status,type,priority,location,workmode,date,link,source,referrer,notes,next_step,jd,order'
  const HEADER_WITH_HISTORY = HEADER + ',status_history'

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

  it('parses status_history JSON into _statusHistory when column present', () => {
    const history: CsvHistoryEntry[] = [{ status: 'applied', changed_at: '2024-01-01T00:00:00Z' }]
    const escaped = JSON.stringify(history).replace(/"/g, '""')
    const csv = `${HEADER_WITH_HISTORY}\nAcme,Eng,applied,,,,,,,LinkedIn,,,,,0,"${escaped}"`
    const result = parseCsv(csv)
    expect(result[0]._statusHistory).toEqual(history)
  })

  it('returns _statusHistory as undefined when status_history column is absent (old CSV backward compat)', () => {
    const csv = `${HEADER}\nAcme,Eng,applied,,,,,,,LinkedIn,,,,,0`
    const result = parseCsv(csv)
    expect(result[0]._statusHistory).toBeUndefined()
  })

  it('returns _statusHistory as undefined when status_history field is empty', () => {
    const csv = `${HEADER_WITH_HISTORY}\nAcme,Eng,applied,,,,,,,LinkedIn,,,,,0,`
    const result = parseCsv(csv)
    expect(result[0]._statusHistory).toBeUndefined()
  })

  it('returns _statusHistory as undefined when status_history JSON is malformed', () => {
    const csv = `${HEADER_WITH_HISTORY}\nAcme,Eng,applied,,,,,,,LinkedIn,,,,,0,not-valid-json`
    const result = parseCsv(csv)
    expect(result[0]._statusHistory).toBeUndefined()
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

  it('preserves status_history through export → parse round-trip', () => {
    const history: CsvHistoryEntry[] = [
      { status: 'future', changed_at: '2024-01-01T00:00:00Z' },
      { status: 'applied', changed_at: '2024-01-10T00:00:00Z' },
    ]
    const historyMap = new Map([['id-1', history]])
    const csv = exportToCsv([makeApp()], historyMap)
    const parsed = parseCsv(csv)
    expect(parsed[0]._statusHistory).toEqual(history)
  })

  it('gives undefined _statusHistory when importing old CSV without status_history column', () => {
    const app = makeApp()
    const csv = exportToCsv([app])
    // Strip the last (status_history) column to simulate a pre-history CSV
    const lines = csv.split('\n')
    const oldHeader = lines[0].split(',').slice(0, -1).join(',')
    const oldData = lines[1].split(',').slice(0, -1).join(',')
    const parsed = parseCsv([oldHeader, oldData].join('\n'))
    expect(parsed[0]._statusHistory).toBeUndefined()
  })
})
