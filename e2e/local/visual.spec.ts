import { test, expect } from '@playwright/test'
import { createTestUser, clearTestApplications, deleteTestUser, loginViaUI } from '../helpers'

// Visual regression tests — run via nightly cron with `supabase start`.
//
// Baselines are stored in e2e/local/visual.spec.ts-snapshots/ and MUST be
// regenerated on Linux (same OS as CI) before committing.
//
// HOW TO UPDATE BASELINES (human decision only — never automated):
//   1. Review the diff images in playwright-report/ and confirm the changes are intentional
//   2. npx playwright test e2e/local/visual.spec.ts --update-snapshots
//   3. Commit the updated PNGs in a clearly-labelled standalone commit, e.g.:
//      "test: update visual snapshots for Tailwind v4 style changes"

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

const addToFuture = '[title="Add to Future"]'

test('board — light mode baseline', async ({ page }) => {
  // Navigate first — localStorage is unavailable on about:blank
  await loginViaUI(page)
  await page.evaluate(() => localStorage.setItem('applytrackr-theme', 'light'))
  await page.reload()
  await page.waitForURL('/dashboard')

  await page.locator(addToFuture).click()
  await page.fill('input[placeholder="e.g. Acme Corp"]', 'Visual Test Corp')
  await page.locator('button:has-text("Add Application"), button:has-text("Save")').last().click()
  await expect(page.locator('text=Visual Test Corp')).toBeVisible({ timeout: 8_000 })

  await expect(page).toHaveScreenshot('board-light.png', { maxDiffPixelRatio: 0.02 })
})

test('board — dark mode baseline', async ({ page }) => {
  await loginViaUI(page)
  await page.evaluate(() => localStorage.setItem('applytrackr-theme', 'dark'))
  await page.reload()
  await page.waitForURL('/dashboard')

  await page.locator(addToFuture).click()
  await page.fill('input[placeholder="e.g. Acme Corp"]', 'Visual Test Corp')
  await page.locator('button:has-text("Add Application"), button:has-text("Save")').last().click()
  await expect(page.locator('text=Visual Test Corp')).toBeVisible({ timeout: 8_000 })

  await expect(page).toHaveScreenshot('board-dark.png', { maxDiffPixelRatio: 0.02 })
  await page.evaluate(() => localStorage.removeItem('applytrackr-theme'))
})

test('modal — open state with Details tab', async ({ page }) => {
  await loginViaUI(page)
  await page.evaluate(() => localStorage.setItem('applytrackr-theme', 'light'))
  await page.reload()
  await page.waitForURL('/dashboard')

  await page.locator(addToFuture).click()
  await expect(page.locator('text=New Application')).toBeVisible()

  await expect(page).toHaveScreenshot('modal-open-light.png', { maxDiffPixelRatio: 0.02 })
})
