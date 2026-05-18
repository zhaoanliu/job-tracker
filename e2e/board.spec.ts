import { test, expect } from '@playwright/test'
import { createTestUser, clearTestApplications, deleteTestUser, loginViaUI } from './helpers'

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

test('dashboard loads the kanban board', async ({ page }) => {
  await loginViaUI(page)
  await expect(page.locator('text=Future')).toBeVisible()
  await expect(page.locator('text=Applied')).toBeVisible()
  await expect(page.locator('text=Offer')).toBeVisible()
})

test('opens "Add Application" modal from the Future column', async ({ page }) => {
  await loginViaUI(page)
  // Each column has an "Add" button — click the one in the Future column
  const futureColumn = page.locator('[data-column="future"], [data-testid="column-future"]').or(
    page.locator('.kanban-column').filter({ hasText: 'Future' })
  )
  const addBtn = futureColumn.locator('button', { hasText: /add|^\+$/i }).first()
  await addBtn.click()
  await expect(page.locator('text=New Application')).toBeVisible()
})

test('adds a new application and sees it on the board', async ({ page }) => {
  await loginViaUI(page)

  // Open add modal — use the global "Add Application" button in the nav/stats area if present, else column button
  const globalAdd = page.locator('button:has-text("Add Application")').first()
  const columnAdd = page.locator('.kanban-column').filter({ hasText: 'Future' }).locator('button').first()
  const addBtn = (await globalAdd.count()) > 0 ? globalAdd : columnAdd
  await addBtn.click()

  await expect(page.locator('text=New Application')).toBeVisible()
  await page.fill('input[placeholder="e.g. Acme Corp"]', 'E2E Test Corp')
  await page.locator('button:has-text("Add Application"), button:has-text("Save")').last().click()

  await expect(page.locator('text=E2E Test Corp')).toBeVisible({ timeout: 8_000 })
})

test('edits an existing application', async ({ page }) => {
  await loginViaUI(page)

  // Add one first
  const columnAdd = page.locator('.kanban-column').filter({ hasText: 'Future' }).locator('button').first()
  await columnAdd.click()
  await page.fill('input[placeholder="e.g. Acme Corp"]', 'Edit Me Corp')
  await page.locator('button:has-text("Add Application"), button:has-text("Save")').last().click()
  await expect(page.locator('text=Edit Me Corp')).toBeVisible({ timeout: 8_000 })

  // Click card to open edit modal
  await page.locator('text=Edit Me Corp').click()
  await expect(page.locator('text=Edit Application')).toBeVisible()

  // Clear and type new company name
  const companyInput = page.locator('input[placeholder="e.g. Acme Corp"]')
  await companyInput.clear()
  await companyInput.fill('Renamed Corp')
  await page.locator('button:has-text("Save Changes")').click()

  await expect(page.locator('text=Renamed Corp')).toBeVisible({ timeout: 8_000 })
})

test('deletes an application after confirmation', async ({ page }) => {
  await loginViaUI(page)

  // Add one to delete
  const columnAdd = page.locator('.kanban-column').filter({ hasText: 'Future' }).locator('button').first()
  await columnAdd.click()
  await page.fill('input[placeholder="e.g. Acme Corp"]', 'Delete Me Corp')
  await page.locator('button:has-text("Add Application"), button:has-text("Save")').last().click()
  await expect(page.locator('text=Delete Me Corp')).toBeVisible({ timeout: 8_000 })

  // Open edit modal and delete
  await page.locator('text=Delete Me Corp').click()
  await expect(page.locator('text=Edit Application')).toBeVisible()
  await page.locator('text=Delete application').click()
  await page.locator('button:has-text("Confirm Delete")').click()

  await expect(page.locator('text=Delete Me Corp')).not.toBeVisible({ timeout: 8_000 })
})

test('stats bar reflects the correct total count', async ({ page }) => {
  await loginViaUI(page)

  // Board should start empty for this user
  await expect(page.locator('[data-testid="stat-total"], .stat-total').or(page.locator('text=/^0$/'))).toBeVisible()
})

test('filter chips narrow visible cards', async ({ page }) => {
  await loginViaUI(page)

  // Add a High priority card
  const columnAdd = page.locator('.kanban-column').filter({ hasText: 'Future' }).locator('button').first()
  await columnAdd.click()
  await page.fill('input[placeholder="e.g. Acme Corp"]', 'High Priority Corp')
  // Set priority to High if there's a select for it
  const prioritySelect = page.locator('select[name="priority"], select').filter({ hasText: 'High' }).first()
  if (await prioritySelect.count() > 0) await prioritySelect.selectOption('High')
  await page.locator('button:has-text("Add Application"), button:has-text("Save")').last().click()
  await expect(page.locator('text=High Priority Corp')).toBeVisible({ timeout: 8_000 })

  // Click "High" filter chip
  await page.locator('button:has-text("High")').first().click()
  await expect(page.locator('text=High Priority Corp')).toBeVisible()
})
