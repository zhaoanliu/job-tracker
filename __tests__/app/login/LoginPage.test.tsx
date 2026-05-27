import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('@/components/auth/AuthForm', () => ({
  default: () => <div data-testid="auth-form-mock" />,
}))

import LoginPage from '@/app/login/page'

describe('LoginPage', () => {
  it('renders a "View Roadmap" link pointing to /roadmap', () => {
    render(<LoginPage />)
    const link = screen.getByRole('link', { name: /view roadmap/i })
    expect(link).toBeInTheDocument()
    expect(link).toHaveAttribute('href', '/roadmap')
  })

  it('still renders the AuthForm card', () => {
    render(<LoginPage />)
    expect(screen.getByTestId('auth-form-mock')).toBeInTheDocument()
  })
})
