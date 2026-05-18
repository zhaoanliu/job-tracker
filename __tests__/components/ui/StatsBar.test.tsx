import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import StatsBar from '@/components/ui/StatsBar'
import { Application } from '@/lib/types'

function makeApp(status: Application['status']): Application {
  return {
    id: Math.random().toString(),
    user_id: 'u1',
    company: 'Co',
    role: null,
    status,
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
    created_at: '',
    updated_at: '',
  }
}

describe('StatsBar', () => {
  it('shows correct total count', () => {
    const apps = [makeApp('future'), makeApp('applied'), makeApp('closed')]
    render(<StatsBar applications={apps} />)
    expect(screen.getByText('3')).toBeInTheDocument()
  })

  it('shows 0s for an empty board', () => {
    render(<StatsBar applications={[]} />)
    const zeros = screen.getAllByText('0')
    expect(zeros.length).toBeGreaterThanOrEqual(4)
  })

  it('counts active apps (excludes future, watchlist, closed)', () => {
    const apps = [
      makeApp('future'),
      makeApp('watchlist'),
      makeApp('applied'),   // active
      makeApp('interview'), // active
      makeApp('closed'),
    ]
    render(<StatsBar applications={apps} />)
    // Active stat label
    expect(screen.getByText('Active')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
  })

  it('counts interviewing stages (hr, hm, interview)', () => {
    const apps = [makeApp('hr'), makeApp('hm'), makeApp('interview'), makeApp('applied')]
    render(<StatsBar applications={apps} />)
    expect(screen.getByText('Interviewing')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
  })

  it('counts offers', () => {
    const apps = [makeApp('offer'), makeApp('offer'), makeApp('applied')]
    render(<StatsBar applications={apps} />)
    expect(screen.getByText('Offers')).toBeInTheDocument()
  })
})
