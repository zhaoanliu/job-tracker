import { Webhook } from 'https://esm.sh/standardwebhooks@1.0.0'
import { Resend } from 'npm:resend@4.0.0'

const resend = new Resend(Deno.env.get('RESEND_API_KEY') as string)
const hookSecret = Deno.env.get('SEND_EMAIL_HOOK_SECRET') as string
const fromEmail = Deno.env.get('RESEND_FROM_EMAIL') ?? 'noreply@applytrackr.app'

const JSON_HEADERS = { 'Content-Type': 'application/json' }

interface HookPayload {
  user: { email: string }
  email_data: {
    token: string
    token_hash: string
    redirect_to: string
    email_action_type: string
    site_url: string
    token_new?: string
    token_hash_new?: string
  }
}

function buildVerifyUrl(siteUrl: string, tokenHash: string, type: string, redirectTo: string): string {
  const params = new URLSearchParams({
    token: tokenHash,
    type,
    redirect_to: redirectTo,
  })
  return `${siteUrl}/verify?${params.toString()}`
}

function emailShell(title: string, heading: string, body: string, buttonLabel: string, verifyUrl: string, footer: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background-color:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8fafc;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="480" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;border:1px solid #e2e8f0;padding:40px;">
          <tr>
            <td align="center" style="padding-bottom:32px;">
              <img src="https://applytrackr.app/brand/lockup-light@2x.png"
                   alt="ApplyTrackr"
                   width="160" height="32"
                   style="display:block;border:0;" />
            </td>
          </tr>
          <tr>
            <td style="color:#0f172a;font-size:18px;font-weight:600;padding-bottom:12px;">
              ${heading}
            </td>
          </tr>
          <tr>
            <td style="color:#475569;font-size:15px;line-height:1.6;padding-bottom:32px;">
              ${body}
            </td>
          </tr>
          <tr>
            <td align="center" style="padding-bottom:32px;">
              <a href="${verifyUrl}"
                 style="display:inline-block;background-color:#2563eb;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;border-radius:6px;padding:12px 28px;">
                ${buttonLabel}
              </a>
            </td>
          </tr>
          <tr>
            <td style="color:#94a3b8;font-size:13px;line-height:1.6;border-top:1px solid #e2e8f0;padding-top:24px;">
              ${footer}
            </td>
          </tr>
          <tr>
            <td align="center" style="padding-top:24px;">
              <a href="https://applytrackr.app" style="color:#94a3b8;font-size:12px;text-decoration:none;">applytrackr.app</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

function renderEmail(actionType: string, userEmail: string, verifyUrl: string): { subject: string; html: string } {
  switch (actionType) {
    case 'signup':
      return {
        subject: 'Confirm your ApplyTrackr account',
        html: emailShell(
          'Confirm your ApplyTrackr account',
          'Confirm your email address',
          'Thanks for signing up. Click the button below to confirm your email address and activate your account.',
          'Confirm email address',
          verifyUrl,
          `If you didn't create an ApplyTrackr account, you can safely ignore this email.<br />This link was requested for <strong>${userEmail}</strong>.`,
        ),
      }
    case 'recovery':
      return {
        subject: 'Reset your ApplyTrackr password',
        html: emailShell(
          'Reset your ApplyTrackr password',
          'Reset your password',
          'We received a request to reset the password for your account. Click the button below to choose a new password. This link expires in 1 hour.',
          'Reset password',
          verifyUrl,
          `If you didn't request a password reset, you can safely ignore this email. Your password will not change.<br />This link was requested for <strong>${userEmail}</strong>.`,
        ),
      }
    case 'magiclink':
      return {
        subject: 'Sign in to ApplyTrackr',
        html: emailShell(
          'Sign in to ApplyTrackr',
          'Sign in to your account',
          'Click the button below to sign in. This link expires in 1 hour and can only be used once.',
          'Sign in to ApplyTrackr',
          verifyUrl,
          `If you didn't request this email, you can safely ignore it.<br />This link was requested for <strong>${userEmail}</strong>.`,
        ),
      }
    case 'email_change':
    case 'email_change_new':
      return {
        subject: 'Confirm your new email address',
        html: emailShell(
          'Confirm your new email address',
          'Confirm your new email address',
          `Click the button below to confirm <strong>${userEmail}</strong> as your new email address. This link expires in 1 hour.`,
          'Confirm new email',
          verifyUrl,
          `If you didn't request this change, please secure your account immediately.<br />This link was sent to <strong>${userEmail}</strong>.`,
        ),
      }
    default:
      throw new Error(`Unsupported email_action_type: ${actionType}`)
  }
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: JSON_HEADERS,
    })
  }

  const payload = await req.text()
  const headers = Object.fromEntries(req.headers)
  const base64Secret = hookSecret.replace('v1,whsec_', '')

  let data: HookPayload
  try {
    const wh = new Webhook(base64Secret)
    data = wh.verify(payload, headers) as HookPayload
  } catch (err) {
    console.error('Webhook signature verification failed:', err)
    return new Response(JSON.stringify({ error: 'Invalid signature' }), {
      status: 401,
      headers: JSON_HEADERS,
    })
  }

  const { user, email_data } = data
  const { token_hash, email_action_type, site_url, redirect_to } = email_data

  const verifyUrl = buildVerifyUrl(site_url, token_hash, email_action_type, redirect_to)

  let subject: string
  let html: string
  try {
    ;({ subject, html } = renderEmail(email_action_type, user.email, verifyUrl))
  } catch (err) {
    console.error('Failed to render email:', err)
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 400,
      headers: JSON_HEADERS,
    })
  }

  const { error } = await resend.emails.send({
    from: `ApplyTrackr <${fromEmail}>`,
    to: user.email,
    subject,
    html,
  })

  if (error) {
    console.error('Resend send failed:', error.message, error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: JSON_HEADERS,
    })
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: JSON_HEADERS,
  })
})
