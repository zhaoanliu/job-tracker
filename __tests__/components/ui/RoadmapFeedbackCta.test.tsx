import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('next/link', () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>{children}</a>
  ),
}))

import { createClient } from '@/lib/supabase/client'
import RoadmapFeedbackCta from '@/app/roadmap/RoadmapFeedbackCta'

type GetSessionResult = { data: { session: { user: { id: string } } | null } }

function mockSupabaseSession(result: GetSessionResult) {
  vi.mocked(createClient).mockReturnValue({
    auth: {
      getSession: vi.fn().mockResolvedValue(result),
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any)
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) }))
})

afterEach(() => vi.unstubAllGlobals())

describe('RoadmapFeedbackCta', () => {
  it('renders the loading placeholder on initial mount', () => {
    mockSupabaseSession({ data: { session: null } })
    render(<RoadmapFeedbackCta />)
    expect(screen.getByTestId('roadmap-cta-placeholder')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Sign in to submit a request/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Submit a request/i })).not.toBeInTheDocument()
  })

  it('shows a sign-in link to /login when getSession returns no session', async () => {
    mockSupabaseSession({ data: { session: null } })
    render(<RoadmapFeedbackCta />)
    const link = await screen.findByRole('link', { name: /Sign in to submit a request/i })
    expect(link).toHaveAttribute('href', '/login')
  })

  it('shows a Submit a request button when getSession returns a session', async () => {
    mockSupabaseSession({ data: { session: { user: { id: 'u1' } } } })
    render(<RoadmapFeedbackCta />)
    expect(await screen.findByRole('button', { name: /Submit a request/i })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Sign in to submit a request/i })).not.toBeInTheDocument()
  })

  it('does not show the sign-in link when authed', async () => {
    mockSupabaseSession({ data: { session: { user: { id: 'u1' } } } })
    render(<RoadmapFeedbackCta />)
    await screen.findByRole('button', { name: /Submit a request/i })
    expect(screen.queryByText(/Sign in to submit a request/i)).not.toBeInTheDocument()
  })

  it('opens the feature request modal when Submit a request is clicked', async () => {
    mockSupabaseSession({ data: { session: { user: { id: 'u1' } } } })
    render(<RoadmapFeedbackCta />)
    const button = await screen.findByRole('button', { name: /Submit a request/i })
    expect(screen.queryByText('Request a feature')).not.toBeInTheDocument()
    await userEvent.click(button)
    expect(screen.getByText('Request a feature')).toBeInTheDocument()
  })

  it('closes the modal and returns to the button without navigating away', async () => {
    mockSupabaseSession({ data: { session: { user: { id: 'u1' } } } })
    render(<RoadmapFeedbackCta />)
    const button = await screen.findByRole('button', { name: /Submit a request/i })
    await userEvent.click(button)
    expect(screen.getByText('Request a feature')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Cancel/i }))
    await waitFor(() => {
      expect(screen.queryByText('Request a feature')).not.toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: /Submit a request/i })).toBeInTheDocument()
  })
})
