/**
 * Playwright config for demo recordings.
 *
 * Usage:
 *   npx playwright test e2e/demo.spec.ts --config playwright.demo.config.ts
 *
 * The browser window opens headed (visible) with slowMo so all interactions
 * look deliberate on screen. Target is the live production site.
 */

import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  retries: 0,
  timeout: 300_000,
  reporter: [['list']],

  use: {
    baseURL: 'https://applytrackr.app',
    headless: false,
    launchOptions: { slowMo: 250 },
    viewport: { width: 1440, height: 900 },
    trace: 'off',
    screenshot: 'off',
  },

  projects: [
    { name: 'demo-chrome', use: { ...devices['Desktop Chrome'] } },
  ],

  // No webServer — targets production directly.
})
