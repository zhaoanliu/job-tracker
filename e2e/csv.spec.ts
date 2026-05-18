import { test, expect } from '@playwright/test'
import { createTestUser, clearTestApplications, deleteTestUser, loginViaUI } from './helpers'
import * as path from 'path'
import * as fs from 'fs'
import * as os from 'os'

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

test('exports CSV with correct headers when board is empty', async ({ page }) => {
  await loginViaUI(page)

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('button:has-text("Export"), a:has-text("Export")').first().click(),
  ])

  const filePath = path.join(os.tmpdir(), `export-${Date.now()}.csv`)
  await download.saveAs(filePath)

  const content = fs.readFileSync(filePath, 'utf-8')
  expect(content).toContain('company')
  expect(content).toContain('status')
  expect(content.trim().split('\n').length).toBe(1) // header only

  fs.unlinkSync(filePath)
})

test('exports CSV containing added applications', async ({ page }) => {
  await loginViaUI(page)

  // Add an application first
  const columnAdd = page.locator('.kanban-column').filter({ hasText: 'Future' }).locator('button').first()
  await columnAdd.click()
  await page.fill('input[placeholder="e.g. Acme Corp"]', 'CSV Export Corp')
  await page.locator('button:has-text("Add Application"), button:has-text("Save")').last().click()
  await expect(page.locator('text=CSV Export Corp')).toBeVisible({ timeout: 8_000 })

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('button:has-text("Export"), a:has-text("Export")').first().click(),
  ])

  const filePath = path.join(os.tmpdir(), `export-${Date.now()}.csv`)
  await download.saveAs(filePath)

  const content = fs.readFileSync(filePath, 'utf-8')
  expect(content).toContain('CSV Export Corp')

  fs.unlinkSync(filePath)
})

test('imports CSV and shows cards on the board', async ({ page }) => {
  await loginViaUI(page)

  // Create a minimal CSV file
  const csvContent = [
    'company,role,status,type,priority,location,workmode,date,link,source,referrer,notes,next_step',
    'Import Test Co,Engineer,future,Full-Time,High,Remote,Remote,2026-05-01,,,,,',
  ].join('\n')

  const tmpFile = path.join(os.tmpdir(), `import-test-${Date.now()}.csv`)
  fs.writeFileSync(tmpFile, csvContent)

  // Find file input for import (may be hidden)
  const fileInput = page.locator('input[type="file"]')
  await fileInput.setInputFiles(tmpFile)

  await expect(page.locator('text=Import Test Co')).toBeVisible({ timeout: 10_000 })

  fs.unlinkSync(tmpFile)
})

test('round-trips: export then re-import preserves company names', async ({ page }) => {
  await loginViaUI(page)

  // Add two applications
  for (const name of ['Roundtrip Alpha', 'Roundtrip Beta']) {
    const columnAdd = page.locator('.kanban-column').filter({ hasText: 'Future' }).locator('button').first()
    await columnAdd.click()
    await page.fill('input[placeholder="e.g. Acme Corp"]', name)
    await page.locator('button:has-text("Add Application"), button:has-text("Save")').last().click()
    await expect(page.locator(`text=${name}`)).toBeVisible({ timeout: 8_000 })
  }

  // Export
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('button:has-text("Export"), a:has-text("Export")').first().click(),
  ])
  const filePath = path.join(os.tmpdir(), `roundtrip-${Date.now()}.csv`)
  await download.saveAs(filePath)

  // Clear and re-import
  await clearTestApplications(userId)
  await page.reload()
  await expect(page.locator('text=Roundtrip Alpha')).not.toBeVisible()

  const fileInput = page.locator('input[type="file"]')
  await fileInput.setInputFiles(filePath)

  await expect(page.locator('text=Roundtrip Alpha')).toBeVisible({ timeout: 10_000 })
  await expect(page.locator('text=Roundtrip Beta')).toBeVisible({ timeout: 10_000 })

  fs.unlinkSync(filePath)
})
