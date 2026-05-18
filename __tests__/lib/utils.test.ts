import { describe, it, expect } from 'vitest'
import {
  filterApplications,
  sortApplications,
  computeStats,
  formatDate,
  hasActiveFilters,
  priorityColor,
  getStageApplications,
} from '@/lib/utils'
import { Application, Filters } from '@/lib/types'

function makeApp(overrides: Partial<Application> = {}): Application {
  return {
    id: 'test-id',
    user_id: 'user-1',
    company: 'Acme',
    role: 'Engineer',
    status: 'future',
    type: 'Principal Engineer',
    priority: 'Medium',
    location: 'Remote',
    workmode: 'Remote',
    date: '2026-05-01',
    link: null,
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

const emptyFilters: Filters = { priority: [], type: [], workmode: [], location: [] }

// ─── filterApplications ───────────────────────────────────────────────────────

describe('filterApplications', () => {
  const apps = [
    makeApp({ id: '1', priority: 'High', type: 'Principal Engineer', workmode: 'Remote', location: 'Remote' }),
    makeApp({ id: '2', priority: 'Medium', type: 'Security Engineer', workmode: 'Hybrid', location: 'Seattle WA' }),
    makeApp({ id: '3', priority: 'Low', type: null, workmode: 'On-site', location: 'Bellevue WA' }),
  ]

  it('returns all apps when no filters active', () => {
    expect(filterApplications(apps, emptyFilters)).toHaveLength(3)
  })

  it('filters by priority', () => {
    const result = filterApplications(apps, { ...emptyFilters, priority: ['High'] })
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('1')
  })

  it('filters by multiple priorities (OR within dimension)', () => {
    const result = filterApplications(apps, { ...emptyFilters, priority: ['High', 'Low'] })
    expect(result).toHaveLength(2)
  })

  it('filters by type', () => {
    const result = filterApplications(apps, { ...emptyFilters, type: ['Security Engineer'] })
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('2')
  })

  it('excludes apps with null type when type filter is active', () => {
    const result = filterApplications(apps, { ...emptyFilters, type: ['Principal Engineer'] })
    expect(result.every(a => a.type !== null)).toBe(true)
  })

  it('filters by workmode', () => {
    const result = filterApplications(apps, { ...emptyFilters, workmode: ['Hybrid'] })
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('2')
  })

  it('filters by location', () => {
    const result = filterApplications(apps, { ...emptyFilters, location: ['Remote'] })
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('1')
  })

  it('applies multiple filter dimensions as AND', () => {
    const result = filterApplications(apps, {
      priority: ['High'],
      type: ['Principal Engineer'],
      workmode: ['Remote'],
      location: ['Remote'],
    })
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('1')
  })

  it('returns empty array when no apps match', () => {
    const result = filterApplications(apps, { ...emptyFilters, priority: ['High'], type: ['Security Architect'] })
    expect(result).toHaveLength(0)
  })
})

// ─── sortApplications ────────────────────────────────────────────────────────

describe('sortApplications', () => {
  const apps = [
    makeApp({ id: 'a', order: 2, date: '2026-04-01', company: 'Zeta', priority: 'Low' }),
    makeApp({ id: 'b', order: 0, date: '2026-05-15', company: 'Alpha', priority: 'High' }),
    makeApp({ id: 'c', order: 1, date: null,          company: 'Beta',  priority: 'Medium' }),
  ]

  it('sorts by order ascending', () => {
    const result = sortApplications(apps, 'order')
    expect(result.map(a => a.id)).toEqual(['b', 'c', 'a'])
  })

  it('sorts by date descending (newest first)', () => {
    const result = sortApplications(apps, 'date')
    expect(result[0].id).toBe('b')   // most recent
    expect(result[result.length - 1].id).toBe('c')  // null date goes last
  })

  it('sorts by company alphabetically', () => {
    const result = sortApplications(apps, 'company')
    expect(result.map(a => a.company)).toEqual(['Alpha', 'Beta', 'Zeta'])
  })

  it('sorts by priority High → Medium → Low', () => {
    const result = sortApplications(apps, 'priority')
    expect(result.map(a => a.priority)).toEqual(['High', 'Medium', 'Low'])
  })

  it('does not mutate the original array', () => {
    const original = [...apps]
    sortApplications(apps, 'company')
    expect(apps.map(a => a.id)).toEqual(original.map(a => a.id))
  })

  it('does not throw when sorting by company with null/undefined values', () => {
    const appsWithNullCompany = [
      makeApp({ id: 'x', company: null as unknown as string }),
      makeApp({ id: 'y', company: 'Alpha' }),
      makeApp({ id: 'z', company: undefined as unknown as string }),
    ]
    expect(() => sortApplications(appsWithNullCompany, 'company')).not.toThrow()
  })
})

// ─── computeStats ────────────────────────────────────────────────────────────

describe('computeStats', () => {
  const apps = [
    makeApp({ status: 'future' }),
    makeApp({ status: 'watchlist' }),
    makeApp({ status: 'referred' }),
    makeApp({ status: 'applied' }),
    makeApp({ status: 'hr' }),
    makeApp({ status: 'hm' }),
    makeApp({ status: 'interview' }),
    makeApp({ status: 'offer' }),
    makeApp({ status: 'closed' }),
  ]

  it('counts total correctly', () => {
    expect(computeStats(apps).total).toBe(9)
  })

  it('counts active (excludes future, watchlist, closed)', () => {
    // referred, applied, hr, hm, interview, offer = 6
    expect(computeStats(apps).active).toBe(6)
  })

  it('counts interviewing (hr + hm + interview)', () => {
    expect(computeStats(apps).interviewing).toBe(3)
  })

  it('counts offers', () => {
    expect(computeStats(apps).offers).toBe(1)
  })

  it('returns zeros for empty array', () => {
    expect(computeStats([])).toEqual({ total: 0, active: 0, interviewing: 0, offers: 0 })
  })
})

// ─── formatDate ──────────────────────────────────────────────────────────────

describe('formatDate', () => {
  it('formats ISO date string to MM/DD/YY', () => {
    expect(formatDate('2026-05-17')).toBe('05/17/26')
  })

  it('returns empty string for null', () => {
    expect(formatDate(null)).toBe('')
  })

  it('handles year-end dates', () => {
    expect(formatDate('2025-12-31')).toBe('12/31/25')
  })
})

// ─── hasActiveFilters ────────────────────────────────────────────────────────

describe('hasActiveFilters', () => {
  it('returns false when all arrays are empty', () => {
    expect(hasActiveFilters(emptyFilters)).toBe(false)
  })

  it('returns true when any dimension has a value', () => {
    expect(hasActiveFilters({ ...emptyFilters, priority: ['High'] })).toBe(true)
    expect(hasActiveFilters({ ...emptyFilters, type: ['Other'] })).toBe(true)
    expect(hasActiveFilters({ ...emptyFilters, workmode: ['Remote'] })).toBe(true)
    expect(hasActiveFilters({ ...emptyFilters, location: ['Remote'] })).toBe(true)
  })
})

// ─── priorityColor ───────────────────────────────────────────────────────────

describe('priorityColor', () => {
  it('returns red classes for High', () => {
    expect(priorityColor('High')).toContain('red')
  })

  it('returns yellow classes for Medium', () => {
    expect(priorityColor('Medium')).toContain('yellow')
  })

  it('returns green classes for Low', () => {
    expect(priorityColor('Low')).toContain('green')
  })
})

// ─── getStageApplications ────────────────────────────────────────────────────

describe('getStageApplications', () => {
  const apps = [
    makeApp({ id: '1', status: 'applied', priority: 'High', order: 1 }),
    makeApp({ id: '2', status: 'applied', priority: 'Low',  order: 0 }),
    makeApp({ id: '3', status: 'future',  priority: 'High', order: 0 }),
  ]

  it('returns only apps for the given stage', () => {
    const result = getStageApplications(apps, 'applied', emptyFilters, 'order')
    expect(result.every(a => a.status === 'applied')).toBe(true)
    expect(result).toHaveLength(2)
  })

  it('applies filters within the stage', () => {
    const result = getStageApplications(
      apps, 'applied', { ...emptyFilters, priority: ['High'] }, 'order'
    )
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('1')
  })

  it('sorts within the stage', () => {
    const result = getStageApplications(apps, 'applied', emptyFilters, 'order')
    expect(result.map(a => a.id)).toEqual(['2', '1'])
  })
})
