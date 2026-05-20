import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Stable singleton mock so AuthForm and tests share the same auth instance.
const mockAuth = {
  signInWithPassword: vi.fn().mockResolvedValue({ error: null }),
  signUp: vi.fn().mockResolvedValue({ error: null }),
  signInWithOtp: vi.fn().mockResolvedValue({ error: null }),
  resetPasswordForEmail: vi.fn().mockResolvedValue({ error: null }),
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

describe('AuthForm — demo account', () => {
  it('renders the Use demo account button', () => {
    render(<AuthForm />)
    expect(screen.getByRole('button', { name: /Use demo account/i })).toBeInTheDocument()
  })

  it('fills in demo credentials and switches to sign-in mode when clicked', async () => {
    render(<AuthForm />)
    await userEvent.click(screen.getByRole('button', { name: 'Magic Link' }))
    await userEvent.click(screen.getByRole('button', { name: /Use demo account/i }))
    expect((screen.getByPlaceholderText('you@example.com') as HTMLInputElement).value).toBe('demo@jobtracker.dev')
    expect((screen.getByPlaceholderText('••••••••') as HTMLInputElement).value).toBe('demo1234')
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
  it('calls signUp pointing to /auth/callback', async () => {
    render(<AuthForm />)
    await userEvent.click(screen.getByRole('button', { name: 'Sign Up' }))
    await userEvent.type(screen.getByPlaceholderText('you@example.com'), 'new@example.com')
    await userEvent.type(screen.getByPlaceholderText('••••••••'), 'pass1234')
    fireEvent.submit(document.querySelector('form')!)
    await waitFor(() =>
      expect(mockAuth.signUp).toHaveBeenCalledWith({
        email: 'new@example.com',
        password: 'pass1234',
        options: { emailRedirectTo: expect.stringContaining('/auth/callback') },
      })
    )
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
  it('calls signInWithOtp pointing to /auth/callback', async () => {
    render(<AuthForm />)
    await userEvent.click(screen.getByRole('button', { name: 'Magic Link' }))
    await userEvent.type(screen.getByPlaceholderText('you@example.com'), 'magic@example.com')
    fireEvent.submit(document.querySelector('form')!)
    await waitFor(() =>
      expect(mockAuth.signInWithOtp).toHaveBeenCalledWith({
        email: 'magic@example.com',
        options: { emailRedirectTo: expect.stringContaining('/auth/callback') },
      })
    )
  })

  it('shows success message after magic link sent', async () => {
    render(<AuthForm />)
    await userEvent.click(screen.getByRole('button', { name: 'Magic Link' }))
    await userEvent.type(screen.getByPlaceholderText('you@example.com'), 'magic@example.com')
    fireEvent.submit(document.querySelector('form')!)
    expect(await screen.findByText(/Check your email for a magic link/i)).toBeInTheDocument()
  })
})

describe('AuthForm — forgot password', () => {
  it('shows Forgot password? link in sign-in mode', () => {
    render(<AuthForm />)
    expect(screen.getByRole('button', { name: 'Forgot password?' })).toBeInTheDocument()
  })

  it('does not show Forgot password? in other modes', async () => {
    render(<AuthForm />)
    await userEvent.click(screen.getByRole('button', { name: 'Sign Up' }))
    expect(screen.queryByRole('button', { name: 'Forgot password?' })).not.toBeInTheDocument()
  })

  it('switches to reset mode when Forgot password? is clicked', async () => {
    render(<AuthForm />)
    await userEvent.click(screen.getByRole('button', { name: 'Forgot password?' }))
    expect(screen.getByRole('button', { name: 'Send reset link' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Back to sign in' })).toBeInTheDocument()
    expect(screen.queryByPlaceholderText('••••••••')).not.toBeInTheDocument()
  })

  it('calls resetPasswordForEmail with the redirectTo callback URL', async () => {
    render(<AuthForm />)
    await userEvent.click(screen.getByRole('button', { name: 'Forgot password?' }))
    await userEvent.type(screen.getByPlaceholderText('you@example.com'), 'user@example.com')
    fireEvent.submit(document.querySelector('form')!)
    await waitFor(() =>
      expect(mockAuth.resetPasswordForEmail).toHaveBeenCalledWith(
        'user@example.com',
        { redirectTo: expect.stringContaining('/auth/callback?next=/auth/reset-password') }
      )
    )
  })

  it('shows ambiguous success message (does not leak whether email exists)', async () => {
    render(<AuthForm />)
    await userEvent.click(screen.getByRole('button', { name: 'Forgot password?' }))
    await userEvent.type(screen.getByPlaceholderText('you@example.com'), 'user@example.com')
    fireEvent.submit(document.querySelector('form')!)
    expect(await screen.findByText(/If that email exists/i)).toBeInTheDocument()
  })

  it('Back to sign in returns to sign-in mode', async () => {
    render(<AuthForm />)
    await userEvent.click(screen.getByRole('button', { name: 'Forgot password?' }))
    await userEvent.click(screen.getByRole('button', { name: 'Back to sign in' }))
    expect(screen.getByRole('button', { name: 'Forgot password?' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Back to sign in' })).not.toBeInTheDocument()
  })
})
