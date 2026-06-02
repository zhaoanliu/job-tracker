import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const mockPush = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}))

const mockSignOut = vi.fn().mockResolvedValue({})
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { signOut: mockSignOut } }),
}))

import AdminNav from '@/components/admin/AdminNav'

beforeEach(() => vi.clearAllMocks())

describe('AdminNav', () => {
  it('renders the user email', () => {
    render(<AdminNav userEmail="admin@example.com" />)
    expect(screen.getByText('admin@example.com')).toBeInTheDocument()
  })

  it('renders the sign out button', () => {
    render(<AdminNav userEmail="admin@example.com" />)
    expect(screen.getByRole('button', { name: /sign out/i })).toBeInTheDocument()
  })

  it('signs out and redirects to /login when sign out is clicked', async () => {
    render(<AdminNav userEmail="admin@example.com" />)
    await userEvent.click(screen.getByRole('button', { name: /sign out/i }))
    expect(mockSignOut).toHaveBeenCalledOnce()
    expect(mockPush).toHaveBeenCalledWith('/login')
  })
})
