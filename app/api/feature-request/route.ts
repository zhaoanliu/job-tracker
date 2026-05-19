import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const title = (body.title ?? '').trim().slice(0, 200)
  const description = (body.description ?? '').trim().slice(0, 2000)

  if (!title) {
    return NextResponse.json({ error: 'Title is required' }, { status: 400 })
  }

  const repo = process.env.GITHUB_REPO
  const pat = process.env.GH_PAT

  if (!repo || !pat) {
    console.error('Missing GITHUB_REPO or GH_PAT env vars')
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
  }

  const issueBody = [
    description ? `**Description:**\n${description}` : null,
    `**Submitted by:** ${user.email ?? 'unknown'}`,
    '',
    '> Submitted via the in-app feature request form.',
    '> Do not process through automation until reviewed and approved.',
  ]
    .filter(Boolean)
    .join('\n')

  const res = await fetch(`https://api.github.com/repos/${repo}/issues`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${pat}`,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      title: `[Feature Request] ${title}`,
      body: issueBody,
      labels: ['feature-request', 'user-requested'],
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    console.error('GitHub issue creation failed:', res.status, text)
    return NextResponse.json({ error: 'Failed to create issue' }, { status: 500 })
  }

  const issue = await res.json()
  return NextResponse.json({ ok: true, url: issue.html_url })
}
