import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { trackEvent } from '@/lib/trackEvent'

const fetchMock = vi.fn()
beforeEach(() => { vi.stubGlobal('fetch', fetchMock) })
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks() })

describe('trackEvent', () => {
  it('POSTs to /api/events with the event name', async () => {
    fetchMock.mockResolvedValue({})
    trackEvent('drag_drop')
    // Give the fire-and-forget promise one microtask tick
    await Promise.resolve()
    expect(fetchMock).toHaveBeenCalledWith('/api/events', expect.objectContaining({
      method: 'POST',
      body: expect.stringContaining('"event_name":"drag_drop"'),
    }))
  })

  it('includes metadata when provided', async () => {
    fetchMock.mockResolvedValue({})
    trackEvent('csv_import', { count: 5 })
    await Promise.resolve()
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.metadata).toEqual({ count: 5 })
  })

  it('does not throw when fetch rejects', async () => {
    fetchMock.mockRejectedValue(new Error('network error'))
    expect(() => trackEvent('drag_drop')).not.toThrow()
    // Swallow the unhandled rejection from the internal .catch
    await Promise.resolve()
  })
})
