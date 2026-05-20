// Fire-and-forget: never throws, never awaited. Safe to call anywhere.
export function trackEvent(eventName: string, metadata?: Record<string, unknown>): void {
  fetch('/api/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event_name: eventName, metadata }),
  }).catch(() => {})
}
