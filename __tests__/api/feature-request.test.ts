import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Must mock next/headers before the route module is imported
vi.mock('next/headers', () => ({
  cookies: vi.fn(() => ({ getAll: vi.fn(() => []) })),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

import { POST } from '@/app/api/feature-request/route'
import { createClient } from '@/lib/supabase/server'

function makeReq(body: object) {
  return {
    json: vi.fn().mockResolvedValue(body),
  } as any
}

function mockUser(email = 'user@example.com') {
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

const ENV = { GITHUB_REPO: 'owner/repo', GH_PAT: 'ghp_test' }

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ html_url: 'https://github.com/owner/repo/issues/42' }),
    })
  )
  Object.assign(process.env, ENV)
})

afterEach(() => {
  vi.unstubAllGlobals()
  delete process.env.GITHUB_REPO
  delete process.env.GH_PAT
})

describe('POST /api/feature-request — auth', () => {
  it('returns 401 when user is not authenticated', async () => {
    mockUnauthenticated()
    const res = await POST(makeReq({ title: 'Dark mode' }))
    expect(res.status).toBe(401)
    expect(fetch).not.toHaveBeenCalled()
  })
})

describe('POST /api/feature-request — validation', () => {
  it('returns 400 when title is missing', async () => {
    mockUser()
    const res = await POST(makeReq({ description: 'Some description' }))
    expect(res.status).toBe(400)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('returns 400 when title is blank whitespace', async () => {
    mockUser()
    const res = await POST(makeReq({ title: '   ' }))
    expect(res.status).toBe(400)
  })
})

describe('POST /api/feature-request — env vars', () => {
  it('returns 500 when GITHUB_REPO is missing', async () => {
    mockUser()
    delete process.env.GITHUB_REPO
    const res = await POST(makeReq({ title: 'Dark mode' }))
    expect(res.status).toBe(500)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('returns 500 when GH_PAT is missing', async () => {
    mockUser()
    delete process.env.GH_PAT
    const res = await POST(makeReq({ title: 'Dark mode' }))
    expect(res.status).toBe(500)
    expect(fetch).not.toHaveBeenCalled()
  })
})

describe('POST /api/feature-request — GitHub issue creation', () => {
  it('calls GitHub issues API with correct URL and auth', async () => {
    mockUser()
    await POST(makeReq({ title: 'Dark mode' }))
    expect(fetch).toHaveBeenCalledWith(
      'https://api.github.com/repos/owner/repo/issues',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer ghp_test' }),
      })
    )
  })

  it('prefixes title with [Feature Request]', async () => {
    mockUser()
    await POST(makeReq({ title: 'Dark mode' }))
    const body = JSON.parse((fetch as any).mock.calls[0][1].body)
    expect(body.title).toBe('[Feature Request] Dark mode')
  })

  it('applies feature-request and user-requested labels', async () => {
    mockUser()
    await POST(makeReq({ title: 'Dark mode' }))
    const body = JSON.parse((fetch as any).mock.calls[0][1].body)
    expect(body.labels).toContain('feature-request')
    expect(body.labels).toContain('user-requested')
  })

  it('includes the user email in the issue body', async () => {
    mockUser('alice@example.com')
    await POST(makeReq({ title: 'Dark mode' }))
    const body = JSON.parse((fetch as any).mock.calls[0][1].body)
    expect(body.body).toContain('alice@example.com')
  })

  it('includes optional description when provided', async () => {
    mockUser()
    await POST(makeReq({ title: 'Dark mode', description: 'Would help at night' }))
    const body = JSON.parse((fetch as any).mock.calls[0][1].body)
    expect(body.body).toContain('Would help at night')
  })

  it('returns ok and GitHub issue URL on success', async () => {
    mockUser()
    const res = await POST(makeReq({ title: 'Dark mode' }))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.ok).toBe(true)
    expect(data.url).toBe('https://github.com/owner/repo/issues/42')
  })

  it('returns 500 when GitHub API fails', async () => {
    mockUser()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 422, text: async () => 'error' })
    )
    const res = await POST(makeReq({ title: 'Dark mode' }))
    expect(res.status).toBe(500)
  })
})
