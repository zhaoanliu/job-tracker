import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { getGitHubCreds, dispatchGitHubEvent } from '@/lib/github'

interface SentryEvent {
  title?: string
  issue_url?: string
  culprit?: string
  web_url?: string
}

interface SentryPayload {
  action?: string
  data?: {
    event?: SentryEvent
  }
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text()

  const secret = process.env.SENTRY_WEBHOOK_SECRET
  if (secret) {
    const signature = req.headers.get('sentry-hook-signature')
    const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex')
    if (signature !== expected) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }
  }

  const payload: SentryPayload = JSON.parse(rawBody)

  // Only handle alert triggers, not other webhook events
  if (payload.action !== 'triggered') {
    return NextResponse.json({ ok: true })
  }

  const event = payload.data?.event
  if (!event) {
    return NextResponse.json({ ok: true })
  }

  const title = event.title ?? 'Sentry error'
  const sentryUrl = event.issue_url ?? event.web_url ?? ''
  const culprit = event.culprit ?? ''

  const creds = getGitHubCreds()
  if (!creds) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
  }

  const res = await dispatchGitHubEvent(creds.repo, creds.pat, 'sentry-issue', {
    title,
    sentry_url: sentryUrl,
    culprit,
  })

  if (!res.ok) {
    const text = await res.text()
    console.error('GitHub dispatch failed:', res.status, text)
    return NextResponse.json({ error: 'Failed to dispatch' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
