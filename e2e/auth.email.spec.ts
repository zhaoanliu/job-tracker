import { test, expect } from '@playwright/test'
import { SUPABASE_URL, SERVICE_KEY } from './helpers'

const TESTMAIL_API_KEY = process.env.TESTMAIL_API_KEY
const TESTMAIL_NAMESPACE = process.env.TESTMAIL_NAMESPACE
const configured = !!(TESTMAIL_API_KEY && TESTMAIL_NAMESPACE)

function testEmail(tag: string) {
  return `${TESTMAIL_NAMESPACE}.${tag}@inbox.testmail.app`
}

async function fetchEmail(tag: string): Promise<string> {
  const res = await fetch(
    `https://api.testmail.app/api/json?apikey=${TESTMAIL_API_KEY}&namespace=${TESTMAIL_NAMESPACE}&tag=${tag}&livequery=true`
  )
  const data = await res.json()
  if (data.result !== 'success' || !data.emails?.length) {
    throw new Error(`No email received for tag ${tag}: ${JSON.stringify(data)}`)
  }
  return data.emails[0].html as string
}

function extractAuthLink(html: string): string {
  const match = html.match(/href="(https?:\/\/[^"]*supabase[^"]*)"/)
  if (!match) throw new Error('No Supabase auth link found in email')
  return match[1].replace(/&amp;/g, '&')
}

async function deleteUserByEmail(email: string) {
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

test('magic link signs in and reaches dashboard', async ({ page }) => {
  test.skip(!configured, 'TESTMAIL_API_KEY / TESTMAIL_NAMESPACE not configured')
  test.setTimeout(90_000)

  const tag = `magic-${Date.now()}`
  const email = testEmail(tag)

  try {
    await page.goto('/login')
    await page.click('button:has-text("Magic Link")')
    await page.fill('input[type="email"]', email)
    await page.click('button[type="submit"]')
    await expect(page.locator('text=Check your email')).toBeVisible({ timeout: 5_000 })

    const html = await fetchEmail(tag)
    const link = extractAuthLink(html)

    await page.goto(link)
    await page.waitForURL('/dashboard', { timeout: 15_000 })
    await expect(page.locator('nav')).toBeVisible()
  } finally {
    await deleteUserByEmail(email)
  }
})

test('signup confirmation signs in and reaches dashboard', async ({ page }) => {
  test.skip(!configured, 'TESTMAIL_API_KEY / TESTMAIL_NAMESPACE not configured')
  test.setTimeout(90_000)

  const tag = `signup-${Date.now()}`
  const email = testEmail(tag)

  try {
    await page.goto('/login')
    await page.click('button:has-text("Sign Up")')
    await page.fill('input[type="email"]', email)
    await page.fill('input[type="password"]', 'TestPass1234!')
    await page.click('button[type="submit"]')
    await expect(page.locator('text=Account created')).toBeVisible({ timeout: 5_000 })

    const html = await fetchEmail(tag)
    const link = extractAuthLink(html)

    await page.goto(link)
    await page.waitForURL('/dashboard', { timeout: 15_000 })
    await expect(page.locator('nav')).toBeVisible()
  } finally {
    await deleteUserByEmail(email)
  }
})
