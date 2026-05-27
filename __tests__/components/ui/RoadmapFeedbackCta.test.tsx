import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { createClient } from '@/lib/supabase/client'
import RoadmapFeedbackCta from '@/app/roadmap/RoadmapFeedbackCta'

vi.mock('next/link', () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>{children}</a>
  ),
}))

const mockCreateClient = createClient as unknown as ReturnType<typeof vi.fn>

function mockSession(session: unknown) {
  mockCreateClient.mockReturnValue({
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session } }),
    },
  })
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) }))
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('RoadmapFeedbackCta', () => {
  it('renders the sign-in link when unauthenticated', async () => {
    mockSession(null)
    render(<RoadmapFeedbackCta />)
    const link = await screen.findByRole('link', { name: /Sign in to submit a request/i })
    expect(link).toHaveAttribute('href', '/login')
  })

  it('renders the Submit a request button when authenticated', async () => {
    mockSession({ user: { id: 'u1' } })
    render(<RoadmapFeedbackCta />)
    expect(await screen.findByRole('button', { name: /Submit a request/i })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Sign in to submit a request/i })).not.toBeInTheDocument()
  })

  it('opens the feature request modal when Submit a request is clicked', async () => {
    mockSession({ user: { id: 'u1' } })
    render(<RoadmapFeedbackCta />)
    const button = await screen.findByRole('button', { name: /Submit a request/i })
    expect(screen.queryByText('Request a feature')).not.toBeInTheDocument()
    await userEvent.click(button)
    expect(screen.getByText('Request a feature')).toBeInTheDocument()
  })

  it('closes the modal when Cancel is clicked and stays on the page', async () => {
    mockSession({ user: { id: 'u1' } })
    render(<RoadmapFeedbackCta />)
    const button = await screen.findByRole('button', { name: /Submit a request/i })
    await userEvent.click(button)
    expect(screen.getByText('Request a feature')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Cancel/i }))
    await waitFor(() => expect(screen.queryByText('Request a feature')).not.toBeInTheDocument())
    expect(screen.getByRole('button', { name: /Submit a request/i })).toBeInTheDocument()
  })
})
