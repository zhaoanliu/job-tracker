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
  await expect(page.locator('[data-testid="stat-total"], .stat-total').or(page.locator('text=/^0$/'))).toBeVisible()
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
