import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { getGitHubCreds, dispatchGitHubEvent } from '@/lib/github'

interface VercelMeta {
  githubCommitSha?: string | null
  githubCommitRef?: string | null
}

interface VercelDeployment {
  id?: string
  url?: string
  target?: string | null
  meta?: VercelMeta
}

interface VercelPayload {
  type?: string
  payload?: VercelDeployment
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text()

  const secret = process.env.VERCEL_WEBHOOK_SECRET
  if (secret) {
    const signature = req.headers.get('x-vercel-signature')
    const expected = crypto.createHmac('sha1', secret).update(rawBody).digest('hex')
    if (signature !== expected) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }
  }

  const body: VercelPayload = JSON.parse(rawBody)

  // Only handle production deployment errors
  if (body.type !== 'deployment.error' || body.payload?.target !== 'production') {
    return NextResponse.json({ ok: true })
  }

  const sha = body.payload?.meta?.githubCommitSha ?? null
  const ref = body.payload?.meta?.githubCommitRef ?? null

  if (!sha) {
    return NextResponse.json({ ok: true })
  }

  const deploymentUrl = body.payload?.url ? `https://${body.payload.url}` : ''

  const creds = getGitHubCreds()
  if (!creds) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
  }

  const res = await dispatchGitHubEvent(creds.repo, creds.pat, 'cd-failure', {
    sha,
    ref,
    deployment_url: deploymentUrl,
  })

  if (!res.ok) {
    const text = await res.text()
    console.error('GitHub dispatch failed:', res.status, text)
    return NextResponse.json({ error: 'Failed to dispatch' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
