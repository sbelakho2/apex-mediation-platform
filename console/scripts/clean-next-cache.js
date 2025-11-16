#!/usr/bin/env node
const fs = require('fs')
const path = require('path')

const target = path.resolve(process.cwd(), '.next')

function removeDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    console.log('[clean-next-cache] No .next artifacts found. Nothing to do.')
    return
  }

  fs.rmSync(dirPath, { recursive: true, force: true })
  console.log(`[clean-next-cache] Removed ${dirPath}`)
}

removeDir(target)
