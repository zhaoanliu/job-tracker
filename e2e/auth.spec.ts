import { test, expect } from '@playwright/test'
import { createTestUser, deleteTestUser, loginViaUI, TEST_EMAIL } from './helpers'

let userId: string

test.beforeAll(async () => {
  userId = await createTestUser()
})

test.afterAll(async () => {
  await deleteTestUser(userId)
})

test('redirects unauthenticated users from /dashboard to /login', async ({ page }) => {
  await page.goto('/dashboard')
  await expect(page).toHaveURL(/\/login/)
})

test('shows the login form', async ({ page }) => {
  await page.goto('/login')
  await expect(page.locator('input[type="email"]')).toBeVisible()
  await expect(page.locator('input[type="password"]')).toBeVisible()
  await expect(page.locator('button[type="submit"]')).toBeVisible()
})

test('shows an error for invalid credentials', async ({ page }) => {
  await page.goto('/login')
  await page.fill('input[type="email"]', 'nobody@example.com')
  await page.fill('input[type="password"]', 'wrongpassword')
  await page.click('button[type="submit"]')
  await expect(page.locator('text=Invalid login credentials').or(page.locator('[role="alert"]'))).toBeVisible({ timeout: 8_000 })
})

test('logs in and reaches dashboard', async ({ page }) => {
  await loginViaUI(page)
  await expect(page).toHaveURL('/dashboard')
  await expect(page.locator('nav')).toBeVisible()
})

test('redirects logged-in user away from /login', async ({ page }) => {
  await loginViaUI(page)
  await page.goto('/login')
  await expect(page).toHaveURL('/dashboard')
})

test('logs out and redirects to login', async ({ page }) => {
  await loginViaUI(page)
  // Find and click the sign-out control (button or link)
  const signOut = page.locator('button:has-text("Sign out"), a:has-text("Sign out"), button:has-text("Log out"), a:has-text("Log out")')
  await signOut.click()
  await expect(page).toHaveURL(/\/login/, { timeout: 10_000 })
})

test('shows the user email in the nav after login', async ({ page }) => {
  await loginViaUI(page)
  await expect(page.locator('nav').getByText(TEST_EMAIL)).toBeVisible()
})
