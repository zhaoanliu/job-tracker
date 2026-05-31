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
  team: null,
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
}

describe('KanbanCard selection', () => {
  it('does not render a checkbox when onToggleSelect is not provided', () => {
    render(<KanbanCard application={baseApp} onClick={vi.fn()} />)
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  })

  it('renders an unchecked checkbox when onToggleSelect is provided and selected is false', () => {
    render(
      <KanbanCard
        application={baseApp}
        onClick={vi.fn()}
        selected={false}
        onToggleSelect={vi.fn()}
      />
    )
    const checkbox = screen.getByRole('checkbox') as HTMLInputElement
    expect(checkbox).toBeInTheDocument()
    expect(checkbox.checked).toBe(false)
  })

  it('renders a checked checkbox when selected is true', () => {
    render(
      <KanbanCard
        application={baseApp}
        onClick={vi.fn()}
        selected
        onToggleSelect={vi.fn()}
      />
    )
    const checkbox = screen.getByRole('checkbox') as HTMLInputElement
    expect(checkbox.checked).toBe(true)
  })

  it('uses an accessible aria-label that includes the company name', () => {
    render(
      <KanbanCard
        application={baseApp}
        onClick={vi.fn()}
        onToggleSelect={vi.fn()}
      />
    )
    expect(
      screen.getByLabelText('Select Acme Corp application')
    ).toBeInTheDocument()
  })

  it('calls onToggleSelect with the application id when toggled', async () => {
    const onToggleSelect = vi.fn()
    render(
      <KanbanCard
        application={baseApp}
        onClick={vi.fn()}
        onToggleSelect={onToggleSelect}
      />
    )
    await userEvent.click(screen.getByRole('checkbox'))
    expect(onToggleSelect).toHaveBeenCalledWith('card-1')
  })

  it('does not call onClick when the checkbox is clicked', async () => {
    const onClick = vi.fn()
    const onToggleSelect = vi.fn()
    render(
      <KanbanCard
        application={baseApp}
        onClick={onClick}
        onToggleSelect={onToggleSelect}
      />
    )
    await userEvent.click(screen.getByRole('checkbox'))
    expect(onToggleSelect).toHaveBeenCalledTimes(1)
    expect(onClick).not.toHaveBeenCalled()
  })

  it('still calls onClick when the card body is clicked', async () => {
    const onClick = vi.fn()
    render(
      <KanbanCard
        application={baseApp}
        onClick={onClick}
        onToggleSelect={vi.fn()}
      />
    )
    await userEvent.click(screen.getByText('Acme Corp'))
    expect(onClick).toHaveBeenCalledWith(baseApp)
  })

  it('applies the selected visual ring when selected is true', () => {
    const { container } = render(
      <KanbanCard
        application={baseApp}
        onClick={vi.fn()}
        selected
        onToggleSelect={vi.fn()}
      />
    )
    expect(container.firstChild).toHaveClass('ring-2')
    expect(container.firstChild).toHaveClass('ring-indigo-500')
  })

  it('does not apply the selected ring when selected is false', () => {
    const { container } = render(
      <KanbanCard
        application={baseApp}
        onClick={vi.fn()}
        selected={false}
        onToggleSelect={vi.fn()}
      />
    )
    expect(container.firstChild).not.toHaveClass('ring-2')
  })
})
