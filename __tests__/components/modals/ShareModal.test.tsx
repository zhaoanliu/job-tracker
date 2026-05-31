import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ShareModal from '@/components/modals/ShareModal'

describe('ShareModal', () => {
  beforeEach(() => {
    vi.spyOn(global, 'fetch').mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({ success: true }), { status: 200 }))
    )
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders nothing when isOpen is false', () => {
    const { container } = render(<ShareModal isOpen={false} onClose={vi.fn()} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders heading, email input, and buttons when open', () => {
    render(<ShareModal isOpen={true} onClose={vi.fn()} />)
    expect(screen.getByRole('heading', { name: 'Share board' })).toBeInTheDocument()
    expect(screen.getByLabelText('Email address')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Send invite' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
  })

  it('calls onClose when Cancel is clicked', async () => {
    const onClose = vi.fn()
    render(<ShareModal isOpen={true} onClose={onClose} />)
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalled()
  })

  it('calls onClose when close (X) button is clicked', async () => {
    const onClose = vi.fn()
    render(<ShareModal isOpen={true} onClose={onClose} />)
    await userEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalled()
  })

  it('calls onClose when Escape key is pressed', () => {
    const onClose = vi.fn()
    render(<ShareModal isOpen={true} onClose={onClose} />)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })

  it('calls onClose when the backdrop is clicked', () => {
    const onClose = vi.fn()
    const { container } = render(<ShareModal isOpen={true} onClose={onClose} />)
    const overlay = container.firstChild as HTMLElement
    fireEvent.click(overlay)
    expect(onClose).toHaveBeenCalled()
  })

  it('shows validation error when submitting an empty email', async () => {
    render(<ShareModal isOpen={true} onClose={vi.fn()} />)
    fireEvent.submit(document.querySelector('form')!)
    expect(await screen.findByText('Email address is required')).toBeInTheDocument()
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('shows validation error when submitting only whitespace', async () => {
    render(<ShareModal isOpen={true} onClose={vi.fn()} />)
    const input = screen.getByLabelText('Email address') as HTMLInputElement
    fireEvent.change(input, { target: { value: '   ' } })
    fireEvent.submit(document.querySelector('form')!)
    expect(await screen.findByText('Email address is required')).toBeInTheDocument()
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('POSTs to /api/share with the trimmed email on submit', async () => {
    render(<ShareModal isOpen={true} onClose={vi.fn()} />)
    await userEvent.type(screen.getByLabelText('Email address'), '  user@example.com  ')
    await userEvent.click(screen.getByRole('button', { name: 'Send invite' }))
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/share', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'user@example.com' }),
    }))
  })

  it('shows success message and clears input on success', async () => {
    render(<ShareModal isOpen={true} onClose={vi.fn()} />)
    const input = screen.getByLabelText('Email address') as HTMLInputElement
    await userEvent.type(input, 'user@example.com')
    await userEvent.click(screen.getByRole('button', { name: 'Send invite' }))
    expect(await screen.findByText('Invitation sent')).toBeInTheDocument()
    expect(input.value).toBe('')
  })

  it('shows loading state on the submit button while pending', async () => {
    let resolveFetch: (v: Response) => void = () => {}
    vi.spyOn(global, 'fetch').mockImplementation(
      () => new Promise<Response>(resolve => { resolveFetch = resolve })
    )
    render(<ShareModal isOpen={true} onClose={vi.fn()} />)
    await userEvent.type(screen.getByLabelText('Email address'), 'user@example.com')
    await userEvent.click(screen.getByRole('button', { name: 'Send invite' }))
    const button = await screen.findByRole('button', { name: 'Sending…' })
    expect(button).toBeDisabled()
    resolveFetch(new Response(JSON.stringify({ success: true }), { status: 200 }))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Sending…' })).not.toBeInTheDocument())
  })

  it('shows the API error message in red text when response is not ok', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'Valid email address is required' }), { status: 400 })
    )
    render(<ShareModal isOpen={true} onClose={vi.fn()} />)
    await userEvent.type(screen.getByLabelText('Email address'), 'bad@example.com')
    await userEvent.click(screen.getByRole('button', { name: 'Send invite' }))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Valid email address is required')
    expect(alert.className).toMatch(/text-red/)
  })

  it('falls back to a generic message when the error response has no body', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response('not json', { status: 500 })
    )
    render(<ShareModal isOpen={true} onClose={vi.fn()} />)
    await userEvent.type(screen.getByLabelText('Email address'), 'user@example.com')
    await userEvent.click(screen.getByRole('button', { name: 'Send invite' }))
    expect(await screen.findByText(/Failed to send invitation \(500\)/)).toBeInTheDocument()
  })

  it('shows the thrown error message when fetch rejects', async () => {
    vi.spyOn(global, 'fetch').mockRejectedValueOnce(new Error('Network down'))
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(<ShareModal isOpen={true} onClose={vi.fn()} />)
    await userEvent.type(screen.getByLabelText('Email address'), 'user@example.com')
    await userEvent.click(screen.getByRole('button', { name: 'Send invite' }))
    expect(await screen.findByText('Network down')).toBeInTheDocument()
    consoleError.mockRestore()
  })

  it('shows a generic message when fetch rejects with a non-Error value', async () => {
    vi.spyOn(global, 'fetch').mockRejectedValueOnce('string failure')
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(<ShareModal isOpen={true} onClose={vi.fn()} />)
    await userEvent.type(screen.getByLabelText('Email address'), 'user@example.com')
    await userEvent.click(screen.getByRole('button', { name: 'Send invite' }))
    expect(await screen.findByText('Failed to send invitation')).toBeInTheDocument()
    consoleError.mockRestore()
  })

  it('resets all state when the modal closes and reopens', async () => {
    const { rerender } = render(<ShareModal isOpen={true} onClose={vi.fn()} />)
    const input = screen.getByLabelText('Email address') as HTMLInputElement
    await userEvent.type(input, 'user@example.com')
    await userEvent.click(screen.getByRole('button', { name: 'Send invite' }))
    expect(await screen.findByText('Invitation sent')).toBeInTheDocument()

    rerender(<ShareModal isOpen={false} onClose={vi.fn()} />)
    rerender(<ShareModal isOpen={true} onClose={vi.fn()} />)
    const reopenedInput = screen.getByLabelText('Email address') as HTMLInputElement
    expect(reopenedInput.value).toBe('')
    expect(screen.queryByText('Invitation sent')).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('does not respond to Escape when closed', () => {
    const onClose = vi.fn()
    render(<ShareModal isOpen={false} onClose={onClose} />)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
  })
})
