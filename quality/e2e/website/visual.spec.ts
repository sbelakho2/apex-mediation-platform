import { test, expect } from '@playwright/test'

const routes = ['/', '/pricing', '/documentation', '/about', '/contact']
const viewports = [
  { width: 640, height: 900 },
  { width: 1024, height: 900 },
  { width: 1350, height: 900 },
]

test.describe('Website visual regression — light/dark across breakpoints', () => {
  for (const theme of ['light', 'dark'] as const) {
    test.describe(`${theme} mode`, () => {
      test.use({ colorScheme: theme })
      for (const vp of viewports) {
        test.describe(`${vp.width}x${vp.height}`, () => {
          for (const route of routes) {
            test(`snap ${route}`, async ({ page }) => {
              await page.setViewportSize(vp)
              await page.goto(`http://localhost:3000${route}`)
              await expect(page.locator('body')).toBeVisible()
              // Basic a11y landmarks presence
              await expect(page.locator('header')).toHaveCount(1)
              await expect(page.locator('main')).toHaveCount(1)
              await expect(page.locator('footer')).toHaveCount(1)
              // Full page screenshot for regression
              expect(await page.screenshot({ fullPage: true })).toMatchSnapshot(
                `${theme}-${vp.width}x${vp.height}-${route.replace(/\//g, '_')}.png`
              )
            })
          }
        })
      }
    })
  }
})
