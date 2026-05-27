import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import FeatureRequestModal from '@/components/ui/FeatureRequestModal'

describe('FeatureRequestModal', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, url: 'https://github.com/owner/repo/issues/1' }) }))
  })
  afterEach(() => vi.unstubAllGlobals())

  it('renders nothing when open is false', () => {
    const { container } = render(<FeatureRequestModal open={false} onClose={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
    expect(screen.queryByText('Request a feature')).not.toBeInTheDocument()
  })

  it('renders the modal when open is true', () => {
    render(<FeatureRequestModal open={true} onClose={vi.fn()} />)
    expect(screen.getByText('Request a feature')).toBeInTheDocument()
    expect(screen.getByLabelText(/Title/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Description/i)).toBeInTheDocument()
  })

  it('disables Submit when the title is empty', () => {
    render(<FeatureRequestModal open={true} onClose={vi.fn()} />)
    expect(screen.getByRole('button', { name: /Submit/i })).toBeDisabled()
  })

  it('calls /api/feature-request with title and description on submit', async () => {
    render(<FeatureRequestModal open={true} onClose={vi.fn()} />)
    await userEvent.type(screen.getByLabelText(/Title/i), 'Dark mode')
    await userEvent.type(screen.getByLabelText(/Description/i), 'Please add it')
    await userEvent.click(screen.getByRole('button', { name: /Submit/i }))
    expect(fetch).toHaveBeenCalledWith(
      '/api/feature-request',
      expect.objectContaining({ method: 'POST' })
    )
    const body = JSON.parse((fetch as unknown as { mock: { calls: [string, { body: string }][] } }).mock.calls[0][1].body)
    expect(body.title).toBe('Dark mode')
    expect(body.description).toBe('Please add it')
  })

  it('shows success message after successful submission', async () => {
    render(<FeatureRequestModal open={true} onClose={vi.fn()} />)
    await userEvent.type(screen.getByLabelText(/Title/i), 'Dark mode')
    await userEvent.click(screen.getByRole('button', { name: /Submit/i }))
    expect(await screen.findByText(/Request submitted/i)).toBeInTheDocument()
  })

  it('shows error message when submission fails (non-ok response)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }))
    render(<FeatureRequestModal open={true} onClose={vi.fn()} />)
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

  it('resets internal state on close (re-opening shows empty form, idle state)', async () => {
    const onClose = vi.fn()
    const { rerender } = render(<FeatureRequestModal open={true} onClose={onClose} />)
    await userEvent.type(screen.getByLabelText(/Title/i) as HTMLInputElement, 'Dark mode')
    await userEvent.type(screen.getByLabelText(/Description/i) as HTMLTextAreaElement, 'Please add it')
    await userEvent.click(screen.getByRole('button', { name: /Cancel/i }))

    rerender(<FeatureRequestModal open={false} onClose={onClose} />)
    rerender(<FeatureRequestModal open={true} onClose={onClose} />)

    expect((screen.getByLabelText(/Title/i) as HTMLInputElement).value).toBe('')
    expect((screen.getByLabelText(/Description/i) as HTMLTextAreaElement).value).toBe('')
    expect(screen.queryByText(/Request submitted/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/Something went wrong/i)).not.toBeInTheDocument()
  })
})
