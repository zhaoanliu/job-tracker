import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!
const APP_URL = 'https://applytrackr.app'
const FROM = 'ApplyTrackr <noreply@applytrackr.app>'
const LOGO = `${APP_URL}/brand/lockup-light@2x.png`

function layout(title: string, body: string) {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head>
<body style="margin:0;padding:0;background-color:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8fafc;padding:40px 0;">
    <tr><td align="center">
      <table width="480" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;border:1px solid #e2e8f0;padding:40px;">
        <tr><td align="center" style="padding-bottom:32px;">
          <img src="${LOGO}" alt="ApplyTrackr" width="160" height="32" style="display:block;border:0;">
        </td></tr>
        ${body}
        <tr><td align="center" style="padding-top:24px;">
          <a href="${APP_URL}" style="color:#94a3b8;font-size:12px;text-decoration:none;">applytrackr.app</a>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`
}

function btn(label: string, url: string) {
  return `<tr><td align="center" style="padding-bottom:32px;">
    <a href="${url}" style="display:inline-block;background-color:#2563eb;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;border-radius:6px;padding:12px 28px;">${label}</a>
  </td></tr>`
}

function footer(email: string, note: string) {
  return `<tr><td style="color:#94a3b8;font-size:13px;line-height:1.6;border-top:1px solid #e2e8f0;padding-top:24px;">
    ${note}<br>This link was sent to <strong>${email}</strong>.
  </td></tr>`
}

function row(text: string, pb = '32px') {
  return `<tr><td style="color:#475569;font-size:15px;line-height:1.6;padding-bottom:${pb};">${text}</td></tr>`
}

function heading(text: string) {
  return `<tr><td style="color:#0f172a;font-size:18px;font-weight:600;padding-bottom:12px;">${text}</td></tr>`
}

function buildEmail(type: string, confirmationUrl: string, email: string): { subject: string; html: string } {
  switch (type) {
    case 'magic_link':
      return {
        subject: 'Sign in to ApplyTrackr',
        html: layout('Sign in to ApplyTrackr', `
          ${heading('Sign in to your account')}
          ${row('Click the button below to sign in. This link expires in 1 hour and can only be used once.')}
          ${btn('Sign in to ApplyTrackr', confirmationUrl)}
          ${footer(email, "If you didn't request this email, you can safely ignore it.")}
        `),
      }
    case 'signup':
      return {
        subject: 'Confirm your ApplyTrackr account',
        html: layout('Confirm your ApplyTrackr account', `
          ${heading('Confirm your email address')}
          ${row('Thanks for signing up. Click the button below to confirm your email address and activate your account.')}
          ${btn('Confirm email address', confirmationUrl)}
          ${footer(email, "If you didn't create an ApplyTrackr account, you can safely ignore this email.")}
        `),
      }
    case 'recovery':
      return {
        subject: 'Reset your ApplyTrackr password',
        html: layout('Reset your ApplyTrackr password', `
          ${heading('Reset your password')}
          ${row('We received a request to reset the password for your account. Click the button below to choose a new password. This link expires in 1 hour.')}
          ${btn('Reset password', confirmationUrl)}
          ${footer(email, "If you didn't request a password reset, you can safely ignore this email.")}
        `),
      }
    case 'email_change':
      return {
        subject: 'Confirm your new email address',
        html: layout('Confirm your new email address', `
          ${heading('Confirm your new email address')}
          ${row('Click the button below to confirm your new email address. This link expires in 1 hour.')}
          ${btn('Confirm new email', confirmationUrl)}
          ${footer(email, "If you didn't request this change, please secure your account immediately.")}
        `),
      }
    default:
      return {
        subject: 'Action required for your ApplyTrackr account',
        html: layout('ApplyTrackr', `
          ${heading('Action required')}
          ${row('Click the button below to continue.')}
          ${btn('Continue', confirmationUrl)}
          ${footer(email, '')}
        `),
      }
  }
}

// The hook payload's site_url is the Supabase auth server URL (e.g. https://<ref>.supabase.co/auth/v1)
const SUPABASE_AUTH_URL = 'https://rfnngfmdmzixcwibpals.supabase.co/auth/v1'

serve(async (req) => {
  try {
    const payload = await req.json()
    const { user, email_data } = payload

    const email = user?.email
    const type = email_data?.email_action_type
    const tokenHash = email_data?.token_hash
    const redirectTo = email_data?.redirect_to || APP_URL
    const siteUrl = email_data?.site_url || SUPABASE_AUTH_URL

    // Build confirmation URL from token_hash; site_url already ends with /auth/v1
    const confirmationUrl = `${siteUrl}/verify?token=${tokenHash}&type=${type}&redirect_to=${encodeURIComponent(redirectTo)}`

    const JSON_HEADERS = { 'Content-Type': 'application/json' }

    if (!email || !tokenHash) {
      console.error('Missing email or token_hash. Payload keys:', Object.keys(email_data || {}))
      return new Response(JSON.stringify({ error: 'missing email or token_hash' }), { status: 400, headers: JSON_HEADERS })
    }

    const { subject, html } = buildEmail(type, confirmationUrl, email)

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${RESEND_API_KEY}` },
      body: JSON.stringify({ from: FROM, to: email, subject, html }),
    })

    if (!res.ok) {
      const err = await res.text()
      console.error('Resend error:', err)
      return new Response(JSON.stringify({ error: err }), { status: 500, headers: JSON_HEADERS })
    }

    return new Response(JSON.stringify({}), { status: 200, headers: JSON_HEADERS })
  } catch (err) {
    console.error('Hook error:', err)
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
})
