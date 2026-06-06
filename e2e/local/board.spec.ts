import { test, expect } from '@playwright/test'
import { createTestUser, clearTestApplications, deleteTestUser, loginViaUI } from '../helpers'

let userId: string

test.beforeAll(async () => {
  userId = await createTestUser()
})

test.afterEach(async () => {
  await clearTestApplications(userId)
})

test.afterAll(async () => {
  await deleteTestUser(userId)
})

// Column headers are h3 elements; add buttons use title="Add to {label}"
const addToFuture = '[title="Add to Future"]'

test('dashboard loads the kanban board', async ({ page }) => {
  await loginViaUI(page)
  await expect(page.locator('h3').filter({ hasText: 'Future' })).toBeVisible()
  await expect(page.locator('h3').filter({ hasText: 'Applied' })).toBeVisible()
  await expect(page.locator('h3').filter({ hasText: 'Offer' })).toBeVisible()
})

test('opens "Add Application" modal from the Future column', async ({ page }) => {
  await loginViaUI(page)
  await page.locator(addToFuture).click()
  await expect(page.locator('text=New Application')).toBeVisible()
})

test('adds a new application and sees it on the board', async ({ page }) => {
  await loginViaUI(page)
  await page.locator(addToFuture).click()
  await expect(page.locator('text=New Application')).toBeVisible()
  await page.fill('input[placeholder="e.g. Acme Corp"]', 'E2E Test Corp')
  await page.locator('button:has-text("Add Application"), button:has-text("Save")').last().click()
  await expect(page.locator('text=E2E Test Corp')).toBeVisible({ timeout: 8_000 })
})

test('edits an existing application', async ({ page }) => {
  await loginViaUI(page)
  await page.locator(addToFuture).click()
  await page.fill('input[placeholder="e.g. Acme Corp"]', 'Edit Me Corp')
  await page.locator('button:has-text("Add Application"), button:has-text("Save")').last().click()
  await expect(page.locator('text=Edit Me Corp')).toBeVisible({ timeout: 8_000 })

  await page.locator('text=Edit Me Corp').click()
  await expect(page.locator('text=Edit Application')).toBeVisible()
  const companyInput = page.locator('input[placeholder="e.g. Acme Corp"]')
  await companyInput.clear()
  await companyInput.fill('Renamed Corp')
  await page.locator('button:has-text("Save Changes")').click()
  await expect(page.locator('text=Renamed Corp')).toBeVisible({ timeout: 8_000 })
})

test('deletes an application after confirmation', async ({ page }) => {
  await loginViaUI(page)
  await expect(page.locator(addToFuture)).toBeVisible({ timeout: 5_000 })
  await page.locator(addToFuture).click()
  await page.fill('input[placeholder="e.g. Acme Corp"]', 'Delete Me Corp')
  await page.locator('button:has-text("Add Application"), button:has-text("Save")').last().click()
  await expect(page.locator('text=Delete Me Corp')).toBeVisible({ timeout: 8_000 })

  await page.locator('text=Delete Me Corp').click()
  await expect(page.locator('text=Edit Application')).toBeVisible()
  await page.locator('text=Delete application').click()
  await page.locator('button:has-text("Confirm Delete")').click()
  await expect(page.locator('text=Delete Me Corp')).not.toBeVisible({ timeout: 8_000 })
})

test('stats bar reflects the correct total count', async ({ page }) => {
  await loginViaUI(page)
  // Navigate from the label span to its immediately preceding sibling (the count value)
  await expect(
    page.getByText('Total Applications', { exact: true }).locator('xpath=preceding-sibling::span[1]')
  ).toHaveText('0')
})

test('filter chips narrow visible cards', async ({ page }) => {
  await loginViaUI(page)
  await page.locator(addToFuture).click()
  await page.fill('input[placeholder="e.g. Acme Corp"]', 'High Priority Corp')
  const prioritySelect = page.locator('select[name="priority"], select').filter({ hasText: 'High' }).first()
  if (await prioritySelect.count() > 0) await prioritySelect.selectOption('High')
  await page.locator('button:has-text("Add Application"), button:has-text("Save")').last().click()
  await expect(page.locator('text=High Priority Corp')).toBeVisible({ timeout: 8_000 })

  await page.locator('button:has-text("High")').first().click()
  await expect(page.locator('text=High Priority Corp')).toBeVisible()
})

// ─── Stats bar ───────────────────────────────────────────────────────────────

test('stats bar total increments after adding an application', async ({ page }) => {
  await loginViaUI(page)
  const totalCount = page.getByText('Total Applications', { exact: true }).locator('xpath=preceding-sibling::span[1]')
  await expect(totalCount).toHaveText('0')

  await page.locator(addToFuture).click()
  await page.fill('input[placeholder="e.g. Acme Corp"]', 'Stats Corp')
  await page.locator('button:has-text("Add Application"), button:has-text("Save")').last().click()
  await expect(page.locator('text=Stats Corp')).toBeVisible({ timeout: 8_000 })

  await expect(totalCount).toHaveText('1')
})

// ─── Search ───────────────────────────────────────────────────────────────────

test('search filters cards by company name', async ({ page }) => {
  await loginViaUI(page)

  // Add two applications
  await page.locator(addToFuture).click()
  await page.fill('input[placeholder="e.g. Acme Corp"]', 'Alpha Inc')
  await page.locator('button:has-text("Add Application"), button:has-text("Save")').last().click()
  await expect(page.locator('text=Alpha Inc')).toBeVisible({ timeout: 8_000 })

  await page.locator(addToFuture).click()
  await page.fill('input[placeholder="e.g. Acme Corp"]', 'Beta LLC')
  await page.locator('button:has-text("Add Application"), button:has-text("Save")').last().click()
  await expect(page.locator('text=Beta LLC')).toBeVisible({ timeout: 8_000 })

  // Search for "Alpha" — Beta LLC should disappear
  await page.fill('input[placeholder="Search company…"]', 'Alpha')
  await expect(page.locator('text=Alpha Inc')).toBeVisible()
  await expect(page.locator('text=Beta LLC')).not.toBeVisible()

  // Clear search — both cards visible again
  await page.locator('button[aria-label="Clear search"]').click()
  await expect(page.locator('text=Alpha Inc')).toBeVisible()
  await expect(page.locator('text=Beta LLC')).toBeVisible()
})

// ─── Dark mode ────────────────────────────────────────────────────────────────

test('dark mode toggle switches theme on click', async ({ page }) => {
  await loginViaUI(page)
  // Ensure we start from light mode by clearing stored preference
  await page.evaluate(() => localStorage.removeItem('applytrackr-theme'))
  await page.reload()
  await page.waitForURL('/dashboard')

  const html = page.locator('html')
  // After reload with no stored preference, system default applies; force light baseline
  await page.locator('button[aria-label="Switch to dark mode"], button[aria-label="Switch to light mode"]').click()
  // After one click: if we were in light mode we're now dark, and vice versa
  // Click once more to ensure we're in a known dark state when starting light
  const isDarkAfterFirstClick = await html.evaluate(el => el.classList.contains('dark'))
  if (!isDarkAfterFirstClick) {
    await page.locator('button[aria-label="Switch to dark mode"]').click()
  }
  await expect(html).toHaveClass(/dark/)

  // Toggle back to light
  await page.locator('button[aria-label="Switch to light mode"]').click()
  await expect(html).not.toHaveClass(/dark/)
})

test('dark mode preference persists across page reloads', async ({ page }) => {
  await loginViaUI(page)
  // Clear any existing preference and set to light
  await page.evaluate(() => localStorage.setItem('applytrackr-theme', 'light'))
  await page.reload()
  await page.waitForURL('/dashboard')

  // Enable dark mode
  await page.locator('button[aria-label="Switch to dark mode"]').click()
  await expect(page.locator('html')).toHaveClass(/dark/)

  // Reload — the inline script in <head> re-applies the stored theme before paint
  await page.reload()
  await page.waitForURL('/dashboard')
  await expect(page.locator('html')).toHaveClass(/dark/)

  // Clean up
  await page.evaluate(() => localStorage.removeItem('applytrackr-theme'))
})
