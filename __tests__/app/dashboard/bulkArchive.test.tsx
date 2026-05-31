import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import KanbanBoard from '@/components/board/KanbanBoard'
import { Application } from '@/lib/types'

vi.mock('@/lib/trackEvent', () => ({ trackEvent: vi.fn() }))

function makeApp(overrides: Partial<Application> & { id: string; company: string }): Application {
  return {
    id: overrides.id,
    user_id: 'test-uid',
    company: overrides.company,
    role: 'Engineer',
    team: null,
    status: 'applied',
    type: 'Principal Engineer',
    priority: 'Medium',
    location: 'Seattle WA',
    workmode: 'Hybrid',
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

const apps: Application[] = [
  makeApp({ id: 'a-1', company: 'Acme', order: 0 }),
  makeApp({ id: 'a-2', company: 'Banana', order: 1 }),
  makeApp({ id: 'a-3', company: 'Cherry', order: 2 }),
]

describe('Dashboard bulk archive wiring', () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ updated: 2 }),
    }) as unknown as typeof fetch
  })

  afterEach(() => {
    global.fetch = originalFetch
    vi.restoreAllMocks()
  })

  it('does not render the selection toolbar when nothing is selected', () => {
    render(<KanbanBoard initialApplications={apps} userEmail="t@example.com" />)
    expect(screen.queryByRole('toolbar', { name: 'Bulk selection actions' })).not.toBeInTheDocument()
  })

  it('shows the toolbar with the count when one card is selected', async () => {
    const user = userEvent.setup()
    render(<KanbanBoard initialApplications={apps} userEmail="t@example.com" />)

    await user.click(screen.getByLabelText('Select Acme application'))

    expect(screen.getByRole('toolbar', { name: 'Bulk selection actions' })).toBeInTheDocument()
    expect(screen.getByText('1 selected')).toBeInTheDocument()
  })

  it('updates count as multiple cards are selected and unselected', async () => {
    const user = userEvent.setup()
    render(<KanbanBoard initialApplications={apps} userEmail="t@example.com" />)

    await user.click(screen.getByLabelText('Select Acme application'))
    await user.click(screen.getByLabelText('Select Banana application'))
    expect(screen.getByText('2 selected')).toBeInTheDocument()

    await user.click(screen.getByLabelText('Select Acme application'))
    expect(screen.getByText('1 selected')).toBeInTheDocument()
  })

  it('archives selected cards: optimistic removal, POSTs to /api/applications/bulk, clears selection on success', async () => {
    const user = userEvent.setup()
    render(<KanbanBoard initialApplications={apps} userEmail="t@example.com" />)

    await user.click(screen.getByLabelText('Select Acme application'))
    await user.click(screen.getByLabelText('Select Banana application'))

    await user.click(screen.getByRole('button', { name: 'Archive selected applications' }))

    await waitFor(() => {
      expect(screen.queryByText('Acme')).not.toBeInTheDocument()
      expect(screen.queryByText('Banana')).not.toBeInTheDocument()
    })
    expect(screen.getByText('Cherry')).toBeInTheDocument()

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/applications/bulk',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
      })
    )
    const [, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    const body = JSON.parse(init.body as string)
    expect(body.action).toBe('archive')
    expect(new Set(body.ids)).toEqual(new Set(['a-1', 'a-2']))

    await waitFor(() => {
      expect(screen.queryByRole('toolbar', { name: 'Bulk selection actions' })).not.toBeInTheDocument()
    })
  })

  it('reverts local state and calls console.error when the API responds with an error status', async () => {
    const user = userEvent.setup()
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: 'Failed' }),
    }) as unknown as typeof fetch
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    render(<KanbanBoard initialApplications={apps} userEmail="t@example.com" />)

    await user.click(screen.getByLabelText('Select Acme application'))
    await user.click(screen.getByRole('button', { name: 'Archive selected applications' }))

    await waitFor(() => {
      expect(errSpy).toHaveBeenCalled()
    })
    expect(screen.getByText('Acme')).toBeInTheDocument()
    expect(screen.getByRole('toolbar', { name: 'Bulk selection actions' })).toBeInTheDocument()
  })

  it('reverts local state and calls console.error when fetch itself rejects', async () => {
    const user = userEvent.setup()
    global.fetch = vi.fn().mockRejectedValue(new Error('network down')) as unknown as typeof fetch
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    render(<KanbanBoard initialApplications={apps} userEmail="t@example.com" />)

    await user.click(screen.getByLabelText('Select Acme application'))
    await user.click(screen.getByRole('button', { name: 'Archive selected applications' }))

    await waitFor(() => {
      expect(errSpy).toHaveBeenCalled()
    })
    expect(screen.getByText('Acme')).toBeInTheDocument()
  })

  it('clears the selection when the Clear button is clicked', async () => {
    const user = userEvent.setup()
    render(<KanbanBoard initialApplications={apps} userEmail="t@example.com" />)

    await user.click(screen.getByLabelText('Select Acme application'))
    expect(screen.getByRole('toolbar', { name: 'Bulk selection actions' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Clear selection' }))
    expect(screen.queryByRole('toolbar', { name: 'Bulk selection actions' })).not.toBeInTheDocument()
  })
})
