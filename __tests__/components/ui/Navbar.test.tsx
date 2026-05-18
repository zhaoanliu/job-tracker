import { describe, it, expect, vi, beforeEach } from 'vitest'
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

  it('calls downloadCsv with applications when Export is clicked', async () => {
    const apps = [{ id: '1', company: 'Acme' } as Application]
    render(<Navbar {...defaultProps} applications={apps} />)
    await userEvent.click(screen.getByText('Export'))
    expect(downloadCsv).toHaveBeenCalledWith(apps)
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
