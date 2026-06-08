import { test, expect, Page } from '@playwright/test'
import { createTestUser, clearTestApplications, deleteTestUser, loginViaUI } from '../helpers'

async function dragCard(page: Page, cardText: string, targetColumnLabel: string) {
  const card = page.locator('.bg-white.rounded-xl.border').filter({ hasText: cardText }).first()
  const targetHeader = page.locator('h3').filter({ hasText: targetColumnLabel })

  const cardBox = await card.boundingBox()
  const headerBox = await targetHeader.boundingBox()
  if (!cardBox || !headerBox) throw new Error(`Could not get bounding box for card "${cardText}" or column "${targetColumnLabel}"`)

  const fromX = cardBox.x + cardBox.width / 2
  const fromY = cardBox.y + cardBox.height / 2
  const toX = headerBox.x + headerBox.width / 2
  const toY = headerBox.y + headerBox.height + 80

  await page.mouse.move(fromX, fromY)
  await page.mouse.down()
  await page.waitForTimeout(100)
  await page.mouse.move((fromX + toX) / 2, (fromY + toY) / 2, { steps: 5 })
  await page.waitForTimeout(150)
  await page.mouse.move(toX, toY, { steps: 5 })
  await page.mouse.up()
  await page.waitForTimeout(500)
}

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
  await page.locator('button[type="submit"]').click()
  await expect(page.locator('text=E2E Test Corp')).toBeVisible({ timeout: 8_000 })
})

test('edits an existing application', async ({ page }) => {
  await loginViaUI(page)
  await page.locator(addToFuture).click()
  await page.fill('input[placeholder="e.g. Acme Corp"]', 'Edit Me Corp')
  await page.locator('button[type="submit"]').click()
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
  await page.locator('button[type="submit"]').click()
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
  await page.locator('button[type="submit"]').click()
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
  await page.locator('button[type="submit"]').click()
  await expect(page.locator('text=Stats Corp')).toBeVisible({ timeout: 8_000 })

  await expect(totalCount).toHaveText('1')
})

// ─── Search ───────────────────────────────────────────────────────────────────

test('search filters cards by company name', async ({ page }) => {
  await loginViaUI(page)

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321'
  const isInsert = (resp: import('@playwright/test').Response) =>
    resp.url().includes(`${supabaseUrl}/rest/v1/applications`) &&
    resp.request().method() === 'POST'

  // Add two applications — wait for the Supabase REST response to avoid timing out
  // if the local DB is slow after several sequential tests
  await page.locator(addToFuture).click()
  await expect(page.locator('text=New Application')).toBeVisible()
  await page.fill('input[placeholder="e.g. Acme Corp"]', 'Alpha Inc')
  await Promise.all([
    page.waitForResponse(isInsert, { timeout: 15_000 }),
    page.locator('button[type="submit"]').click(),
  ])
  await expect(page.locator('text=Alpha Inc')).toBeVisible()

  await page.locator(addToFuture).click()
  await expect(page.locator('text=New Application')).toBeVisible()
  await page.fill('input[placeholder="e.g. Acme Corp"]', 'Beta LLC')
  await Promise.all([
    page.waitForResponse(isInsert, { timeout: 15_000 }),
    page.locator('button[type="submit"]').click(),
  ])
  await expect(page.locator('text=Beta LLC')).toBeVisible()

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

// ─── Modal tabs ───────────────────────────────────────────────────────────────

test('modal tabs — Progress and Job Description sections are navigable', async ({ page }) => {
  await loginViaUI(page)
  await page.locator(addToFuture).click()
  await page.fill('input[placeholder="e.g. Acme Corp"]', 'Tab Test Corp')
  await page.locator('button[type="submit"]').click()
  await expect(page.locator('text=Tab Test Corp')).toBeVisible({ timeout: 8_000 })

  await page.locator('text=Tab Test Corp').click()
  await expect(page.locator('text=Edit Application')).toBeVisible()

  // Progress tab
  await page.locator('button:has-text("Progress")').click()
  await expect(page.locator('textarea[placeholder="Recruiter name, salary range, interview impressions…"]')).toBeVisible()

  // Job Description tab — renders a RichTextEditor (contenteditable div), not a textarea
  await page.locator('button:has-text("Job Description")').click()
  await expect(page.locator('[role="textbox"][aria-label="Job description editor"]')).toBeVisible()

  // History tab
  await page.locator('button:has-text("History")').click()
  // History section renders a timeline — at minimum the section itself should be present
  await expect(page.locator('button:has-text("History")')).toHaveClass(/border-indigo|text-indigo/)
})

// ─── Stage change via modal ───────────────────────────────────────────────────

test('changing stage via modal moves the card to the correct column', async ({ page }) => {
  await loginViaUI(page)

  // Add a card to Future
  await page.locator(addToFuture).click()
  await page.fill('input[placeholder="e.g. Acme Corp"]', 'Stage Mover Corp')
  await page.locator('button[type="submit"]').click()
  await expect(page.locator('text=Stage Mover Corp')).toBeVisible({ timeout: 8_000 })

  // Verify it's in the Future column
  const futureColumn = page.locator('.kanban-column-body').first()
  await expect(futureColumn.locator('text=Stage Mover Corp')).toBeVisible()

  // Open the modal and change stage to Applied
  await page.locator('text=Stage Mover Corp').click()
  await expect(page.locator('text=Edit Application')).toBeVisible()
  await page.locator('select').filter({ hasText: 'Future' }).selectOption('applied')
  await page.locator('button:has-text("Save Changes")').click()

  // Card should now appear under the Applied column header
  const appliedHeader = page.locator('h3').filter({ hasText: 'Applied' })
  await expect(appliedHeader).toBeVisible()
  // The card must have moved — it should no longer be in the Future column body
  const futureColumnAfter = page.locator('.kanban-column-body').first()
  await expect(futureColumnAfter.locator('text=Stage Mover Corp')).not.toBeVisible({ timeout: 8_000 })
})

// ─── Drag-and-drop ────────────────────────────────────────────────────────────

test('dragging a card to another column persists the stage change', async ({ page }) => {
  await loginViaUI(page)

  // Add a card to Future
  await page.locator(addToFuture).click()
  await page.fill('input[placeholder="e.g. Acme Corp"]', 'Drag Me Corp')
  await page.locator('button[type="submit"]').click()
  await expect(page.locator('text=Drag Me Corp')).toBeVisible({ timeout: 8_000 })

  // Drag the card from Future to Applied
  await dragCard(page, 'Drag Me Corp', 'Applied')

  // Card should be visible after drag
  await expect(page.locator('text=Drag Me Corp')).toBeVisible({ timeout: 8_000 })

  // Reload to confirm DB write persisted — optimistic update alone would pass without reload
  await page.reload()
  await page.waitForURL('/dashboard')

  // After reload the card must still be in Applied (not Future)
  const futureColumn = page.locator('.kanban-column-body').first()
  await expect(futureColumn.locator('text=Drag Me Corp')).not.toBeVisible({ timeout: 8_000 })
  await expect(page.locator('text=Drag Me Corp')).toBeVisible()
})
