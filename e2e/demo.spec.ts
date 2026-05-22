/**
 * ApplyTrackr product demo script.
 *
 * Run against production with human-paced timing:
 *   npx playwright test e2e/demo.spec.ts --config playwright.demo.config.ts
 *
 * Then screen-record the browser window with QuickTime (macOS) or OBS.
 * Total runtime: ~2 minutes of on-screen action.
 *
 * Data safety:
 *  - All existing applications + status_history are snapshotted before the demo.
 *  - Board is wiped to a clean slate for recording.
 *  - Everything is fully restored after the demo finishes (pass or fail).
 */

import { test, expect, Page, Locator } from '@playwright/test'

const DEMO_EMAIL = 'demo@jobtracker.dev'
const DEMO_PASSWORD = 'demo1234'

// ── Helpers ──────────────────────────────────────────────────────────────────

async function wait(page: Page, ms = 1500) {
  await page.waitForTimeout(ms)
}

async function slowType(locator: Locator, text: string, page: Page, delay = 65) {
  await locator.click()
  await locator.fill('')
  await page.keyboard.type(text, { delay })
}

function modalForm(page: Page): Locator {
  return page.locator('form').first()
}

function fieldSelect(form: Locator, labelText: string): Locator {
  return form.locator(`label:has-text("${labelText}")`).locator('..').locator('select')
}

async function fillApplicationForm(
  page: Page,
  fields: {
    company: string
    role?: string
    type?: string
    priority?: string
    location?: string
    workmode?: string
  }
) {
  const form = modalForm(page)

  const companyInput = form.locator('input[placeholder="e.g. Acme Corp"]')
  await highlight(page, companyInput, 350)
  await slowType(companyInput, fields.company, page)
  await wait(page, 300)

  if (fields.role) {
    const roleInput = form.locator('input[placeholder="e.g. Principal Engineer"]')
    await highlight(page, roleInput, 350)
    await slowType(roleInput, fields.role, page)
    await wait(page, 300)
  }
  if (fields.type) {
    const s = fieldSelect(form, 'Type')
    await highlight(page, s, 350)
    await s.selectOption(fields.type)
    await wait(page, 300)
  }
  if (fields.priority) {
    const s = fieldSelect(form, 'Priority')
    await highlight(page, s, 350)
    await s.selectOption(fields.priority)
    await wait(page, 300)
  }
  if (fields.location) {
    const s = fieldSelect(form, 'Location')
    await highlight(page, s, 350)
    await s.selectOption(fields.location)
    await wait(page, 300)
  }
  if (fields.workmode) {
    const s = fieldSelect(form, 'Work Mode')
    await highlight(page, s, 350)
    await s.selectOption(fields.workmode)
    await wait(page, 300)
  }
}

async function dragCard(page: Page, cardText: string, targetColumnLabel: string) {
  const card = page.locator('.bg-white.rounded-xl.border').filter({ hasText: cardText }).first()
  const targetHeader = page.locator('h3').filter({ hasText: targetColumnLabel })

  const cardBox = await card.boundingBox()
  const headerBox = await targetHeader.boundingBox()
  if (!cardBox || !headerBox) return

  const fromX = cardBox.x + cardBox.width / 2
  const fromY = cardBox.y + cardBox.height / 2
  const toX = headerBox.x + headerBox.width / 2
  const toY = headerBox.y + headerBox.height + 80

  await page.mouse.move(fromX, fromY)
  await page.mouse.down()
  await wait(page, 100)
  // Two-leg move so there are two slowMo ticks, making the drag visually slower.
  await page.mouse.move((fromX + toX) / 2, (fromY + toY) / 2, { steps: 5 })
  await wait(page, 150)
  await page.mouse.move(toX, toY, { steps: 5 })
  await page.mouse.up()
  await wait(page, 500)
}

async function applyOutline(locator: Locator) {
  await locator.evaluate(el => {
    const h = el as HTMLElement
    h.style.outline = '2px solid #6366f1'
    h.style.outlineOffset = '3px'
    h.dataset.demoHighlight = '1'   // hex gets normalized to rgb — use a data attr instead
  })
}

// Clear all demo outlines. Uses page.evaluate (not locator.evaluate) so we
// never touch a potentially-detached element after a modal unmounts.
async function clearAllOutlines(page: Page) {
  await page.evaluate(() => {
    document.querySelectorAll<HTMLElement>('[data-demo-highlight]').forEach(el => {
      el.style.outline = ''
      el.style.outlineOffset = ''
      delete el.dataset.demoHighlight
    })
  }).catch(() => {})
}

// Outline an element for pauseMs, then LEAVE the outline on.
// The next highlight()/highlightClick() will clear it at the very start,
// creating a seamless jump — no dark gap between fields.
async function highlight(page: Page, locator: Locator, pauseMs = 500) {
  await clearAllOutlines(page)
  await page.evaluate(() => (document.activeElement as HTMLElement)?.blur())
  await applyOutline(locator)
  await page.waitForTimeout(pauseMs)
}

// Outline an element, pause, click, then clear. Terminal action — always
// clears so the next scene starts clean.
async function highlightClick(page: Page, locator: Locator, pauseMs = 600) {
  await clearAllOutlines(page)
  await page.evaluate(() => (document.activeElement as HTMLElement)?.blur())
  await applyOutline(locator)
  await page.waitForTimeout(pauseMs)
  await locator.click()
  await clearAllOutlines(page)
}

// Show a fixed caption bar at the bottom of the viewport.
// Replaces any existing caption so callers don't need to hide first.
// Captions are naturally destroyed by page navigation — re-inject after
// waitForLoadState when a scene starts on a new page.
async function showCaption(page: Page, text: string) {
  await page.evaluate((caption) => {
    document.getElementById('demo-caption')?.remove()
    const el = document.createElement('div')
    el.id = 'demo-caption'
    el.textContent = caption
    Object.assign(el.style, {
      position: 'fixed',
      bottom: '36px',
      left: '50%',
      transform: 'translateX(-50%)',
      background: 'rgba(15,15,15,0.82)',
      color: '#fff',
      padding: '10px 28px',
      borderRadius: '9999px',
      fontSize: '17px',
      fontWeight: '600',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      letterSpacing: '0.01em',
      zIndex: '99999',
      pointerEvents: 'none',
      backdropFilter: 'blur(6px)',
      whiteSpace: 'nowrap',
      boxShadow: '0 4px 24px rgba(0,0,0,0.35)',
    })
    document.body.appendChild(el)
  }, text)
}

async function hideCaption(page: Page) {
  await page.evaluate(() => document.getElementById('demo-caption')?.remove()).catch(() => {})
}

// ── Main test ────────────────────────────────────────────────────────────────

test('ApplyTrackr product demo', async ({ page }) => {

  // ── Capture Supabase credentials from live outbound requests ─────────────
  let supabaseUrl = ''
  let anonKey = ''
  let accessToken = ''

  await page.route('**/rest/v1/**', async (route) => {
    const req = route.request()
    if (!anonKey) {
      const url = req.url()
      const headers = req.headers()
      supabaseUrl = url.split('/rest/v1/')[0]
      anonKey = headers['apikey'] ?? ''
      accessToken = headers['authorization']?.replace('Bearer ', '') ?? ''
    }
    await route.continue()
  })

  // ── Scene 1: Login ────────────────────────────────────────────────────────
  await page.goto('/login')
  await showCaption(page, 'Signing in to ApplyTrackr')
  await wait(page, 300)

  await page.fill('input[type="email"]', DEMO_EMAIL)
  await wait(page, 100)
  await page.fill('input[type="password"]', DEMO_PASSWORD)
  await wait(page, 150)

  await page.click('button[type="submit"]')
  await page.waitForURL('/dashboard', { timeout: 20_000 })
  await page.waitForLoadState('networkidle')
  await wait(page, 500)

  // ── Snapshot + wipe the board ─────────────────────────────────────────────
  // Saved data is restored in the `test.afterAll`-equivalent finally block below.
  type AppRow = Record<string, unknown>
  type HistoryRow = Record<string, unknown>
  let savedApps: AppRow[] = []
  let savedHistory: HistoryRow[] = []

  const authHeaders = {
    Authorization: `Bearer ${accessToken}`,
    apikey: anonKey,
  }

  if (supabaseUrl && anonKey && accessToken) {
    // Save applications
    const appsResp = await page.request.get(
      `${supabaseUrl}/rest/v1/applications?select=*&order=order.asc`,
      { headers: authHeaders }
    )
    savedApps = await appsResp.json() as AppRow[]

    // Save status_history for all applications (includes user_id needed for re-insert)
    if (savedApps.length > 0) {
      const ids = savedApps.map(a => a.id as string).join(',')
      const histResp = await page.request.get(
        `${supabaseUrl}/rest/v1/status_history?application_id=in.(${ids})&select=*&order=changed_at.asc`,
        { headers: authHeaders }
      )
      savedHistory = await histResp.json() as HistoryRow[]
    }

    // Wipe — status_history cascades automatically
    await page.request.delete(
      `${supabaseUrl}/rest/v1/applications?status=not.is.null`,
      { headers: { ...authHeaders, Prefer: 'return=minimal' } }
    )

    await page.unroute('**/rest/v1/**')
    await page.reload()
    await page.waitForLoadState('networkidle')
  }
  await wait(page, 300)

  // Wrap everything in try/finally so we always restore on failure too.
  try {

    // ── Scene 2: Add "Google" via navbar button ──────────────────────────────
    await showCaption(page, 'Adding a new job application')
    await highlightClick(page, page.locator('nav button:has-text("Add Application")'))
    await expect(page.locator('h2:has-text("New Application")')).toBeVisible()
    await wait(page, 800)

    await fillApplicationForm(page, {
      company: 'Google',
      role: 'Principal Engineer',
      type: 'Principal Engineer',
      priority: 'High',
      location: 'Seattle WA',
      workmode: 'Remote',
    })

    await wait(page, 500)
    await highlightClick(page, modalForm(page).locator('button:has-text("Add Application")'))
    await expect(page.locator('text=Google').first()).toBeVisible({ timeout: 8_000 })
    await wait(page, 2000)

    // ── Scene 3: Add "Amazon" via Applied column + button ────────────────────
    await showCaption(page, 'Adding directly to the Applied column')
    await highlightClick(page, page.locator('[title="Add to Applied"]'))
    await expect(page.locator('h2:has-text("New Application")')).toBeVisible()
    await wait(page, 700)

    await fillApplicationForm(page, {
      company: 'Amazon',
      role: 'Senior Security Engineer',
      type: 'Security Engineer',
      priority: 'Medium',
      location: 'Bellevue WA',
      workmode: 'Hybrid',
    })

    await wait(page, 500)
    await highlightClick(page, modalForm(page).locator('button:has-text("Add Application")'))
    await expect(page.locator('text=Amazon').first()).toBeVisible({ timeout: 8_000 })
    await wait(page, 2000)

    // ── Scene 4: Edit Google — add next step + notes ─────────────────────────
    await showCaption(page, 'Editing an application — next steps & notes')
    await highlightClick(page, page.locator('.bg-white.rounded-xl.border').filter({ hasText: 'Google' }).first())
    await expect(page.locator('h2:has-text("Edit Application")')).toBeVisible()
    await wait(page, 700)

    await highlightClick(page, page.locator('button:has-text("Progress")'), 400)
    await wait(page, 300)

    const form = modalForm(page)
    const nextStepInput = form.locator('input[placeholder*="Follow up"]')
    await highlight(page, nextStepInput, 350)
    await nextStepInput.fill('Prep system design — screen Mon 9am')
    await wait(page, 300)

    const notesTextarea = form.locator('textarea[placeholder*="Recruiter"]')
    await highlight(page, notesTextarea, 350)
    await notesTextarea.fill('Recruiter: Sarah Chen · TC $280k–$340k · 4 rounds')
    await wait(page, 800)

    await highlightClick(page, form.locator('button:has-text("Save Changes")'), 400)
    await wait(page, 1500)

    await expect(
      page.locator('.bg-white.rounded-xl.border').filter({ hasText: 'Google' }).locator('text=Next:').first()
    ).toBeVisible({ timeout: 5_000 })
    await wait(page, 1000)

    // ── Scene 5: Drag Google from Future → Applied ───────────────────────────
    await showCaption(page, 'Drag and drop to move between stages')
    await dragCard(page, 'Google', 'Applied')
    await wait(page, 1500)

    // ── Scene 6: History tab on Google card ──────────────────────────────────
    await showCaption(page, 'Full status history for each application')
    await highlightClick(page, page.locator('.bg-white.rounded-xl.border').filter({ hasText: 'Google' }).first())
    await expect(page.locator('h2:has-text("Edit Application")')).toBeVisible()
    await wait(page, 700)

    await highlightClick(page, page.locator('button:has-text("History")'), 400)
    await wait(page, 2000)

    await page.keyboard.press('Escape')
    await wait(page, 1500)

    // ── Scene 7: Search → open Amazon → promote to Offer → scroll to column ───
    await showCaption(page, 'Search by company, then promote to Offer')
    const searchInput = page.locator('input[placeholder="Search company…"]')
    await highlight(page, searchInput)
    await searchInput.click()
    await page.keyboard.type('Amaz', { delay: 90 })
    await wait(page, 1500)

    // Amazon is the only visible card — open it
    await highlightClick(page, page.locator('.bg-white.rounded-xl.border').filter({ hasText: 'Amazon' }).first())
    await expect(page.locator('h2:has-text("Edit Application")')).toBeVisible()
    await wait(page, 800)

    const stageSelect = fieldSelect(modalForm(page), 'Stage')
    await highlight(page, stageSelect, 400)
    await stageSelect.click()
    await wait(page, 1200)
    await stageSelect.selectOption('offer')
    await wait(page, 500)

    await highlightClick(page, modalForm(page).locator('button:has-text("Save Changes")'))
    await wait(page, 1200)

    // Scroll to Offer column and highlight the Amazon card there
    await page.locator('h3').filter({ hasText: /^Offer$/ }).evaluate(el =>
      el.scrollIntoView({ behavior: 'instant', block: 'nearest', inline: 'center' })
    )
    await wait(page, 800)
    await highlight(page, page.locator('.bg-white.rounded-xl.border').filter({ hasText: 'Amazon' }).first(), 1500)

    // ── Scene 8: Invite a friend ─────────────────────────────────────────────
    // Mock the API so Submit shows the real "Invite sent!" success screen.
    await page.route('**/api/invite', route => route.fulfill({ status: 200, body: '{}', contentType: 'application/json' }))

    await showCaption(page, 'Invite a friend to ApplyTrackr')
    await highlightClick(page, page.locator('button:has-text("Invite")'))
    await expect(page.locator('h2:has-text("Invite a friend")')).toBeVisible()
    await wait(page, 500)

    const inviteDialog = page.locator('h2:has-text("Invite a friend")').locator('../..')
    await highlight(page, inviteDialog.locator('#invite-email'), 350)
    await inviteDialog.locator('#invite-email').fill('alex@example.com')
    await wait(page, 200)
    await highlight(page, inviteDialog.locator('#invite-name'), 350)
    await inviteDialog.locator('#invite-name').fill('Alex')
    await wait(page, 200)
    await highlight(page, inviteDialog.locator('#invite-message'), 350)
    await inviteDialog.locator('#invite-message').fill("Hey, I've been using this to track my job search!")
    await wait(page, 600)
    await highlightClick(page, inviteDialog.locator('button[type="submit"]'))
    await expect(page.locator('text=Invite sent!')).toBeVisible({ timeout: 8_000 })
    await wait(page, 2000)
    await inviteDialog.locator('button:has-text("Close")').click()
    await page.unroute('**/api/invite')
    await wait(page, 800)

    // ── Scene 9: Feedback / Feature request ──────────────────────────────────
    // Mock the API so Submit shows the real "Request submitted!" success screen.
    await page.route('**/api/feature-request', route => route.fulfill({ status: 200, body: '{}', contentType: 'application/json' }))

    await showCaption(page, 'Submit a feature request')
    await highlightClick(page, page.locator('button:has-text("Feedback")'))
    await expect(page.locator('h2:has-text("Request a feature")')).toBeVisible()
    await wait(page, 500)

    const feedbackDialog = page.locator('h2:has-text("Request a feature")').locator('../..')
    await highlight(page, feedbackDialog.locator('#feature-title'), 350)
    await feedbackDialog.locator('#feature-title').fill('Dark mode support')
    await wait(page, 200)
    await highlight(page, feedbackDialog.locator('#feature-desc'), 350)
    await feedbackDialog.locator('#feature-desc').fill('Would love a dark theme for late-night job searching!')
    await wait(page, 600)
    await highlightClick(page, feedbackDialog.locator('button[type="submit"]'))
    await expect(page.locator('text=Request submitted!')).toBeVisible({ timeout: 8_000 })
    await wait(page, 2000)
    await feedbackDialog.locator('button:has-text("Close")').click()
    await page.unroute('**/api/feature-request')
    await wait(page, 800)

    // ── Scene 10: Roadmap ────────────────────────────────────────────────────
    await highlightClick(page, page.locator('a:has-text("Roadmap")'))
    await page.waitForLoadState('networkidle')
    // Caption is destroyed by navigation — re-inject on the new page.
    await showCaption(page, 'Explore the public roadmap')
    await wait(page, 800)
    // Scroll from top to bottom so the viewer can read the roadmap
    await page.evaluate(() => window.scrollTo({ top: 0 }))
    await wait(page, 300)
    await page.evaluate(() =>
      window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' })
    )
    await wait(page, 3500)
    await page.goBack()
    await page.waitForLoadState('networkidle')
    await wait(page, 1200)

    // ── Fin — stop your screen recorder here ─────────────────────────────────

  } finally {

    await hideCaption(page)

    // ── Restore original data ─────────────────────────────────────────────────
    if (supabaseUrl && anonKey && accessToken) {
      // Re-establish auth headers (accessToken captured before unroute)
      const restoreHeaders = {
        Authorization: `Bearer ${accessToken}`,
        apikey: anonKey,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      }

      // Delete demo applications (status_history cascades)
      await page.request.delete(
        `${supabaseUrl}/rest/v1/applications?status=not.is.null`,
        { headers: { Authorization: `Bearer ${accessToken}`, apikey: anonKey, Prefer: 'return=minimal' } }
      )

      // Restore original applications (with original IDs)
      if (savedApps.length > 0) {
        await page.request.post(
          `${supabaseUrl}/rest/v1/applications`,
          { headers: restoreHeaders, data: JSON.stringify(savedApps) }
        )
      }

      // Restore status_history (application_id FK refs now resolve since apps are back)
      if (savedHistory.length > 0) {
        await page.request.post(
          `${supabaseUrl}/rest/v1/status_history`,
          { headers: restoreHeaders, data: JSON.stringify(savedHistory) }
        )
      }
    }
  }
})
