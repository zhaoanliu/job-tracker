import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth'
import { getGitHubCreds, createGitHubIssue } from '@/lib/github'

export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const title = (body.title ?? '').trim().slice(0, 200)
  const description = (body.description ?? '').trim().slice(0, 2000)

  if (!title) {
    return NextResponse.json({ error: 'Title is required' }, { status: 400 })
  }

  const creds = getGitHubCreds()
  if (!creds) {
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

  const res = await createGitHubIssue(
    creds.repo,
    creds.pat,
    `[Feature Request] ${title}`,
    issueBody,
    ['user-requested']
  )

  if (!res.ok) {
    const text = await res.text()
    console.error('GitHub issue creation failed:', res.status, text)
    return NextResponse.json({ error: 'Failed to create issue' }, { status: 500 })
  }

  const issue = await res.json()
  return NextResponse.json({ ok: true, url: issue.html_url })
}
