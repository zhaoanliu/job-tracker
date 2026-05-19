import { NextResponse } from 'next/server'

export function GET() {
  const err = new Error('Sentry source map verification — delete this route after confirming stack traces')
  console.error(err)
  return NextResponse.json({ ok: true })
}
