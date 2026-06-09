import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(),
}))

import { middleware } from '../middleware'
import { createServerClient } from '@supabase/ssr'

function makeRequest(pathname: string) {
  return new NextRequest(new URL(`http://localhost${pathname}`))
}

type CookieMutation = { name: string; value: string; options: Record<string, unknown> }

function setupSupabase(opts: {
  user?: object | null
  error?: { message: string; status?: number } | null
  cookiesToClear?: CookieMutation[]
}) {
  const { user = null, error = null, cookiesToClear = [] } = opts
  let capturedSetAll: ((cookies: CookieMutation[]) => void) | null = null

  const signOut = vi.fn().mockImplementation(async () => {
    if (cookiesToClear.length > 0 && capturedSetAll) {
      capturedSetAll(cookiesToClear)
    }
    return { error: null }
  })

  ;(createServerClient as ReturnType<typeof vi.fn>).mockImplementation(
    (_url: string, _key: string, config: { cookies: { setAll: (c: CookieMutation[]) => void } }) => {
      capturedSetAll = config.cookies.setAll
      return {
        auth: {
          getUser: vi.fn().mockResolvedValue({ data: { user }, error }),
          signOut,
        },
      }
    }
  )

  return { signOut }
}

beforeEach(() => vi.clearAllMocks())

describe('middleware — stale refresh token', () => {
  it('calls signOut with scope local when getUser returns an auth error', async () => {
    const { signOut } = setupSupabase({
      error: { message: 'Invalid Refresh Token: Refresh Token Not Found', status: 400 },
    })
    await middleware(makeRequest('/dashboard'))
    expect(signOut).toHaveBeenCalledWith({ scope: 'local' })
  })

  it('redirects to /login when getUser returns an auth error on a protected route', async () => {
    setupSupabase({
      error: { message: 'Invalid Refresh Token: Refresh Token Not Found', status: 400 },
    })
    const res = await middleware(makeRequest('/dashboard'))
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('/login')
  })

  it('forwards cleared cookies to the redirect response so stale tokens are removed from the browser', async () => {
    setupSupabase({
      error: { message: 'Invalid Refresh Token: Refresh Token Not Found', status: 400 },
      cookiesToClear: [
        { name: 'sb-test-auth-token', value: '', options: { maxAge: 0, path: '/' } },
      ],
    })
    const res = await middleware(makeRequest('/dashboard'))
    const setCookies = res.headers.getSetCookie()
    expect(setCookies.some(c => c.includes('sb-test-auth-token'))).toBe(true)
  })

  it('does not call signOut when getUser succeeds', async () => {
    const { signOut } = setupSupabase({ user: { id: 'uid-1', email: 'a@b.com' } })
    await middleware(makeRequest('/dashboard'))
    expect(signOut).not.toHaveBeenCalled()
  })
})

describe('middleware — unauthenticated user', () => {
  it('redirects /dashboard to /login when user is null', async () => {
    setupSupabase({ user: null })
    const res = await middleware(makeRequest('/dashboard'))
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('/login')
  })

  it('allows access to /login when user is null', async () => {
    setupSupabase({ user: null })
    const res = await middleware(makeRequest('/login'))
    expect(res.status).toBe(200)
  })
})

describe('middleware — authenticated user', () => {
  it('redirects /login to /dashboard for a regular user', async () => {
    setupSupabase({ user: { id: 'uid-1', email: 'user@example.com' } })
    const res = await middleware(makeRequest('/login'))
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('/dashboard')
  })

  it('allows access to /dashboard for an authenticated user', async () => {
    setupSupabase({ user: { id: 'uid-1', email: 'user@example.com' } })
    const res = await middleware(makeRequest('/dashboard'))
    expect(res.status).toBe(200)
  })
})
