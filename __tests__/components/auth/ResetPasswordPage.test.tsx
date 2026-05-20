import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const mockGetUser = vi.fn().mockResolvedValue({ data: { user: { id: 'test-uid' } }, error: null })
const mockUpdateUser = vi.fn().mockResolvedValue({ error: null })
const mockPush = vi.fn()

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { getUser: mockGetUser, updateUser: mockUpdateUser } }),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}))

import ResetPasswordPage from '@/app/auth/reset-password/page'

beforeEach(() => {
  vi.clearAllMocks()
  mockGetUser.mockResolvedValue({ data: { user: { id: 'test-uid' } }, error: null })
  mockUpdateUser.mockResolvedValue({ error: null })
})

describe('ResetPasswordPage — rendering', () => {
  it('renders the new password and confirm fields once the link is verified', async () => {
    render(<ResetPasswordPage />)
    const fields = await screen.findAllByPlaceholderText('••••••••')
    expect(fields).toHaveLength(2)
    expect(screen.getByRole('button', { name: 'Set password' })).toBeInTheDocument()
  })

  it('shows expired state when getUser returns no user', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null })
    render(<ResetPasswordPage />)
    expect(await screen.findByText(/This link has expired/i)).toBeInTheDocument()
    expect(screen.queryByPlaceholderText('••••••••')).not.toBeInTheDocument()
  })
})

describe('ResetPasswordPage — validation', () => {
  it('shows an error when passwords do not match', async () => {
    render(<ResetPasswordPage />)
    const [newPw, confirmPw] = await screen.findAllByPlaceholderText('••••••••')
    await userEvent.type(newPw, 'password123')
    await userEvent.type(confirmPw, 'different123')
    fireEvent.submit(document.querySelector('form')!)
    expect(await screen.findByText(/Passwords do not match/i)).toBeInTheDocument()
    expect(mockUpdateUser).not.toHaveBeenCalled()
  })
})

describe('ResetPasswordPage — success', () => {
  it('calls updateUser with the new password and shows success message', async () => {
    render(<ResetPasswordPage />)
    const [newPw, confirmPw] = await screen.findAllByPlaceholderText('••••••••')
    await userEvent.type(newPw, 'newpass123')
    await userEvent.type(confirmPw, 'newpass123')
    fireEvent.submit(document.querySelector('form')!)
    await waitFor(() =>
      expect(mockUpdateUser).toHaveBeenCalledWith({ password: 'newpass123' })
    )
    expect(await screen.findByText(/Password updated/i)).toBeInTheDocument()
  })

  it('redirects to /dashboard after success', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      render(<ResetPasswordPage />)
      const [newPw, confirmPw] = await screen.findAllByPlaceholderText('••••••••')
      fireEvent.change(newPw, { target: { value: 'newpass123' } })
      fireEvent.change(confirmPw, { target: { value: 'newpass123' } })
      await act(async () => { fireEvent.submit(document.querySelector('form')!) })
      vi.advanceTimersByTime(800)
      expect(mockPush).toHaveBeenCalledWith('/dashboard')
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('ResetPasswordPage — error', () => {
  it('shows the error message from Supabase on failure', async () => {
    mockUpdateUser.mockResolvedValue({ error: new Error('Auth session missing!') })
    render(<ResetPasswordPage />)
    const [newPw, confirmPw] = await screen.findAllByPlaceholderText('••••••••')
    fireEvent.change(newPw, { target: { value: 'newpass123' } })
    fireEvent.change(confirmPw, { target: { value: 'newpass123' } })
    fireEvent.submit(document.querySelector('form')!)
    expect(await screen.findByText('Auth session missing!')).toBeInTheDocument()
  })
})
