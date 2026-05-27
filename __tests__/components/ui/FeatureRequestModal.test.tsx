import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import FeatureRequestModal from '@/components/ui/FeatureRequestModal'

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) }))
})
afterEach(() => vi.unstubAllGlobals())

describe('FeatureRequestModal', () => {
  it('renders nothing when open is false', () => {
    render(<FeatureRequestModal open={false} onClose={() => {}} />)
    expect(screen.queryByText('Request a feature')).not.toBeInTheDocument()
  })

  it('renders the modal when open is true', () => {
    render(<FeatureRequestModal open={true} onClose={() => {}} />)
    expect(screen.getByText('Request a feature')).toBeInTheDocument()
    expect(screen.getByLabelText(/Title/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Description/i)).toBeInTheDocument()
  })

  it('Submit button is disabled when title is empty', () => {
    render(<FeatureRequestModal open={true} onClose={() => {}} />)
    expect(screen.getByRole('button', { name: /Submit/i })).toBeDisabled()
  })

  it('calls /api/feature-request with title and description on submit', async () => {
    render(<FeatureRequestModal open={true} onClose={() => {}} />)
    await userEvent.type(screen.getByLabelText(/Title/i), 'Dark mode')
    await userEvent.type(screen.getByLabelText(/Description/i), 'Please add it')
    await userEvent.click(screen.getByRole('button', { name: /Submit/i }))
    expect(fetch).toHaveBeenCalledWith(
      '/api/feature-request',
      expect.objectContaining({ method: 'POST' })
    )
    const body = JSON.parse((fetch as any).mock.calls[0][1].body)
    expect(body.title).toBe('Dark mode')
    expect(body.description).toBe('Please add it')
  })

  it('shows success state after successful submission', async () => {
    render(<FeatureRequestModal open={true} onClose={() => {}} />)
    await userEvent.type(screen.getByLabelText(/Title/i), 'Dark mode')
    await userEvent.click(screen.getByRole('button', { name: /Submit/i }))
    expect(await screen.findByText(/Request submitted/i)).toBeInTheDocument()
  })

  it('shows error state when submission returns non-ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }))
    render(<FeatureRequestModal open={true} onClose={() => {}} />)
    await userEvent.type(screen.getByLabelText(/Title/i), 'Dark mode')
    await userEvent.click(screen.getByRole('button', { name: /Submit/i }))
    expect(await screen.findByText(/Something went wrong/i)).toBeInTheDocument()
  })

  it('calls onClose when Cancel is clicked', async () => {
    const onClose = vi.fn()
    render(<FeatureRequestModal open={true} onClose={onClose} />)
    await userEvent.click(screen.getByRole('button', { name: /Cancel/i }))
    expect(onClose).toHaveBeenCalled()
  })

  it('calls onClose when the backdrop is clicked', async () => {
    const onClose = vi.fn()
    render(<FeatureRequestModal open={true} onClose={onClose} />)
    const backdrop = document.querySelector('.fixed.inset-0') as HTMLElement
    await userEvent.click(backdrop)
    expect(onClose).toHaveBeenCalled()
  })

  it('calls onClose when Close is clicked after success', async () => {
    const onClose = vi.fn()
    render(<FeatureRequestModal open={true} onClose={onClose} />)
    await userEvent.type(screen.getByLabelText(/Title/i), 'Dark mode')
    await userEvent.click(screen.getByRole('button', { name: /Submit/i }))
    const closeBtn = await screen.findByRole('button', { name: /Close/i })
    await userEvent.click(closeBtn)
    expect(onClose).toHaveBeenCalled()
  })

  it('resets state when reopened after a close', async () => {
    const { rerender } = render(<FeatureRequestModal open={true} onClose={() => {}} />)
    await userEvent.type(screen.getByLabelText(/Title/i), 'Dark mode')
    await userEvent.type(screen.getByLabelText(/Description/i), 'Please add it')

    await userEvent.click(screen.getByRole('button', { name: /Cancel/i }))
    rerender(<FeatureRequestModal open={false} onClose={() => {}} />)
    rerender(<FeatureRequestModal open={true} onClose={() => {}} />)

    expect((screen.getByLabelText(/Title/i) as HTMLInputElement).value).toBe('')
    expect((screen.getByLabelText(/Description/i) as HTMLTextAreaElement).value).toBe('')
    expect(screen.queryByText(/Request submitted/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/Something went wrong/i)).not.toBeInTheDocument()
  })

  it('resets state on close after an error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }))
    const { rerender } = render(<FeatureRequestModal open={true} onClose={() => {}} />)
    await userEvent.type(screen.getByLabelText(/Title/i), 'Dark mode')
    await userEvent.click(screen.getByRole('button', { name: /Submit/i }))
    expect(await screen.findByText(/Something went wrong/i)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /Cancel/i }))
    rerender(<FeatureRequestModal open={false} onClose={() => {}} />)
    rerender(<FeatureRequestModal open={true} onClose={() => {}} />)

    expect(screen.queryByText(/Something went wrong/i)).not.toBeInTheDocument()
    expect((screen.getByLabelText(/Title/i) as HTMLInputElement).value).toBe('')
  })
})
