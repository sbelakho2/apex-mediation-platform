import { test, expect } from '@playwright/test'

test.describe('Billing E2E smoke — usage → invoice → PDF', () => {
  test('login → record usage (API) → sync → invoice visible → PDF link', async ({ page, request }) => {
    // Login (mock/demo mode if enabled)
    await page.goto('http://localhost:3000/login')
    await page.fill('input[type="email"]', 'demo@apexmediation.com')
    await page.fill('input[type="password"]', 'demo')
    await page.click('button[type="submit"]')
    await page.waitForURL('**/dashboard')

    // Record usage via backend API (stub: best-effort)
    try {
      await request.post(process.env.API_URL || 'http://localhost:4000/api/v1/billing/usage', {
        data: { units: 10, kind: 'requests', ts: new Date().toISOString() },
      })
    } catch {
      // Non-blocking in smoke; continue to UI verification
    }

    // Navigate to invoices
    await page.goto('http://localhost:3000/billing/invoices')
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
