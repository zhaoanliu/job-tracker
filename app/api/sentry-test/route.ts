import { NextResponse } from 'next/server'

export function GET() {
  // Verify both capture paths: console.error (captureConsoleIntegration) and unhandled throw
  console.error(new Error('Sentry source map verification (console.error path)'))
  throw new Error('Sentry source map verification (unhandled throw path)')
  return NextResponse.json({ ok: true })
}
