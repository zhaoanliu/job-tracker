import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { getGitHubCreds, dispatchGitHubEvent, createGitHubIssue } from '@/lib/github'

const ENV = { GITHUB_REPO: 'owner/repo', GH_PAT: 'ghp_test' }

beforeEach(() => {
  Object.assign(process.env, ENV)
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }))
})

afterEach(() => {
  delete process.env.GITHUB_REPO
  delete process.env.GH_PAT
  vi.unstubAllGlobals()
})

describe('getGitHubCreds', () => {
  it('returns creds when both env vars are set', () => {
    const creds = getGitHubCreds()
    expect(creds).toEqual({ repo: 'owner/repo', pat: 'ghp_test' })
  })

  it('returns null when GITHUB_REPO is missing', () => {
    delete process.env.GITHUB_REPO
    expect(getGitHubCreds()).toBeNull()
  })

  it('returns null when GH_PAT is missing', () => {
    delete process.env.GH_PAT
    expect(getGitHubCreds()).toBeNull()
  })
})

describe('dispatchGitHubEvent', () => {
  it('calls the dispatches endpoint with correct method and auth', async () => {
    await dispatchGitHubEvent('owner/repo', 'ghp_test', 'test-event', { key: 'val' })
    expect(fetch).toHaveBeenCalledWith(
      'https://api.github.com/repos/owner/repo/dispatches',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer ghp_test' }),
      })
    )
  })

  it('serialises event_type and client_payload correctly', async () => {
    await dispatchGitHubEvent('owner/repo', 'ghp_test', 'my-event', { a: 1 })
    const body = JSON.parse((fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body)
    expect(body).toEqual({ event_type: 'my-event', client_payload: { a: 1 } })
  })
})

describe('createGitHubIssue', () => {
  it('calls the issues endpoint with correct method and auth', async () => {
    await createGitHubIssue('owner/repo', 'ghp_test', 'Title', 'Body', ['label'])
    expect(fetch).toHaveBeenCalledWith(
      'https://api.github.com/repos/owner/repo/issues',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer ghp_test' }),
      })
    )
  })

  it('serialises title, body, and labels correctly', async () => {
    await createGitHubIssue('owner/repo', 'ghp_test', 'My Issue', 'Details', ['bug', 'user-requested'])
    const body = JSON.parse((fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body)
    expect(body).toEqual({ title: 'My Issue', body: 'Details', labels: ['bug', 'user-requested'] })
  })
})
