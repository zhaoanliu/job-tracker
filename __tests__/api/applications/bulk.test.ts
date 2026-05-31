import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('next/headers', () => ({
  cookies: vi.fn(() => ({ getAll: vi.fn(() => []) })),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

import { POST, PATCH } from '@/app/api/applications/bulk/route'
import { createClient } from '@/lib/supabase/server'

type Body = object | string

function makeReq(body: Body) {
  return {
    json: vi.fn().mockImplementation(async () => {
      if (typeof body === 'string') throw new SyntaxError('bad json')
      return body
    }),
  } as any
}

interface UpdateResult {
  data: { id: string }[] | null
  error: { message: string } | null
}

function mockAuthed(result: UpdateResult = { data: [{ id: 'a' }], error: null }) {
  const select = vi.fn().mockResolvedValue(result)
  const eq = vi.fn().mockReturnValue({ select })
  const inFn = vi.fn().mockReturnValue({ eq })
  const update = vi.fn().mockReturnValue({ in: inFn })
  const from = vi.fn().mockReturnValue({ update })
  ;(createClient as ReturnType<typeof vi.fn>).mockReturnValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'uid-1', email: 'u@x.com' } } }),
    },
    from,
  })
  return { from, update, inFn, eq, select }
}

function mockUnauthed() {
  ;(createClient as ReturnType<typeof vi.fn>).mockReturnValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
    from: vi.fn(),
  })
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('POST /api/applications/bulk — auth', () => {
  it('returns 401 when unauthenticated', async () => {
    mockUnauthed()
    const res = await POST(makeReq({ ids: ['a'], action: 'archive' }))
    expect(res.status).toBe(401)
  })
})

describe('POST /api/applications/bulk — validation', () => {
  beforeEach(() => {
    mockAuthed()
  })

  it('returns 400 when body is not JSON', async () => {
    const res = await POST(makeReq('not-json'))
    expect(res.status).toBe(400)
  })

  it('returns 400 when ids is missing', async () => {
    const res = await POST(makeReq({ action: 'archive' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when ids is empty array', async () => {
    const res = await POST(makeReq({ ids: [], action: 'archive' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when ids contains a non-string', async () => {
    const res = await POST(makeReq({ ids: ['a', 42], action: 'archive' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when action is missing', async () => {
    const res = await POST(makeReq({ ids: ['a'] }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when action is not "archive"', async () => {
    const res = await POST(makeReq({ ids: ['a'], action: 'delete' }))
    expect(res.status).toBe(400)
  })
})

describe('POST /api/applications/bulk — happy path', () => {
  it('updates matching applications to status archived', async () => {
    const mocks = mockAuthed({ data: [{ id: 'a' }, { id: 'b' }], error: null })
    const res = await POST(makeReq({ ids: ['a', 'b'], action: 'archive' }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.updated).toBe(2)
    expect(mocks.from).toHaveBeenCalledWith('applications')
    expect(mocks.update).toHaveBeenCalledWith({ status: 'archived' })
    expect(mocks.inFn).toHaveBeenCalledWith('id', ['a', 'b'])
    expect(mocks.eq).toHaveBeenCalledWith('user_id', 'uid-1')
  })

  it('returns updated: 0 when no rows matched', async () => {
    mockAuthed({ data: [], error: null })
    const res = await POST(makeReq({ ids: ['nope'], action: 'archive' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ updated: 0 })
  })

  it('returns updated: 0 when supabase returns null data', async () => {
    mockAuthed({ data: null, error: null })
    const res = await POST(makeReq({ ids: ['a'], action: 'archive' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ updated: 0 })
  })
})

describe('POST /api/applications/bulk — db error', () => {
  it('returns 500 and logs to console.error when db update fails', async () => {
    mockAuthed({ data: null, error: { message: 'boom' } })
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await POST(makeReq({ ids: ['a'], action: 'archive' }))
    expect(res.status).toBe(500)
    expect(errSpy).toHaveBeenCalled()
    errSpy.mockRestore()
  })
})

describe('PATCH /api/applications/bulk', () => {
  it('behaves identically to POST for valid input', async () => {
    const mocks = mockAuthed({ data: [{ id: 'a' }], error: null })
    const res = await PATCH(makeReq({ ids: ['a'], action: 'archive' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ updated: 1 })
    expect(mocks.update).toHaveBeenCalledWith({ status: 'archived' })
  })

  it('returns 401 when unauthenticated', async () => {
    mockUnauthed()
    const res = await PATCH(makeReq({ ids: ['a'], action: 'archive' }))
    expect(res.status).toBe(401)
  })
})
