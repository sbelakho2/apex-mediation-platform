#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const tailwindPath = path.join(ROOT, 'tailwind.config.ts');
const designDocPath = path.join(ROOT, 'DESIGN_STANDARDS.md');

function computeHash(filePath) {
  return crypto
    .createHash('sha256')
    .update(fs.readFileSync(filePath, 'utf8'))
    .digest('hex')
    .slice(0, 12);
}

try {
  const tailwindHash = computeHash(tailwindPath);
  const marker = `Tailwind config sync: ${tailwindHash}`;
  const designDoc = fs.readFileSync(designDocPath, 'utf8');

  if (!designDoc.includes(marker)) {
    console.error(
      `\n[design:verify] DESIGN_STANDARDS.md is missing the sync marker "${marker}".`
    );
    console.error(
      'Add or update the "Tailwind config sync" line near the top of the design standards doc whenever tailwind.config.ts changes.'
    );
    process.exit(1);
  }

  console.log(`[design:verify] Tailwind tokens synced (${tailwindHash}).`);
} catch (error) {
  console.error(`\n[design:verify] Failed to verify Tailwind sync: ${error.message}`);
  process.exit(1);
}
