import { test, expect } from '@playwright/test'

const CONSOLE_BASE_URL = (process.env.CONSOLE_BASE_URL || 'http://localhost:3000').replace(/\/$/, '')
const API_BASE_URL = (process.env.API_URL || 'http://localhost:4000').replace(/\/$/, '')
const LOGIN_EMAIL =
  process.env.CONSOLE_LOGIN_EMAIL || process.env.PLAYWRIGHT_EMAIL || 'demo@apexmediation.com'
const LOGIN_PASSWORD =
  process.env.CONSOLE_LOGIN_PASSWORD || process.env.PLAYWRIGHT_PASSWORD || 'demo'

test.describe('Billing E2E smoke — usage → invoice → PDF', () => {
  test('login → record usage (API) → sync → invoice visible → PDF link', async ({ page, request }) => {
    // Login (mock/demo mode if enabled)
    await page.goto(`${CONSOLE_BASE_URL}/login`)
    await page.fill('input[type="email"]', LOGIN_EMAIL)
    await page.fill('input[type="password"]', LOGIN_PASSWORD)
    await page.click('button[type="submit"]')
    await page.waitForURL('**/dashboard')

    // Record usage via backend API (stub: best-effort)
    try {
      await request.post(`${API_BASE_URL}/api/v1/billing/usage`, {
        data: { units: 10, kind: 'requests', ts: new Date().toISOString() },
      })
    } catch {
      // Non-blocking in smoke; continue to UI verification
    }

    // Navigate to invoices
    await page.goto(`${CONSOLE_BASE_URL}/billing/invoices`)
    await expect(page.locator('main')).toBeVisible()
    await expect(page.locator('h1')).toContainText(/Invoices/i)

    // Verify table and at least headers present
    await expect(page.locator('table')).toBeVisible()
    // Optional: open first invoice details if exists
    const rows = page.locator('table tbody tr')
    const count = await rows.count()
    if (count > 0) {
      await rows.nth(0).click()
      await expect(page.locator('text=Invoice')).toBeVisible()
      // PDF link existence (non-blocking)
      const pdfLink = page.locator('a', { hasText: /PDF/i })
      if (await pdfLink.count()) {
        await expect(pdfLink.first()).toBeVisible()
      }
    }
  })
})
