import { Page } from '@playwright/test'

const SUPABASE_URL = 'http://127.0.0.1:54321'
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

export const TEST_EMAIL = 'e2e-test@jobtracker.test'
export const TEST_PASSWORD = 'e2eTest1234'

// Create the test user and return their ID. Idempotent — safe to call in beforeAll.
export async function createTestUser(): Promise<string> {
  // Try sign-up first; if user already exists, fetch their ID via admin API
  const signupRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD, email_confirm: true }),
  })
  const user = await signupRes.json()
  return user.id
}

// Delete all applications belonging to the test user (call in afterEach).
export async function clearTestApplications(userId: string) {
  await fetch(
    `${SUPABASE_URL}/rest/v1/applications?user_id=eq.${userId}`,
    {
      method: 'DELETE',
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
    }
  )
}

// Delete the test user completely (call in afterAll).
export async function deleteTestUser(userId: string) {
  await clearTestApplications(userId)
  await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
    method: 'DELETE',
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  })
}

// Log in via the UI login form.
export async function loginViaUI(page: Page) {
  await page.goto('/login')
  await page.fill('input[type="email"]', TEST_EMAIL)
  await page.fill('input[type="password"]', TEST_PASSWORD)
  await page.click('button[type="submit"]')
  await page.waitForURL('/dashboard', { timeout: 10_000 })
}
