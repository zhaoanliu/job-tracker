import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Stable singleton mock so AuthForm and tests share the same auth instance.
const mockAuth = {
  signInWithPassword: vi.fn().mockResolvedValue({ error: null }),
  signUp: vi.fn().mockResolvedValue({ error: null }),
  signInWithOtp: vi.fn().mockResolvedValue({ error: null }),
  getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
  signOut: vi.fn().mockResolvedValue({}),
}

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: mockAuth, from: vi.fn() }),
}))

import AuthForm from '@/components/auth/AuthForm'

beforeEach(() => {
  vi.clearAllMocks()
  mockAuth.signInWithPassword.mockResolvedValue({ error: null })
  mockAuth.signUp.mockResolvedValue({ error: null })
  mockAuth.signInWithOtp.mockResolvedValue({ error: null })
})

describe('AuthForm — rendering', () => {
  it('renders the three mode tabs', () => {
    render(<AuthForm />)
    // "Sign In" appears on both the tab and the submit button; use getAllByText
    expect(screen.getAllByText('Sign In').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByRole('button', { name: 'Sign Up' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Magic Link' })).toBeInTheDocument()
  })

  it('shows email and password fields in sign-in mode by default', () => {
    render(<AuthForm />)
    expect(screen.getByPlaceholderText('you@example.com')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('••••••••')).toBeInTheDocument()
  })

  it('hides password field in magic-link mode', async () => {
    render(<AuthForm />)
    await userEvent.click(screen.getByRole('button', { name: 'Magic Link' }))
    expect(screen.queryByPlaceholderText('••••••••')).not.toBeInTheDocument()
  })

  it('submit button label changes per mode', async () => {
    render(<AuthForm />)
    // In sign-in mode the submit button has type="submit"
    expect(document.querySelector('button[type="submit"]')?.textContent).toBe('Sign In')

    await userEvent.click(screen.getByRole('button', { name: 'Sign Up' }))
    expect(screen.getByRole('button', { name: 'Create Account' })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Magic Link' }))
    expect(screen.getByRole('button', { name: 'Send Magic Link' })).toBeInTheDocument()
  })
})

describe('AuthForm — sign-in', () => {
  it('calls signInWithPassword with entered credentials', async () => {
    render(<AuthForm />)
    await userEvent.type(screen.getByPlaceholderText('you@example.com'), 'test@example.com')
    await userEvent.type(screen.getByPlaceholderText('••••••••'), 'secret123')
    fireEvent.submit(document.querySelector('form')!)
    await waitFor(() =>
      expect(mockAuth.signInWithPassword).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'secret123',
      })
    )
  })

  it('shows an error message when sign-in fails', async () => {
    mockAuth.signInWithPassword.mockResolvedValue({ error: new Error('Invalid credentials') })
    render(<AuthForm />)
    await userEvent.type(screen.getByPlaceholderText('you@example.com'), 'bad@example.com')
    await userEvent.type(screen.getByPlaceholderText('••••••••'), 'wrong')
    fireEvent.submit(document.querySelector('form')!)
    expect(await screen.findByText('Invalid credentials')).toBeInTheDocument()
  })
})

describe('AuthForm — sign-up', () => {
  it('calls signUp when in sign-up mode', async () => {
    render(<AuthForm />)
    await userEvent.click(screen.getByRole('button', { name: 'Sign Up' }))
    await userEvent.type(screen.getByPlaceholderText('you@example.com'), 'new@example.com')
    await userEvent.type(screen.getByPlaceholderText('••••••••'), 'pass1234')
    fireEvent.submit(document.querySelector('form')!)
    await waitFor(() => expect(mockAuth.signUp).toHaveBeenCalled())
  })

  it('shows success message after sign-up', async () => {
    render(<AuthForm />)
    await userEvent.click(screen.getByRole('button', { name: 'Sign Up' }))
    await userEvent.type(screen.getByPlaceholderText('you@example.com'), 'new@example.com')
    await userEvent.type(screen.getByPlaceholderText('••••••••'), 'pass1234')
    fireEvent.submit(document.querySelector('form')!)
    expect(await screen.findByText(/Account created/i)).toBeInTheDocument()
  })
})

describe('AuthForm — magic link', () => {
  it('calls signInWithOtp when in magic-link mode', async () => {
    render(<AuthForm />)
    await userEvent.click(screen.getByRole('button', { name: 'Magic Link' }))
    await userEvent.type(screen.getByPlaceholderText('you@example.com'), 'magic@example.com')
    fireEvent.submit(document.querySelector('form')!)
    await waitFor(() => expect(mockAuth.signInWithOtp).toHaveBeenCalled())
  })

  it('shows success message after magic link sent', async () => {
    render(<AuthForm />)
    await userEvent.click(screen.getByRole('button', { name: 'Magic Link' }))
    await userEvent.type(screen.getByPlaceholderText('you@example.com'), 'magic@example.com')
    fireEvent.submit(document.querySelector('form')!)
    expect(await screen.findByText(/Check your email for a magic link/i)).toBeInTheDocument()
  })
})
