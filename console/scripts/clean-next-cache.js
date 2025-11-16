#!/usr/bin/env node
const fs = require('fs')
const path = require('path')

const targets = ['.next', '.swc']

function removeDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    return false
  }

  fs.rmSync(dirPath, { recursive: true, force: true })
  console.log(`[clean-next-cache] Removed ${dirPath}`)
  return true
}

const removedAny = targets.map((dir) => path.resolve(process.cwd(), dir)).some(removeDir)

if (!removedAny) {
  console.log('[clean-next-cache] No Next.js or SWC artifacts found. Nothing to do.')
}
