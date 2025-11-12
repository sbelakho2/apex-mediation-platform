/*
 * Capture full-page screenshots for Website routes across themes and viewports.
 * Usage:
 *   NODE_ENV=production node quality/tools/capture-website-screenshots.js
 * Requires: `playwright` package and a running Website at WEBSITE_BASE_URL (default http://localhost:3000)
 */
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const { chromium, firefox, webkit } = require('playwright');

async function ensureDir(dir) {
  await fs.promises.mkdir(dir, { recursive: true });
}

async function capture(browserType, baseUrl, outDir, routes, viewports, themes) {
  const browser = await browserType.launch();
  try {
    for (const theme of themes) {
      for (const vp of viewports) {
        const ctx = await browser.newContext({ colorScheme: theme, viewport: vp });
        const page = await ctx.newPage();
        for (const route of routes) {
          const url = `${baseUrl}${route}`;
          await page.goto(url, { waitUntil: 'networkidle' });
          // Basic landmark assertions (best-effort; non-fatal)
          try {
            await page.waitForSelector('header', { timeout: 3000 });
            await page.waitForSelector('main', { timeout: 3000 });
            await page.waitForSelector('footer', { timeout: 3000 });
          } catch {}
          const routeSlug = route.replace(/\//g, '_') || '_';
          const browserName = browserType.name();
          const filePath = path.join(outDir, `${browserName}-${theme}-${vp.width}x${vp.height}-${routeSlug}.png`);
          await page.screenshot({ fullPage: true, path: filePath });
          console.log(`✅ Saved ${filePath}`);
        }
        await ctx.close();
      }
    }
  } finally {
    await browser.close();
  }
}

(async () => {
  const baseUrl = process.env.WEBSITE_BASE_URL || 'http://localhost:3000';
  const customOut = process.env.OUT_DIR; // optional
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outDir = customOut || path.join(process.cwd(), 'artifacts', 'website-screenshots', timestamp);
  await ensureDir(outDir);

  // Routes can be overridden via env:
  // - ROUTES='["/","/pricing"]' (JSON array)
  // - or ROUTES='/,/pricing,/documentation' (comma-separated)
  let routes = ['/', '/pricing', '/documentation', '/about', '/contact'];
  if (process.env.ROUTES) {
    try {
      routes = JSON.parse(process.env.ROUTES);
    } catch {
      routes = String(process.env.ROUTES)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    }
  }
  const viewports = [
    { width: 640, height: 900 },
    { width: 1024, height: 900 },
    { width: 1350, height: 900 },
  ];
  const themes = ['light', 'dark'];

  // Default to Chromium only for speed; set BROWSERS=all to include firefox and webkit
  const targets = process.env.BROWSERS === 'all' ? [chromium, firefox, webkit] : [chromium];

  for (const bt of targets) {
    await capture(bt, baseUrl, outDir, routes, viewports, themes);
  }

  console.log(`\nAll screenshots saved under: ${outDir}`);
})();
