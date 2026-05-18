import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'

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

  const repo = process.env.GITHUB_REPO
  const pat = process.env.GH_PAT

  if (!repo || !pat) {
    console.error('Missing GITHUB_REPO or GH_PAT env vars')
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
  }

  const res = await fetch(`https://api.github.com/repos/${repo}/dispatches`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${pat}`,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      event_type: 'sentry-issue',
      client_payload: { title, sentry_url: sentryUrl, culprit },
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    console.error('GitHub dispatch failed:', res.status, text)
    return NextResponse.json({ error: 'Failed to dispatch' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
