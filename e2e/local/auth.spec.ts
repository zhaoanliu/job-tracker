import { test, expect } from '@playwright/test'
import { createTestUser, deleteTestUser, loginViaUI, SERVICE_KEY, SUPABASE_URL } from '../helpers'

const MAILPIT = 'http://127.0.0.1:54324'

// ── Mailpit helpers ───────────────────────────────────────────────────────────

async function clearMailpit() {
  await fetch(`${MAILPIT}/api/v1/messages`, { method: 'DELETE' })
}

async function fetchLatestEmail(toAddress: string, timeoutMs = 10_000): Promise<string> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const res = await fetch(
      `${MAILPIT}/api/v1/messages?query=${encodeURIComponent(`to:${toAddress}`)}`
    )
    const data = await res.json()
    const msg = data.messages?.[0]
    if (msg) {
      const detail = await fetch(`${MAILPIT}/api/v1/message/${msg.ID}`)
      const body = await detail.json()
      return body.HTML as string
    }
    await new Promise(r => setTimeout(r, 500))
  }
  throw new Error(`No email arrived for ${toAddress} within ${timeoutMs}ms`)
}

function extractAuthLink(html: string): string {
  // Matches both hosted (*.supabase.co) and local (127.0.0.1:54321) auth URLs
  const match = html.match(/href="(http[^"]*\/auth\/v1\/verify[^"]*)"/)
    ?? html.match(/href="(http[^"]*supabase[^"]*)"/i)
  if (!match) throw new Error('No Supabase auth link found in email')
  return match[1].replace(/&amp;/g, '&')
}

// ── Admin helpers ─────────────────────────────────────────────────────────────

async function adminDeleteUserByEmail(email: string) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?page=1&per_page=1000`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  })
  const data = await res.json()
  const user = (data.users ?? []).find((u: { email: string }) => u.email === email)
  if (!user) return
  await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${user.id}`, {
    method: 'DELETE',
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  })
}

// ── Password signup ───────────────────────────────────────────────────────────

test('password signup shows confirmation message', async ({ page }) => {
  const email = `pw-signup-${Date.now()}@example.com`
  try {
    await page.goto('/login')
    await page.click('button:has-text("Sign Up")')
    await page.fill('input[type="email"]', email)
    await page.fill('input[type="password"]', 'TestPass1234!')
    await page.click('button[type="submit"]')
    await expect(page.locator('text=Account created')).toBeVisible({ timeout: 8_000 })
  } finally {
    await adminDeleteUserByEmail(email)
  }
})

// ── Password login ────────────────────────────────────────────────────────────

test('password login reaches dashboard', async ({ page }) => {
  await createTestUser()
  await loginViaUI(page)
  await expect(page).toHaveURL('/dashboard')
})

// ── Magic link ────────────────────────────────────────────────────────────────

test('magic link email arrives and signs in', async ({ page }) => {
  test.setTimeout(30_000)
  const email = `magic-${Date.now()}@example.com`
  await clearMailpit()
  try {
    await page.goto('/login')
    await page.click('button:has-text("Magic Link")')
    await page.fill('input[type="email"]', email)
    await page.click('button[type="submit"]')
    await expect(page.locator('text=Check your email')).toBeVisible({ timeout: 5_000 })

    const html = await fetchLatestEmail(email)
    const link = extractAuthLink(html)

    await page.goto(link)
    await page.waitForURL('/dashboard', { timeout: 15_000 })
    await expect(page.locator('nav')).toBeVisible()
  } finally {
    await adminDeleteUserByEmail(email)
  }
})

// ── Forgot password UI ────────────────────────────────────────────────────────

test('forgot password form is reachable from login', async ({ page }) => {
  await page.goto('/login')
  await page.click('button:has-text("Forgot password?")')
  await expect(page.locator('button[type="submit"]:has-text("Send reset link")')).toBeVisible()
  await expect(page.locator('input[type="password"]')).not.toBeVisible()
})

test('forgot password shows ambiguous success (no email leak)', async ({ page }) => {
  await page.goto('/login')
  await page.click('button:has-text("Forgot password?")')
  await page.fill('input[type="email"]', 'nobody@example.com')
  await page.click('button[type="submit"]')
  await expect(page.locator('text=If that email exists')).toBeVisible({ timeout: 8_000 })
})

test('forgot password Back to sign in returns to login form', async ({ page }) => {
  await page.goto('/login')
  await page.click('button:has-text("Forgot password?")')
  await page.click('button:has-text("Back to sign in")')
  await expect(page.locator('button:has-text("Forgot password?")')).toBeVisible()
  await expect(page.locator('button[type="submit"]:has-text("Sign In")')).toBeVisible()
})

// ── Full password reset round-trip ────────────────────────────────────────────

test('forgot password email arrives, link opens reset page, new password works', async ({ page }) => {
  test.setTimeout(30_000)
  let userId: string
  const email = `reset-${Date.now()}@example.com`
  await clearMailpit()

  try {
    // Create a confirmed user
    const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
      method: 'POST',
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'OldPass1234!', email_confirm: true }),
    })
    const user = await res.json()
    userId = user.id

    // Trigger reset via login UI
    await page.goto('/login')
    await page.click('button:has-text("Forgot password?")')
    await page.fill('input[type="email"]', email)
    await page.click('button[type="submit"]')
    await expect(page.locator('text=If that email exists')).toBeVisible({ timeout: 5_000 })

    // Follow the link from Mailpit
    const html = await fetchLatestEmail(email)
    const link = extractAuthLink(html)
    await page.goto(link)

    // The verify link redirects to site_url (localhost:3000) then to /dashboard
    // Navigate directly to reset-password while session is active
    await page.waitForURL(/localhost:3000/, { timeout: 10_000 })
    await page.goto('/auth/reset-password')
    await expect(page.locator('button[type="submit"]:has-text("Set password")')).toBeVisible({ timeout: 5_000 })

    // Set a new password
    const inputs = page.locator('input[type="password"]')
    await inputs.nth(0).fill('NewPass5678!')
    await inputs.nth(1).fill('NewPass5678!')
    await page.click('button[type="submit"]')
    await page.waitForURL('/dashboard', { timeout: 10_000 })

    // Verify the new password works
    await page.locator('button:has-text("Sign out"), button:has-text("Log out")').click()
    await page.waitForURL(/login/, { timeout: 8_000 })
    await page.fill('input[type="email"]', email)
    await page.fill('input[type="password"]', 'NewPass5678!')
    await page.click('button[type="submit"]')
    await expect(page).toHaveURL('/dashboard', { timeout: 10_000 })
  } finally {
    await adminDeleteUserByEmail(email)
  }
})

// ── Reset password page standalone ───────────────────────────────────────────

test('reset password page validates mismatched passwords', async ({ page }) => {
  userId = await createTestUser()
  await loginViaUI(page)
  await page.goto('/auth/reset-password')
  const inputs = page.locator('input[type="password"]')
  await inputs.nth(0).fill('NewPass5678!')
  await inputs.nth(1).fill('Different1234!')
  await page.click('button[type="submit"]')
  await expect(page.locator('text=Passwords do not match')).toBeVisible()
})

test('reset password page sets new password and redirects', async ({ page }) => {
  userId = await createTestUser()
  await loginViaUI(page)
  await page.goto('/auth/reset-password')
  const inputs = page.locator('input[type="password"]')
  await inputs.nth(0).fill('NewPass5678!')
  await inputs.nth(1).fill('NewPass5678!')
  await page.click('button[type="submit"]')
  await page.waitForURL('/dashboard', { timeout: 10_000 })
  await expect(page.locator('nav')).toBeVisible()
})

let userId: string

test.beforeAll(async () => {
  userId = await createTestUser()
})

test.afterAll(async () => {
  await deleteTestUser(userId)
})
