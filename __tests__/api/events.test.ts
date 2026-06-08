import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('next/headers', () => ({
  cookies: vi.fn(() => ({ getAll: vi.fn(() => []) })),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

import { POST } from '@/app/api/events/route'
import { createClient } from '@/lib/supabase/server'

function makeReq(body: object) {
  return { json: vi.fn().mockResolvedValue(body) } as any
}

function mockUser(id = 'uid-1') {
  const insert = vi.fn().mockResolvedValue({ error: null })
  ;(createClient as ReturnType<typeof vi.fn>).mockReturnValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id } } }) },
    from: vi.fn(() => ({ insert })),
  })
  return { insert }
}

function mockUnauthenticated() {
  ;(createClient as ReturnType<typeof vi.fn>).mockReturnValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
  })
}

afterEach(() => vi.clearAllMocks())

describe('POST /api/events — auth', () => {
  it('returns 401 when unauthenticated', async () => {
    mockUnauthenticated()
    const res = await POST(makeReq({ event_name: 'drag_drop' }))
    expect(res.status).toBe(401)
  })
})

describe('POST /api/events — validation', () => {
  it('returns 400 when body is not valid JSON', async () => {
    mockUser()
    const req = { json: vi.fn().mockRejectedValue(new SyntaxError('Unexpected end of JSON input')) } as any
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('returns 400 when event_name is missing', async () => {
    mockUser()
    const res = await POST(makeReq({}))
    expect(res.status).toBe(400)
  })

  it('returns 400 when event_name is blank', async () => {
    mockUser()
    const res = await POST(makeReq({ event_name: '   ' }))
    expect(res.status).toBe(400)
  })
})

describe('POST /api/events — success', () => {
  it('inserts the event and returns ok', async () => {
    const { insert } = mockUser()
    const res = await POST(makeReq({ event_name: 'drag_drop', metadata: { from: 'future', to: 'applied' } }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ event_name: 'drag_drop', user_id: 'uid-1' })
    )
  })

  it('truncates event_name to 100 chars', async () => {
    const { insert } = mockUser()
    const long = 'x'.repeat(200)
    await POST(makeReq({ event_name: long }))
    const call = insert.mock.calls[0][0]
    expect(call.event_name.length).toBe(100)
  })
})

describe('POST /api/events — DB error', () => {
  it('returns 500 on insert failure', async () => {
    ;(createClient as ReturnType<typeof vi.fn>).mockReturnValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'uid-1' } } }) },
      from: vi.fn(() => ({ insert: vi.fn().mockResolvedValue({ error: { message: 'db error' } }) })),
    })
    const res = await POST(makeReq({ event_name: 'drag_drop' }))
    expect(res.status).toBe(500)
  })
})
