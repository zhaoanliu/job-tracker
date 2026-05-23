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
<body style="margin:0;padding:0;background-color:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8fafc;padding:40px 0;">
    <tr><td align="center">
      <table width="480" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;border:1px solid #e2e8f0;padding:40px;">
        <tr>
          <td align="center" style="padding-bottom:32px;">
            <img src="${APP_URL}/brand/lockup-light@2x.png"
                 alt="ApplyTrackr"
                 width="160" height="32"
                 style="display:block;border:0;" />
          </td>
        </tr>
        <tr>
          <td style="color:#0f172a;font-size:18px;font-weight:600;padding-bottom:12px;">
            ${greeting}
          </td>
        </tr>
        <tr>
          <td style="color:#475569;font-size:15px;line-height:1.6;padding-bottom:16px;">
            I built something I think you&rsquo;d find useful. My name is <a href="https://www.linkedin.com/in/zhaoan-liu-a7017928/" style="color:#2563eb;text-decoration:none;font-weight:600;">Zhaoan Liu</a>. While I was job hunting, I started using AI to help build tools to make the process less painful — and <strong>ApplyTrackr</strong> is one of them.
          </td>
        </tr>
        <tr>
          <td style="color:#475569;font-size:15px;line-height:1.6;padding-bottom:16px;">
            It&rsquo;s a personal kanban board for managing job applications — track where you applied, what stage you&rsquo;re at, and never lose sight of an opportunity. Simple, fast, and free to use.
          </td>
        </tr>
        <tr>
          <td style="color:#475569;font-size:15px;line-height:1.6;padding-bottom:16px;">
            As a software engineer with a background in security, user privacy and data security are something I take seriously. The app requires sign-in, and your data is stored in an encrypted database with row-level security — only you can access your own applications, nobody else.
          </td>
        </tr>
        ${personalNote ? `<tr><td style="padding-bottom:16px;">${personalNote}</td></tr>` : ''}
        <tr>
          <td style="color:#475569;font-size:15px;line-height:1.6;padding-bottom:32px;">
            I&rsquo;d love for you to give it a try. If you run into anything or have ideas, hit the <strong>Feedback</strong> button inside the app — I read every submission. And if you find it useful, feel free to invite your friends to try it out too!
          </td>
        </tr>
        <tr>
          <td align="center" style="padding-bottom:24px;">
            <a href="${APP_URL}"
               style="display:inline-block;background-color:#2563eb;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;border-radius:6px;padding:12px 28px;">
              Try ApplyTrackr →
            </a>
          </td>
        </tr>
        <tr>
          <td style="color:#94a3b8;font-size:13px;line-height:1.6;border-top:1px solid #e2e8f0;padding-top:24px;">
            Sent by <strong>${escapeHtml(senderEmail)}</strong> via ApplyTrackr &middot; <a href="${APP_URL}" style="color:#94a3b8;text-decoration:none;">applytrackr.app</a>
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
  const supabase = await createClient()
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
    from: `ApplyTrackr <${fromEmail}>`,
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

  // Record invite so admin dashboard can track usage
  const { error: dbError } = await supabase
    .from('invites')
    .insert({ sender_id: user.id, recipient: to })
  if (dbError) console.error('Failed to record invite:', dbError.message, dbError)

  return NextResponse.json({ ok: true })
}
