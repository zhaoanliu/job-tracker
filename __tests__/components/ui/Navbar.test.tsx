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
  it('renders the app logo text', () => {
    render(<Navbar {...defaultProps} />)
    expect(screen.getByText('Job Tracker')).toBeInTheDocument()
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
})

describe('Navbar — feature request', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, url: 'https://github.com/owner/repo/issues/1' }) }))
  })
  afterEach(() => vi.unstubAllGlobals())

  it('renders the Feedback button', () => {
    render(<Navbar {...defaultProps} />)
    expect(screen.getByRole('button', { name: /Feedback/i })).toBeInTheDocument()
  })

  it('opens the feature request modal when Feedback is clicked', async () => {
    render(<Navbar {...defaultProps} />)
    await userEvent.click(screen.getByRole('button', { name: /Feedback/i }))
    expect(screen.getByText('Request a feature')).toBeInTheDocument()
    expect(screen.getByLabelText(/Title/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Description/i)).toBeInTheDocument()
  })

  it('closes the modal when Cancel is clicked', async () => {
    render(<Navbar {...defaultProps} />)
    await userEvent.click(screen.getByRole('button', { name: /Feedback/i }))
    await userEvent.click(screen.getByRole('button', { name: /Cancel/i }))
    expect(screen.queryByText('Request a feature')).not.toBeInTheDocument()
  })

  it('closes the modal when the backdrop is clicked', async () => {
    render(<Navbar {...defaultProps} />)
    await userEvent.click(screen.getByRole('button', { name: /Feedback/i }))
    const backdrop = document.querySelector('.fixed.inset-0') as HTMLElement
    await userEvent.click(backdrop)
    expect(screen.queryByText('Request a feature')).not.toBeInTheDocument()
  })

  it('Submit button is disabled when title is empty', async () => {
    render(<Navbar {...defaultProps} />)
    await userEvent.click(screen.getByRole('button', { name: /Feedback/i }))
    expect(screen.getByRole('button', { name: /Submit/i })).toBeDisabled()
  })

  it('calls /api/feature-request with title and description on submit', async () => {
    render(<Navbar {...defaultProps} />)
    await userEvent.click(screen.getByRole('button', { name: /Feedback/i }))
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

  it('shows success message after successful submission', async () => {
    render(<Navbar {...defaultProps} />)
    await userEvent.click(screen.getByRole('button', { name: /Feedback/i }))
    await userEvent.type(screen.getByLabelText(/Title/i), 'Dark mode')
    await userEvent.click(screen.getByRole('button', { name: /Submit/i }))
    expect(await screen.findByText(/Request submitted/i)).toBeInTheDocument()
  })

  it('shows error message when submission fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }))
    render(<Navbar {...defaultProps} />)
    await userEvent.click(screen.getByRole('button', { name: /Feedback/i }))
    await userEvent.type(screen.getByLabelText(/Title/i), 'Dark mode')
    await userEvent.click(screen.getByRole('button', { name: /Submit/i }))
    expect(await screen.findByText(/Something went wrong/i)).toBeInTheDocument()
  })
})
