#!/usr/bin/env node
/**
 * Fails if hard-coded hex color values are found in the provided directories.
 * Allowlist: tailwind config files and token definition files.
 * Usage: node quality/lint/no-hardcoded-hex.js website/src [more paths]
 */
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('Usage: node quality/lint/no-hardcoded-hex.js <path> [path2 ...]');
  process.exit(2);
}

const HEX_RE = /#[0-9a-fA-F]{3,8}\b/;
const ALLOWLIST_FILES = new Set([
  'tailwind.config.ts',
  'tailwind.config.js',
  'tokens.ts',
  'tokens.tsx',
]);

const SUPPORTED_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.css', '.scss', '.sass', '.json']);
const violations = [];

function shouldSkip(filePath) {
  const base = path.basename(filePath);
  if (ALLOWLIST_FILES.has(base)) return true;
  // Skip typical build/test artifact dirs
  if (filePath.includes('/.next/') || filePath.includes('/dist/') || filePath.includes('/build/')) return true;
  return false;
}

function scan(filePath) {
  const stat = fs.statSync(filePath);
  if (stat.isDirectory()) {
    for (const entry of fs.readdirSync(filePath)) {
      scan(path.join(filePath, entry));
    }
    return;
  }
  const ext = path.extname(filePath).toLowerCase();
  if (!SUPPORTED_EXTENSIONS.has(ext)) return;
  if (shouldSkip(filePath)) return;

  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split(/\r?\n/);
  lines.forEach((line, idx) => {
    if (HEX_RE.test(line)) {
      violations.push({ file: filePath, line: idx + 1, text: line.trim() });
    }
  });
}

args.forEach(scan);

if (violations.length > 0) {
  console.error('Hard-coded hex color values found. Use Tailwind tokens instead.');
  violations.slice(0, 200).forEach(v => {
    console.error(`${v.file}:${v.line}: ${v.text}`);
  });
  if (violations.length > 200) {
    console.error(`...and ${violations.length - 200} more`);
  }
  process.exit(1);
} else {
  console.log('✅ No hard-coded hex color values found.');
}
