import { test, expect } from '@playwright/test'
import { promises as fs } from 'fs'
import path from 'path'

const routes = ['/', '/pricing', '/documentation', '/about', '/contact']
const viewports = [
  { width: 640, height: 900 },
  { width: 1024, height: 900 },
  { width: 1350, height: 900 },
]

const BASE_URL = (process.env.WEBSITE_BASE_URL || 'http://localhost:3000').replace(/\/$/, '')
const ARTIFACTS_DIR = path.resolve(process.env.WEBSITE_VISUAL_ARTIFACTS_DIR || 'artifacts/website-visual')

test.beforeAll(async () => {
  await fs.mkdir(ARTIFACTS_DIR, { recursive: true })
})

test.describe('Website visual regression — light/dark across breakpoints', () => {
  for (const theme of ['light', 'dark'] as const) {
    test.describe(`${theme} mode`, () => {
      test.use({ colorScheme: theme })
      for (const vp of viewports) {
        test.describe(`${vp.width}x${vp.height}`, () => {
          for (const route of routes) {
            test(`snap ${route}`, async ({ page }, testInfo) => {
              await page.setViewportSize(vp)
              await page.goto(`${BASE_URL}${route}`)
              await expect(page.locator('body')).toBeVisible()
              // Basic a11y landmarks presence
              await expect(page.locator('header')).toHaveCount(1)
              await expect(page.locator('main')).toHaveCount(1)
              await expect(page.locator('footer')).toHaveCount(1)
              // Full page screenshot for regression + artifact storage
              const snapshotName = buildSnapshotName(theme, vp, route)
              const artifactPath = path.join(ARTIFACTS_DIR, snapshotName)
              const screenshot = await page.screenshot({ fullPage: true })
              await fs.writeFile(artifactPath, screenshot)
              await testInfo.attach(`website-visual-${snapshotName}`, {
                path: artifactPath,
                contentType: 'image/png',
              })
              expect(screenshot).toMatchSnapshot(snapshotName)
            })
          }
        })
      }
    })
  }
})

function buildSnapshotName(theme: 'light' | 'dark', viewport: { width: number; height: number }, route: string): string {
  const normalizedRoute = route === '/' ? 'home' : route.replace(/\//g, '_').replace(/^_/, '')
  return `${theme}-${viewport.width}x${viewport.height}-${normalizedRoute}.png`
}
