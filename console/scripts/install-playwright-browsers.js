#!/usr/bin/env node

const { spawnSync } = require('node:child_process')

const truthy = (value) => ['1', 'true', 'yes', 'on'].includes(String(value ?? '').toLowerCase())

const skipReasons = []

if (truthy(process.env.PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD)) skipReasons.push('PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD')
if (truthy(process.env.CI)) skipReasons.push('CI')
if (truthy(process.env.npm_config_production)) skipReasons.push('npm_config_production')
if (process.env.NODE_ENV === 'production') skipReasons.push('NODE_ENV=production')

if (skipReasons.length > 0) {
  console.log(`[postinstall] Skipping Playwright browser download (${skipReasons.join(', ')})`)
  process.exit(0)
}

const npxCommand = process.platform === 'win32' ? 'npx.cmd' : 'npx'
const args = ['playwright', 'install']

if (process.platform === 'linux' && !truthy(process.env.PLAYWRIGHT_SKIP_SYSTEM_DEPS)) {
  args.push('--with-deps')
}

const result = spawnSync(npxCommand, args, {
  stdio: 'inherit',
})

if (result.status !== 0) {
  console.warn('[postinstall] Playwright install failed; set PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 to bypass this step locally if needed')
}
