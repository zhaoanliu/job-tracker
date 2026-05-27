import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import AdminFeedbackButton from '@/components/admin/AdminFeedbackButton'

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) }))
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('AdminFeedbackButton', () => {
  it('renders the Submit Feedback button with no modal visible initially', () => {
    render(<AdminFeedbackButton />)
    expect(screen.getByRole('button', { name: /Submit Feedback/i })).toBeInTheDocument()
    expect(screen.queryByText('Request a feature')).not.toBeInTheDocument()
  })

  it('opens the modal when the Submit Feedback button is clicked', async () => {
    render(<AdminFeedbackButton />)
    await userEvent.click(screen.getByRole('button', { name: /Submit Feedback/i }))
    expect(screen.getByText('Request a feature')).toBeInTheDocument()
  })

  it('returns to button-only state after the modal is closed', async () => {
    render(<AdminFeedbackButton />)
    await userEvent.click(screen.getByRole('button', { name: /Submit Feedback/i }))
    expect(screen.getByText('Request a feature')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /Cancel/i }))
    await waitFor(() => expect(screen.queryByText('Request a feature')).not.toBeInTheDocument())
    expect(screen.getByRole('button', { name: /Submit Feedback/i })).toBeInTheDocument()
  })
})
