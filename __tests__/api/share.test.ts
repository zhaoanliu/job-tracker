import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('next/headers', () => ({
  cookies: vi.fn(() => ({ getAll: vi.fn(() => []) })),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: vi.fn(),
}))

import { POST } from '@/app/api/share/route'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

function makeReq(body: object) {
  return { json: vi.fn().mockResolvedValue(body) } as any
}

function mockUser(email = 'sender@example.com') {
  ;(createClient as ReturnType<typeof vi.fn>).mockReturnValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'uid-1', email } } }),
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

let mockInvite: ReturnType<typeof vi.fn>

beforeEach(() => {
  mockInvite = vi.fn().mockResolvedValue({ error: null })
  ;(createServiceClient as ReturnType<typeof vi.fn>).mockReturnValue({
    auth: { admin: { inviteUserByEmail: mockInvite } },
  })
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key'
})

afterEach(() => {
  vi.clearAllMocks()
  delete process.env.SUPABASE_SERVICE_ROLE_KEY
})

describe('POST /api/share — env vars', () => {
  it('returns 500 when SUPABASE_SERVICE_ROLE_KEY is missing', async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY
    const res = await POST(makeReq({ email: 'friend@example.com' }))
    expect(res.status).toBe(500)
    const data = await res.json()
    expect(data.error).toBe('not configured')
    expect(mockInvite).not.toHaveBeenCalled()
  })
})

describe('POST /api/share — auth', () => {
  it('returns 401 when unauthenticated', async () => {
    mockUnauthenticated()
    const res = await POST(makeReq({ email: 'friend@example.com' }))
    expect(res.status).toBe(401)
    expect(mockInvite).not.toHaveBeenCalled()
  })
})

describe('POST /api/share — validation', () => {
  it('returns 400 when email is missing', async () => {
    mockUser()
    const res = await POST(makeReq({}))
    expect(res.status).toBe(400)
    expect(mockInvite).not.toHaveBeenCalled()
  })

  it('returns 400 when email is invalid', async () => {
    mockUser()
    const res = await POST(makeReq({ email: 'not-an-email' }))
    expect(res.status).toBe(400)
    expect(mockInvite).not.toHaveBeenCalled()
  })

  it('returns 400 for blank email string', async () => {
    mockUser()
    const res = await POST(makeReq({ email: '   ' }))
    expect(res.status).toBe(400)
    expect(mockInvite).not.toHaveBeenCalled()
  })
})

describe('POST /api/share — invitation', () => {
  it('calls inviteUserByEmail with the provided email (lowercased and trimmed)', async () => {
    mockUser()
    await POST(makeReq({ email: '  Friend@Example.com  ' }))
    expect(mockInvite).toHaveBeenCalledWith('friend@example.com')
  })

  it('returns success: true on a successful invite', async () => {
    mockUser()
    const res = await POST(makeReq({ email: 'friend@example.com' }))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.success).toBe(true)
  })

  it('returns 500 and logs when Supabase returns an error', async () => {
    mockUser()
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockInvite.mockResolvedValue({ error: { message: 'user already exists' } })
    const res = await POST(makeReq({ email: 'friend@example.com' }))
    expect(res.status).toBe(500)
    const data = await res.json()
    expect(data.error).toBe('Failed to send invitation')
    expect(errorSpy).toHaveBeenCalled()
    errorSpy.mockRestore()
  })
})
