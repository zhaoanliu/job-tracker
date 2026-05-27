import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Application } from '@/lib/types'

// Mock downloadCsv since it uses URL.createObjectURL (unavailable in jsdom)
vi.mock('@/lib/csv', async () => {
  const actual = await vi.importActual<typeof import('@/lib/csv')>('@/lib/csv')
  return { ...actual, downloadCsv: vi.fn() }
})

// Stable router mock so we can assert on push()
const mockPush = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: vi.fn(), refresh: vi.fn() }),
  redirect: vi.fn(),
}))

import Navbar from '@/components/ui/Navbar'
import { ThemeProvider } from '@/components/ui/ThemeProvider'
import { downloadCsv } from '@/lib/csv'

const noApps: Application[] = []

const defaultProps = {
  userEmail: 'demo@example.com',
  applications: noApps,
  onImport: vi.fn().mockResolvedValue(undefined),
  onNewApplication: vi.fn(),
}

beforeEach(() => vi.clearAllMocks())

describe('Navbar', () => {
  it('renders the app logo image', () => {
    render(<Navbar {...defaultProps} />)
    expect(screen.getAllByAltText('ApplyTrackr').length).toBeGreaterThan(0)
  })

  it('shows the user email', () => {
    render(<Navbar {...defaultProps} />)
    expect(screen.getByText('demo@example.com')).toBeInTheDocument()
  })

  it('renders the Add Application button', () => {
    render(<Navbar {...defaultProps} />)
    expect(screen.getByRole('button', { name: /Add Application/i })).toBeInTheDocument()
  })

  it('calls onNewApplication when Add Application is clicked', async () => {
    const onNewApplication = vi.fn()
    render(<Navbar {...defaultProps} onNewApplication={onNewApplication} />)
    await userEvent.click(screen.getByRole('button', { name: /Add Application/i }))
    expect(onNewApplication).toHaveBeenCalled()
  })

  it('renders Export and Import controls', () => {
    render(<Navbar {...defaultProps} />)
    expect(screen.getByText('Export')).toBeInTheDocument()
    expect(screen.getByText('Import')).toBeInTheDocument()
  })

  it('calls downloadCsv with applications and a history map when Export is clicked', async () => {
    const apps = [{ id: '1', company: 'Acme' } as Application]
    render(<Navbar {...defaultProps} applications={apps} />)
    await userEvent.click(screen.getByText('Export'))
    await waitFor(() => expect(downloadCsv).toHaveBeenCalledWith(apps, expect.any(Map)))
  })

  it('renders Sign out button', () => {
    render(<Navbar {...defaultProps} />)
    expect(screen.getByRole('button', { name: /Sign out/i })).toBeInTheDocument()
  })

  it('signs out and navigates to /login when Sign out is clicked', async () => {
    render(<Navbar {...defaultProps} />)
    await userEvent.click(screen.getByRole('button', { name: /Sign out/i }))
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/login'))
  })

  it('renders a hidden file input that accepts CSV files', () => {
    render(<Navbar {...defaultProps} />)
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    expect(input).toBeInTheDocument()
    expect(input.accept).toBe('.csv')
  })

  it('renders a Roadmap link pointing to /roadmap', () => {
    render(<Navbar {...defaultProps} />)
    const link = screen.getByRole('link', { name: /Roadmap/i })
    expect(link).toBeInTheDocument()
    expect(link).toHaveAttribute('href', '/roadmap')
  })

  it('renders the theme toggle button', () => {
    render(<Navbar {...defaultProps} />)
    expect(screen.getByRole('button', { name: /Switch to dark mode|Switch to light mode/i })).toBeInTheDocument()
  })

  it('toggles theme when the theme button is clicked', async () => {
    render(<ThemeProvider><Navbar {...defaultProps} /></ThemeProvider>)
    const toggleBtn = screen.getByRole('button', { name: /Switch to dark mode/i })
    await userEvent.click(toggleBtn)
    expect(screen.getByRole('button', { name: /Switch to light mode/i })).toBeInTheDocument()
  })
})

describe('Navbar — invite', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) }))
  })
  afterEach(() => vi.unstubAllGlobals())

  it('renders the Invite button', () => {
    render(<Navbar {...defaultProps} />)
    expect(screen.getByRole('button', { name: /Invite/i })).toBeInTheDocument()
  })

  it('opens the invite modal when Invite is clicked', async () => {
    render(<Navbar {...defaultProps} />)
    await userEvent.click(screen.getByRole('button', { name: /Invite/i }))
    expect(screen.getByText('Invite a friend')).toBeInTheDocument()
    expect(screen.getByLabelText(/Email/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Personal note/i)).toBeInTheDocument()
  })

  it('closes the modal when Cancel is clicked', async () => {
    render(<Navbar {...defaultProps} />)
    await userEvent.click(screen.getByRole('button', { name: /Invite/i }))
    await userEvent.click(screen.getByRole('button', { name: /Cancel/i }))
    expect(screen.queryByText('Invite a friend')).not.toBeInTheDocument()
  })

  it('Send invite button is disabled when email is empty', async () => {
    render(<Navbar {...defaultProps} />)
    await userEvent.click(screen.getByRole('button', { name: /Invite/i }))
    expect(screen.getByRole('button', { name: /Send invite/i })).toBeDisabled()
  })

  it('calls /api/invite with email and message on submit', async () => {
    render(<Navbar {...defaultProps} />)
    await userEvent.click(screen.getByRole('button', { name: /Invite/i }))
    await userEvent.type(screen.getByLabelText(/Email/i), 'friend@example.com')
    await userEvent.type(screen.getByLabelText(/Personal note/i), 'Check this out!')
    await userEvent.click(screen.getByRole('button', { name: /Send invite/i }))
    expect(fetch).toHaveBeenCalledWith('/api/invite', expect.objectContaining({ method: 'POST' }))
    const body = JSON.parse((fetch as any).mock.calls[0][1].body)
    expect(body.to).toBe('friend@example.com')
    expect(body.message).toBe('Check this out!')
  })

  it('shows success message after invite is sent', async () => {
    render(<Navbar {...defaultProps} />)
    await userEvent.click(screen.getByRole('button', { name: /Invite/i }))
    await userEvent.type(screen.getByLabelText(/Email/i), 'friend@example.com')
    await userEvent.click(screen.getByRole('button', { name: /Send invite/i }))
    expect(await screen.findByText(/Invite sent/i)).toBeInTheDocument()
  })

  it('shows error message when invite fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }))
    render(<Navbar {...defaultProps} />)
    await userEvent.click(screen.getByRole('button', { name: /Invite/i }))
    await userEvent.type(screen.getByLabelText(/Email/i), 'friend@example.com')
    await userEvent.click(screen.getByRole('button', { name: /Send invite/i }))
    expect(await screen.findByText(/Something went wrong/i)).toBeInTheDocument()
  })
})

describe('Navbar — feature request', () => {
  it('renders the Feedback button', () => {
    render(<Navbar {...defaultProps} />)
    expect(screen.getByRole('button', { name: /Feedback/i })).toBeInTheDocument()
  })

  it('opens the feature request modal when Feedback is clicked', async () => {
    render(<Navbar {...defaultProps} />)
    await userEvent.click(screen.getByRole('button', { name: /Feedback/i }))
    expect(screen.getByText('Request a feature')).toBeInTheDocument()
  })
})
