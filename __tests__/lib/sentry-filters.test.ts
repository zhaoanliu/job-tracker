import { describe, it, expect } from 'vitest'
import { filterHydrationEvent } from '../../lib/sentry-filters'
import type { ErrorEvent } from '@sentry/nextjs'

function makeEvent(message: string, filenames: string[] = []): ErrorEvent {
  return {
    exception: {
      values: [{
        value: message,
        stacktrace: {
          frames: filenames.map(filename => ({ filename })),
        },
      }],
    },
  } as ErrorEvent
}

describe('filterHydrationEvent', () => {
  it('drops hydration errors with no app frames (browser extension cause)', () => {
    const event = makeEvent('Hydration failed because the initial UI does not match what was rendered on the server.')
    expect(filterHydrationEvent(event)).toBeNull()
  })

  it('drops hydration errors whose only frames are extension or unknown sources', () => {
    const event = makeEvent('There was an error while hydrating.', ['chrome-extension://abc/content.js'])
    expect(filterHydrationEvent(event)).toBeNull()
  })

  it('keeps hydration errors that have an app frame in /_next/', () => {
    const event = makeEvent(
      'Hydration failed because the initial UI does not match what was rendered on the server.',
      ['app:///_next/static/chunks/app/dashboard/page.js'],
    )
    expect(filterHydrationEvent(event)).toBe(event)
  })

  it('keeps non-hydration errors regardless of frames', () => {
    const event = makeEvent('TypeError: Cannot read properties of null')
    expect(filterHydrationEvent(event)).toBe(event)
  })

  it('keeps non-hydration errors with no frames', () => {
    const event = makeEvent('ReferenceError: foo is not defined')
    expect(filterHydrationEvent(event)).toBe(event)
  })

  it('handles events with no exception gracefully', () => {
    const event = {} as ErrorEvent
    expect(filterHydrationEvent(event)).toBe(event)
  })
})
