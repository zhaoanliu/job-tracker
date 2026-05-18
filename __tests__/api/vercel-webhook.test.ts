import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { POST } from '@/app/api/vercel-webhook/route'
import crypto from 'crypto'

function makeReq(body: object, signature?: string) {
  const rawBody = JSON.stringify(body)
  return {
    text: vi.fn().mockResolvedValue(rawBody),
    headers: { get: (key: string) => (key === 'x-vercel-signature' ? (signature ?? null) : null) },
  } as any
}

function sign(body: object, secret: string) {
  return crypto.createHmac('sha1', secret).update(JSON.stringify(body)).digest('hex')
}

const PROD_ERROR: object = {
  type: 'deployment.error',
  payload: {
    id: 'dpl_abc123',
    url: 'my-project-abc.vercel.app',
    target: 'production',
    meta: {
      githubCommitSha: 'deadbeefdeadbeef',
      githubCommitRef: 'main',
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
  delete process.env.VERCEL_WEBHOOK_SECRET
})

afterEach(() => {
  vi.unstubAllGlobals()
  delete process.env.VERCEL_WEBHOOK_SECRET
  delete process.env.GITHUB_REPO
  delete process.env.GH_PAT
})

describe('POST /api/vercel-webhook — signature validation', () => {
  it('skips signature check when VERCEL_WEBHOOK_SECRET is not set', async () => {
    const res = await POST(makeReq(PROD_ERROR))
    expect(res.status).toBe(200)
  })

  it('accepts a request with a valid SHA1 signature', async () => {
    process.env.VERCEL_WEBHOOK_SECRET = 'secret123'
    const sig = sign(PROD_ERROR, 'secret123')
    const res = await POST(makeReq(PROD_ERROR, sig))
    expect(res.status).toBe(200)
  })

  it('returns 401 when signature is wrong', async () => {
    process.env.VERCEL_WEBHOOK_SECRET = 'secret123'
    const res = await POST(makeReq(PROD_ERROR, 'bad-signature'))
    expect(res.status).toBe(401)
    expect(fetch).not.toHaveBeenCalled()
  })
})

describe('POST /api/vercel-webhook — event filtering', () => {
  it('ignores non-error deployment events', async () => {
    const res = await POST(makeReq({ type: 'deployment.succeeded', payload: { target: 'production' } }))
    expect(res.status).toBe(200)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('ignores preview deployment errors', async () => {
    const res = await POST(makeReq({
      type: 'deployment.error',
      payload: { target: 'preview', meta: { githubCommitSha: 'abc', githubCommitRef: 'feat/x' } },
    }))
    expect(res.status).toBe(200)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('ignores production errors without a commit SHA', async () => {
    const res = await POST(makeReq({
      type: 'deployment.error',
      payload: { target: 'production', meta: { githubCommitSha: null } },
    }))
    expect(res.status).toBe(200)
    expect(fetch).not.toHaveBeenCalled()
  })
})

describe('POST /api/vercel-webhook — GitHub dispatch', () => {
  it('returns 500 when GITHUB_REPO is missing', async () => {
    delete process.env.GITHUB_REPO
    const res = await POST(makeReq(PROD_ERROR))
    expect(res.status).toBe(500)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('returns 500 when GH_PAT is missing', async () => {
    delete process.env.GH_PAT
    const res = await POST(makeReq(PROD_ERROR))
    expect(res.status).toBe(500)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('calls GitHub dispatch with correct event type and payload', async () => {
    await POST(makeReq(PROD_ERROR))
    expect(fetch).toHaveBeenCalledWith(
      'https://api.github.com/repos/owner/repo/dispatches',
      expect.objectContaining({ method: 'POST' })
    )
    const body = JSON.parse((fetch as any).mock.calls[0][1].body)
    expect(body.event_type).toBe('cd-failure')
    expect(body.client_payload.sha).toBe('deadbeefdeadbeef')
    expect(body.client_payload.ref).toBe('main')
    expect(body.client_payload.deployment_url).toBe('https://my-project-abc.vercel.app')
  })

  it('returns 500 when GitHub dispatch fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 422, text: async () => 'Unprocessable' }))
    const res = await POST(makeReq(PROD_ERROR))
    expect(res.status).toBe(500)
  })
})
