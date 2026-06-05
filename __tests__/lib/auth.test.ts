import { describe, it, expect, vi } from 'vitest'

vi.mock('next/headers', () => ({
  cookies: vi.fn(() => ({ getAll: vi.fn(() => []) })),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

import { getAuthenticatedUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

function mockUser(id = 'uid-1', email = 'test@example.com') {
  ;(createClient as ReturnType<typeof vi.fn>).mockReturnValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id, email } } }),
    },
  })
}

function mockUnauthenticated() {
  ;(createClient as ReturnType<typeof vi.fn>).mockReturnValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
    },
  })
}

describe('getAuthenticatedUser', () => {
  it('returns the user when authenticated', async () => {
    mockUser('uid-42', 'hello@example.com')
    const user = await getAuthenticatedUser()
    expect(user?.id).toBe('uid-42')
    expect(user?.email).toBe('hello@example.com')
  })

  it('returns null when not authenticated', async () => {
    mockUnauthenticated()
    const user = await getAuthenticatedUser()
    expect(user).toBeNull()
  })
})
