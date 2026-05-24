import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('next/headers', () => ({
  cookies: vi.fn(() => ({ getAll: vi.fn(() => []) })),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

vi.mock('resend', () => ({
  Resend: vi.fn().mockImplementation(function () {
    return { emails: { send: vi.fn().mockResolvedValue({ error: null }) } }
  }),
}))

import { POST } from '@/app/api/invite/route'
import { createClient } from '@/lib/supabase/server'
import { Resend } from 'resend'

function makeReq(body: object) {
  return { json: vi.fn().mockResolvedValue(body) } as any
}

function mockUser(email = 'sender@example.com') {
  ;(createClient as ReturnType<typeof vi.fn>).mockReturnValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'uid-1', email } } }),
    },
    from: vi.fn(() => ({ insert: vi.fn().mockResolvedValue({ error: null }) })),
  })
}

function mockUnauthenticated() {
  ;(createClient as ReturnType<typeof vi.fn>).mockReturnValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
    },
  })
}

let mockSend: ReturnType<typeof vi.fn>

beforeEach(() => {
  mockSend = vi.fn().mockResolvedValue({ error: null })
  ;(Resend as ReturnType<typeof vi.fn>).mockImplementation(function () {
    return { emails: { send: mockSend } }
  })
  process.env.RESEND_API_KEY = 're_test_key'
  process.env.RESEND_FROM_EMAIL = 'noreply@applytrackr.app'
})

afterEach(() => {
  vi.clearAllMocks()
  delete process.env.RESEND_API_KEY
  delete process.env.RESEND_FROM_EMAIL
})

describe('POST /api/invite — auth', () => {
  it('returns 401 when unauthenticated', async () => {
    mockUnauthenticated()
    const res = await POST(makeReq({ to: 'friend@example.com' }))
    expect(res.status).toBe(401)
    expect(mockSend).not.toHaveBeenCalled()
  })
})

describe('POST /api/invite — validation', () => {
  it('returns 400 when email is missing', async () => {
    mockUser()
    const res = await POST(makeReq({}))
    expect(res.status).toBe(400)
    expect(mockSend).not.toHaveBeenCalled()
  })

  it('returns 400 when email is invalid', async () => {
    mockUser()
    const res = await POST(makeReq({ to: 'not-an-email' }))
    expect(res.status).toBe(400)
    expect(mockSend).not.toHaveBeenCalled()
  })

  it('returns 400 for blank email string', async () => {
    mockUser()
    const res = await POST(makeReq({ to: '   ' }))
    expect(res.status).toBe(400)
  })
})

describe('POST /api/invite — env vars', () => {
  it('returns 500 when RESEND_API_KEY is missing', async () => {
    mockUser()
    delete process.env.RESEND_API_KEY
    const res = await POST(makeReq({ to: 'friend@example.com' }))
    expect(res.status).toBe(500)
    expect(mockSend).not.toHaveBeenCalled()
  })
})

describe('POST /api/invite — email sending', () => {
  it('sends to the provided email address', async () => {
    mockUser()
    await POST(makeReq({ to: 'friend@example.com' }))
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'friend@example.com' })
    )
  })

  it('uses a fixed personal subject line', async () => {
    mockUser()
    await POST(makeReq({ to: 'friend@example.com' }))
    const args = mockSend.mock.calls[0][0]
    expect(args.subject).toContain('Zhaoan')
  })

  it('uses RESEND_FROM_EMAIL as the from address', async () => {
    mockUser()
    await POST(makeReq({ to: 'friend@example.com' }))
    const args = mockSend.mock.calls[0][0]
    expect(args.from).toContain('noreply@applytrackr.app')
  })

  it('includes optional personal message in the HTML', async () => {
    mockUser()
    await POST(makeReq({ to: 'friend@example.com', message: 'Hey check this out!' }))
    const args = mockSend.mock.calls[0][0]
    expect(args.html).toContain('Hey check this out!')
  })

  it('uses name in greeting when provided', async () => {
    mockUser()
    await POST(makeReq({ to: 'friend@example.com', name: 'Alex' }))
    const args = mockSend.mock.calls[0][0]
    expect(args.html).toContain('Hey Alex,')
  })

  it('falls back to generic greeting when name is omitted', async () => {
    mockUser()
    await POST(makeReq({ to: 'friend@example.com' }))
    const args = mockSend.mock.calls[0][0]
    expect(args.html).toContain('Hey,')
  })

  it('returns ok: true on success', async () => {
    mockUser()
    const res = await POST(makeReq({ to: 'friend@example.com' }))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.ok).toBe(true)
  })

  it('returns 500 when Resend returns an error', async () => {
    mockUser()
    mockSend.mockResolvedValue({ error: { message: 'Invalid API key', name: 'validation_error' } })
    const res = await POST(makeReq({ to: 'friend@example.com' }))
    expect(res.status).toBe(500)
  })

  it('logs domain-not-verified errors as warnings, not errors', async () => {
    mockUser()
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mockSend.mockResolvedValue({
      error: {
        message: 'The applytrackr.app domain is not verified. Please, add and verify your domain on https://resend.com/domains',
        name: 'validation_error',
      },
    })
    const res = await POST(makeReq({ to: 'friend@example.com' }))
    expect(res.status).toBe(500)
    expect(errorSpy).not.toHaveBeenCalled()
    expect(warnSpy).toHaveBeenCalled()
    errorSpy.mockRestore()
    warnSpy.mockRestore()
  })

  it('logs other Resend errors via console.error', async () => {
    mockUser()
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockSend.mockResolvedValue({ error: { message: 'Rate limit exceeded', name: 'rate_limit_exceeded' } })
    const res = await POST(makeReq({ to: 'friend@example.com' }))
    expect(res.status).toBe(500)
    expect(errorSpy).toHaveBeenCalled()
    errorSpy.mockRestore()
  })

  it('falls back to noreply@applytrackr.app when RESEND_FROM_EMAIL is unset', async () => {
    mockUser()
    delete process.env.RESEND_FROM_EMAIL
    await POST(makeReq({ to: 'friend@example.com' }))
    const args = mockSend.mock.calls[0][0]
    expect(args.from).toContain('noreply@applytrackr.app')
  })
})
