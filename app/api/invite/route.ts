import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { Resend } from 'resend'

const APP_URL = 'https://applytrackr.app'

function buildEmailHtml(senderEmail: string, name?: string, message?: string) {
  const greeting = name?.trim() ? `Hey ${escapeHtml(name.trim())},` : 'Hey,'
  const personalNote = message?.trim()
    ? `<p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.6;">${personalNote_escape(message.trim())}</p>`
    : ''

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">
        <!-- Header -->
        <tr>
          <td style="background:#4f46e5;border-radius:12px 12px 0 0;padding:24px 32px;">
            <table cellpadding="0" cellspacing="0">
              <tr>
                <td style="background:#6366f1;border-radius:8px;width:32px;height:32px;text-align:center;vertical-align:middle;">
                  <span style="color:white;font-size:16px;">&#128203;</span>
                </td>
                <td style="padding-left:10px;color:white;font-size:16px;font-weight:600;">Job Tracker</td>
              </tr>
            </table>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="background:white;padding:32px;border-radius:0 0 12px 12px;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
            <h1 style="margin:0 0 16px;font-size:20px;font-weight:700;color:#0f172a;">${greeting}</h1>
            <p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.6;">
              I built something I think you&rsquo;d find useful. My name is <a href="https://www.linkedin.com/in/zhaoan-liu-a7017928/" style="color:#4f46e5;text-decoration:none;font-weight:600;">Zhaoan Liu</a>. While I was job hunting, I started using AI to help build tools to make the process less painful — and <strong>Job Tracker</strong> is one of them.
            </p>
            <p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.6;">
              It&rsquo;s a personal kanban board for managing job applications — track where you applied, what stage you&rsquo;re at, and never lose sight of an opportunity. Simple, fast, and free to use.
            </p>
            <p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.6;">
              As a software engineer with a background in security, user privacy and data security are something I take seriously. The app requires sign-in, and your data is stored in an encrypted database with row-level security — only you can access your own applications, nobody else.
            </p>
            ${personalNote}
            <p style="margin:0 0 24px;color:#374151;font-size:14px;line-height:1.6;">
              I&rsquo;d love for you to give it a try. If you run into anything or have ideas, hit the <strong>Feedback</strong> button inside the app — I read every submission. And if you find it useful, feel free to invite your friends to try it out too!
            </p>
            <table cellpadding="0" cellspacing="0">
              <tr>
                <td style="border-radius:8px;background:#4f46e5;">
                  <a href="${APP_URL}" style="display:inline-block;padding:12px 24px;color:white;font-size:14px;font-weight:600;text-decoration:none;">Try Job Tracker →</a>
                </td>
              </tr>
            </table>
            <p style="margin:24px 0 0;font-size:12px;color:#94a3b8;">
              Or copy this link: <a href="${APP_URL}" style="color:#4f46e5;">${APP_URL}</a>
            </p>
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="padding:16px 0;text-align:center;font-size:11px;color:#94a3b8;">
            Sent via Job Tracker &middot; <a href="${APP_URL}" style="color:#94a3b8;">applytrackr.app</a>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

function escapeHtml(str: string) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function personalNote_escape(str: string) {
  return escapeHtml(str).replace(/\n/g, '<br>')
}

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const to = (body.to ?? '').trim().toLowerCase()
  const name = (body.name ?? '').trim().slice(0, 100)
  const message = (body.message ?? '').trim().slice(0, 500)

  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    return NextResponse.json({ error: 'Valid email address is required' }, { status: 400 })
  }

  const apiKey = process.env.RESEND_API_KEY
  const fromEmail = process.env.RESEND_FROM_EMAIL ?? 'noreply@applytrackr.app'

  if (!apiKey) {
    console.error('Missing RESEND_API_KEY env var')
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
  }

  const resend = new Resend(apiKey)
  const senderEmail = user.email ?? 'A friend'

  const { error } = await resend.emails.send({
    from: `Job Tracker <${fromEmail}>`,
    to,
    subject: `Zhaoan built a job tracker and wants you to try it`,
    html: buildEmailHtml(senderEmail, name, message),
  })

  if (error) {
    const isDomainConfigError = /domain is not verified|domain is not found/i.test(error.message ?? '')
    if (isDomainConfigError) {
      console.warn('Resend email failed (domain config):', error.message, error)
    } else {
      console.error('Resend email failed:', error.message, error)
    }
    return NextResponse.json({ error: 'Failed to send email' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
