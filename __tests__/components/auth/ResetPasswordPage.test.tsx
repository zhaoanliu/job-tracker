import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const mockUpdateUser = vi.fn().mockResolvedValue({ error: null })
const mockPush = vi.fn()

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { updateUser: mockUpdateUser } }),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}))

import ResetPasswordPage from '@/app/auth/reset-password/page'

beforeEach(() => {
  vi.clearAllMocks()
  mockUpdateUser.mockResolvedValue({ error: null })
})

describe('ResetPasswordPage — rendering', () => {
  it('renders the new password and confirm fields', () => {
    render(<ResetPasswordPage />)
    expect(screen.getAllByPlaceholderText('••••••••')).toHaveLength(2)
    expect(screen.getByRole('button', { name: 'Set password' })).toBeInTheDocument()
  })
})

describe('ResetPasswordPage — validation', () => {
  it('shows an error when passwords do not match', async () => {
    render(<ResetPasswordPage />)
    const [newPw, confirmPw] = screen.getAllByPlaceholderText('••••••••')
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
    const [newPw, confirmPw] = screen.getAllByPlaceholderText('••••••••')
    await userEvent.type(newPw, 'newpass123')
    await userEvent.type(confirmPw, 'newpass123')
    fireEvent.submit(document.querySelector('form')!)
    await waitFor(() =>
      expect(mockUpdateUser).toHaveBeenCalledWith({ password: 'newpass123' })
    )
    expect(await screen.findByText(/Password updated/i)).toBeInTheDocument()
  })

  it('redirects to /dashboard after success', async () => {
    vi.useFakeTimers()
    try {
      render(<ResetPasswordPage />)
      const [newPw, confirmPw] = screen.getAllByPlaceholderText('••••••••')
      fireEvent.change(newPw, { target: { value: 'newpass123' } })
      fireEvent.change(confirmPw, { target: { value: 'newpass123' } })
      // act(async) flushes all promises without relying on setInterval (which is faked)
      await act(async () => { fireEvent.submit(document.querySelector('form')!) })
      vi.advanceTimersByTime(1500)
      expect(mockPush).toHaveBeenCalledWith('/dashboard')
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('ResetPasswordPage — error', () => {
  it('shows the error message from Supabase on failure', async () => {
    mockUpdateUser.mockResolvedValue({ error: { message: 'Auth session missing!' } })
    render(<ResetPasswordPage />)
    const [newPw, confirmPw] = screen.getAllByPlaceholderText('••••••••')
    fireEvent.change(newPw, { target: { value: 'newpass123' } })
    fireEvent.change(confirmPw, { target: { value: 'newpass123' } })
    fireEvent.submit(document.querySelector('form')!)
    expect(await screen.findByText('Auth session missing!')).toBeInTheDocument()
  })
})
