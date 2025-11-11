import { test, expect } from '@playwright/test'

test.describe('Console E2E — smoke', () => {
  test('login page loads', async ({ page, baseURL }) => {
    await page.goto(baseURL || '/')
    // If redirected to login, ensure form is present; otherwise dashboard exists
    if (await page.locator('form [type="email"]').first().isVisible().catch(()=>false)) {
      await expect(page.locator('form')).toBeVisible()
    } else {
      await expect(page.locator('main')).toBeVisible()
    }
  })
})
