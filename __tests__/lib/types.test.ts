import { describe, it, expect } from 'vitest'
import {
  STAGES,
  STAGE_MAP,
  PRIORITY_RANK,
  APPLICATION_TYPES,
  APPLICATION_PRIORITIES,
  APPLICATION_LOCATIONS,
  APPLICATION_WORKMODES,
  APPLICATION_SOURCES,
  type Application,
  type ApplicationFormData,
} from '@/lib/types'

describe('STAGES', () => {
  it('defines all kanban stages in display order', () => {
    expect(STAGES.map(s => s.id)).toEqual([
      'future',
      'watchlist',
      'referred',
      'applied',
      'hr',
      'hm',
      'interview',
      'offer',
      'closed',
    ])
  })

  it('every stage has the styling fields used by the board', () => {
    for (const stage of STAGES) {
      expect(stage.label).toBeTruthy()
      expect(stage.colorClass).toBeTruthy()
      expect(stage.headerClass).toBeTruthy()
      expect(stage.dotClass).toBeTruthy()
    }
  })
})

describe('STAGE_MAP', () => {
  it('indexes every stage by id', () => {
    for (const stage of STAGES) {
      expect(STAGE_MAP[stage.id]).toBe(stage)
    }
  })
})

describe('PRIORITY_RANK', () => {
  it('orders High < Medium < Low for ascending sort', () => {
    expect(PRIORITY_RANK.High).toBeLessThan(PRIORITY_RANK.Medium)
    expect(PRIORITY_RANK.Medium).toBeLessThan(PRIORITY_RANK.Low)
  })
})

describe('enum constant arrays', () => {
  it('APPLICATION_TYPES includes Other as the last entry', () => {
    expect(APPLICATION_TYPES).toContain('Other')
    expect(APPLICATION_TYPES[APPLICATION_TYPES.length - 1]).toBe('Other')
  })

  it('APPLICATION_TYPES contains the renamed Principal Software Engineer (not Principal Engineer)', () => {
    expect(APPLICATION_TYPES).toContain('Principal Software Engineer')
    expect(APPLICATION_TYPES).not.toContain('Principal Engineer')
  })

  it('APPLICATION_TYPES contains all new entries', () => {
    expect(APPLICATION_TYPES).toContain('Program Manager')
    expect(APPLICATION_TYPES).toContain('Product Manager')
    expect(APPLICATION_TYPES).toContain('Operation Manager')
    expect(APPLICATION_TYPES).toContain('Business Manager')
    expect(APPLICATION_TYPES).toContain('Chief of Staff')
    expect(APPLICATION_TYPES).toContain('Staff Software Engineer')
    expect(APPLICATION_TYPES).toContain('Senior Staff Software Engineer')
  })

  it('APPLICATION_PRIORITIES has exactly three levels', () => {
    expect(APPLICATION_PRIORITIES).toEqual(['High', 'Medium', 'Low'])
  })

  it('APPLICATION_LOCATIONS includes Remote', () => {
    expect(APPLICATION_LOCATIONS).toContain('Remote')
  })

  it('APPLICATION_WORKMODES covers on-site, hybrid, and remote', () => {
    expect(APPLICATION_WORKMODES).toEqual(['On-site', 'Hybrid', 'Remote'])
  })

  it('APPLICATION_SOURCES includes LinkedIn and a catch-all', () => {
    expect(APPLICATION_SOURCES).toContain('LinkedIn')
    expect(APPLICATION_SOURCES).toContain('Other')
  })
})

describe('Application shape', () => {
  it('accepts a team string', () => {
    const app: Application = {
      id: 'a1',
      user_id: 'u1',
      company: 'Acme',
      role: 'Engineer',
      team: 'Platform Security',
      status: 'applied',
      type: 'Security Engineer',
      priority: 'High',
      location: 'Remote',
      workmode: 'Remote',
      date: '2026-05-26',
      link: null,
      source: 'LinkedIn',
      referrer: null,
      notes: null,
      next_step: null,
      jd: null,
      order: 0,
      created_at: '2026-05-26T00:00:00Z',
      updated_at: '2026-05-26T00:00:00Z',
    }
    expect(app.team).toBe('Platform Security')
  })

  it('accepts a null team', () => {
    const app: Application = {
      id: 'a2',
      user_id: 'u1',
      company: 'Acme',
      role: null,
      team: null,
      status: 'future',
      type: null,
      priority: 'Medium',
      location: null,
      workmode: 'Hybrid',
      date: null,
      link: null,
      source: 'LinkedIn',
      referrer: null,
      notes: null,
      next_step: null,
      jd: null,
      order: 0,
      created_at: '2026-05-26T00:00:00Z',
      updated_at: '2026-05-26T00:00:00Z',
    }
    expect(app.team).toBeNull()
  })
})

describe('ApplicationFormData', () => {
  it('omits server-managed fields and keeps team', () => {
    const form: ApplicationFormData = {
      company: 'Acme',
      role: null,
      team: 'Infra',
      status: 'future',
      type: null,
      priority: 'Medium',
      location: null,
      workmode: 'Hybrid',
      date: null,
      link: null,
      source: 'LinkedIn',
      referrer: null,
      notes: null,
      next_step: null,
      jd: null,
      order: 0,
    }
    expect(form.team).toBe('Infra')
  })
})
