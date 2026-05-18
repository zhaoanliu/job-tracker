import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import KanbanCard from '@/components/board/KanbanCard'
import { Application } from '@/lib/types'

const baseApp: Application = {
  id: 'card-1',
  user_id: 'user-1',
  company: 'Acme Corp',
  role: 'Principal Engineer',
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
  next_step: 'Schedule follow-up',
  jd: null,
  order: 0,
  created_at: '2026-05-01T00:00:00Z',
  updated_at: '2026-05-01T00:00:00Z',
}

describe('KanbanCard', () => {
  it('renders the company name', () => {
    render(<KanbanCard application={baseApp} onClick={vi.fn()} />)
    expect(screen.getByText('Acme Corp')).toBeInTheDocument()
  })

  it('renders the role', () => {
    render(<KanbanCard application={baseApp} onClick={vi.fn()} />)
    // role appears as a <p> element; type may also render the same text as a badge
    const matches = screen.getAllByText('Principal Engineer')
    expect(matches.length).toBeGreaterThanOrEqual(1)
  })

  it('renders the priority badge', () => {
    render(<KanbanCard application={baseApp} onClick={vi.fn()} />)
    expect(screen.getByText('High')).toBeInTheDocument()
  })

  it('renders next_step when present', () => {
    render(<KanbanCard application={baseApp} onClick={vi.fn()} />)
    expect(screen.getByText('Schedule follow-up')).toBeInTheDocument()
  })

  it('does not render next_step section when null', () => {
    render(<KanbanCard application={{ ...baseApp, next_step: null }} onClick={vi.fn()} />)
    expect(screen.queryByText('Next:')).not.toBeInTheDocument()
  })

  it('does not render role when null', () => {
    render(<KanbanCard application={{ ...baseApp, role: null, type: null }} onClick={vi.fn()} />)
    expect(screen.queryByText('Principal Engineer')).not.toBeInTheDocument()
  })

  it('calls onClick when the card is clicked', async () => {
    const onClick = vi.fn()
    render(<KanbanCard application={baseApp} onClick={onClick} />)
    await userEvent.click(screen.getByText('Acme Corp'))
    expect(onClick).toHaveBeenCalledWith(baseApp)
  })

  it('applies drag-overlay styling when isDragOverlay is true', () => {
    const { container } = render(
      <KanbanCard application={baseApp} onClick={vi.fn()} isDragOverlay />
    )
    expect(container.firstChild).toHaveClass('rotate-1')
  })
})
