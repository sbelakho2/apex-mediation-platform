#!/usr/bin/env node
const fs = require('fs')
const path = require('path')

const manifestPath = path.resolve(process.cwd(), '.next/prerender-manifest.json')

if (!fs.existsSync(manifestPath)) {
  console.log('[check-prerender-leaks] No prerender manifest detected. Skipping secret scan.')
  process.exit(0)
}

const manifestContents = fs.readFileSync(manifestPath, 'utf8')
const sensitiveEnvEntries = Object.entries(process.env)
  .filter(([key, value]) => {
    if (!value || typeof value !== 'string') return false
    return /(SECRET|TOKEN|PASSWORD|KEY|PRIVATE)/i.test(key) && !key.startsWith('NEXT_PUBLIC')
  })

const leakedKeys = sensitiveEnvEntries
  .filter(([key, value]) => Boolean(value) && manifestContents.includes(value))
  .map(([key]) => key)

if (leakedKeys.length > 0) {
  console.error('[check-prerender-leaks] Sensitive environment values detected in .next/prerender-manifest.json:')
  leakedKeys.forEach((key) => console.error(`  - ${key}`))
  console.error('Remove the leaked manifest and re-run the build after auditing your environment variables.')
  process.exit(1)
}

console.log('[check-prerender-leaks] No sensitive environment values detected inside the prerender manifest.')
