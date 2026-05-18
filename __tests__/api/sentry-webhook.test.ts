import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { POST } from '@/app/api/sentry-webhook/route'
import crypto from 'crypto'

// Minimal NextRequest stand-in — route only uses .text() and .headers.get()
function makeReq(body: object, signature?: string) {
  const rawBody = JSON.stringify(body)
  return {
    text: vi.fn().mockResolvedValue(rawBody),
    headers: { get: (key: string) => (key === 'sentry-hook-signature' ? (signature ?? null) : null) },
  } as any
}

function sign(body: object, secret: string) {
  return crypto.createHmac('sha256', secret).update(JSON.stringify(body)).digest('hex')
}

const TRIGGERED: object = {
  action: 'triggered',
  data: {
    event: {
      title: 'TypeError: Cannot read properties of null',
      issue_url: 'https://org.sentry.io/issues/123/',
      culprit: 'handleSave in KanbanBoard',
    },
  },
}

const ENV = {
  GITHUB_REPO: 'owner/repo',
  GH_PAT: 'ghp_test',
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }))
  Object.assign(process.env, ENV)
  delete process.env.SENTRY_WEBHOOK_SECRET
})

afterEach(() => {
  vi.unstubAllGlobals()
  delete process.env.SENTRY_WEBHOOK_SECRET
  delete process.env.GITHUB_REPO
  delete process.env.GH_PAT
})

describe('POST /api/sentry-webhook — signature validation', () => {
  it('skips signature check when SENTRY_WEBHOOK_SECRET is not set', async () => {
    const res = await POST(makeReq(TRIGGERED))
    expect(res.status).toBe(200)
  })

  it('accepts a request with a valid signature', async () => {
    process.env.SENTRY_WEBHOOK_SECRET = 'secret123'
    const sig = sign(TRIGGERED, 'secret123')
    const res = await POST(makeReq(TRIGGERED, sig))
    expect(res.status).toBe(200)
  })

  it('returns 401 when signature is wrong', async () => {
    process.env.SENTRY_WEBHOOK_SECRET = 'secret123'
    const res = await POST(makeReq(TRIGGERED, 'bad-signature'))
    expect(res.status).toBe(401)
  })
})

describe('POST /api/sentry-webhook — action filtering', () => {
  it('ignores non-triggered actions and returns 200 without dispatching', async () => {
    const res = await POST(makeReq({ action: 'created', data: {} }))
    expect(res.status).toBe(200)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('ignores payloads missing data.event', async () => {
    const res = await POST(makeReq({ action: 'triggered', data: {} }))
    expect(res.status).toBe(200)
    expect(fetch).not.toHaveBeenCalled()
  })
})

describe('POST /api/sentry-webhook — GitHub dispatch', () => {
  it('returns 500 when GITHUB_REPO is missing', async () => {
    delete process.env.GITHUB_REPO
    const res = await POST(makeReq(TRIGGERED))
    expect(res.status).toBe(500)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('returns 500 when GH_PAT is missing', async () => {
    delete process.env.GH_PAT
    const res = await POST(makeReq(TRIGGERED))
    expect(res.status).toBe(500)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('calls GitHub dispatch with correct URL and headers', async () => {
    await POST(makeReq(TRIGGERED))
    expect(fetch).toHaveBeenCalledWith(
      'https://api.github.com/repos/owner/repo/dispatches',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer ghp_test',
        }),
      })
    )
  })

  it('sends sentry_url and culprit in client_payload', async () => {
    await POST(makeReq(TRIGGERED))
    const body = JSON.parse((fetch as any).mock.calls[0][1].body)
    expect(body.event_type).toBe('sentry-issue')
    expect(body.client_payload.sentry_url).toBe('https://org.sentry.io/issues/123/')
    expect(body.client_payload.culprit).toBe('handleSave in KanbanBoard')
  })

  it('returns 500 when GitHub dispatch fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 422, text: async () => 'Unprocessable' }))
    const res = await POST(makeReq(TRIGGERED))
    expect(res.status).toBe(500)
  })
})
