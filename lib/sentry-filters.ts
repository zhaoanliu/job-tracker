import type { ErrorEvent } from '@sentry/nextjs'

// Drop hydration errors with no app-code stack frames — these are caused by
// browser extensions (password managers, etc.) injecting DOM attributes that
// React sees as a server/client mismatch. Real hydration bugs from app code
// will have at least one frame inside the /_next/ bundle and are kept.
export function filterHydrationEvent(event: ErrorEvent): ErrorEvent | null {
  const value = event.exception?.values?.[0]?.value ?? ''
  if (/hydrat/i.test(value)) {
    const frames = event.exception?.values?.[0]?.stacktrace?.frames ?? []
    const hasAppFrame = frames.some(f => f.filename?.includes('/_next/'))
    if (!hasAppFrame) return null
  }
  return event
}
