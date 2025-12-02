#!/usr/bin/env node
/*
 * VRA Reconcile CLI (operator tool)
 *
 * Computes reconcile deltas for a given window using the Postgres recon tables.
 * Guardrails: max 3-day window unless --force --yes. Exit codes: 0 OK, 10 WARNINGS (no work/dry-run), 20 ERROR.
 *
 * Usage:
 *   node backend/scripts/vraReconcile.js \
 *     --from 2025-11-01T00:00:00Z \
 *     --to   2025-11-02T00:00:00Z \
 *     [--dry-run]
 */

require('dotenv/config');
try { require('ts-node/register/transpile-only'); } catch (_) {}

const { reconcileWindow } = require('../src/services/vra/reconcile');

const EXIT = { OK: 0, WARNINGS: 10, ERROR: 20 };

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const val = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : 'true';
    out[key] = val;
  }
  return out;
}

function toBool(v, def = false) {
  if (v == null) return def;
  const s = String(v).trim().toLowerCase();
  return s === '1' || s === 'true' || s === 'yes' || s === 'on';
}

async function main() {
  const args = parseArgs(process.argv);
  const from = args.from;
  const to = args.to;
  const dryRun = toBool(args['dry-run']);
  const force = toBool(args['force']);
  const yes = toBool(args['yes']);

  if (!from || !to) {
    console.error('Missing required args: --from ISO, --to ISO');
    process.exit(EXIT.ERROR);
  }

  // Safety caps — 3-day window unless --force --yes
  const MAX_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;
  try {
    const fromMs = Date.parse(from);
    const toMs = Date.parse(to);
    if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) {
      console.error('Invalid ISO timestamps for --from/--to');
      process.exit(EXIT.ERROR);
    }
    if (fromMs > toMs) {
      console.error('from must be <= to');
      process.exit(EXIT.ERROR);
    }
    const windowMs = toMs - fromMs;
    if (windowMs > MAX_WINDOW_MS && !(force && yes)) {
      console.error(`Refusing to run: window exceeds ${MAX_WINDOW_MS / (24 * 60 * 60 * 1000)} days. Use --force --yes to bypass.`);
      process.exit(EXIT.ERROR);
    }
  } catch (_) {
    console.error('Failed to evaluate safety caps for window');
    process.exit(EXIT.ERROR);
  }

  try {
    const res = await reconcileWindow({ from, to, dryRun });
    console.log('[VRA Reconcile] Window:', from, '→', to, dryRun ? '(dry-run)' : '');
    console.log('[VRA Reconcile] Deltas:', res.deltas, 'Inserted:', res.inserted);
    if (res.deltas === 0 || res.inserted === 0) {
      process.exit(EXIT.WARNINGS);
    }
    process.exit(EXIT.OK);
  } catch (e) {
    console.error('VRA Reconcile failed:', e && e.stack ? e.stack : String(e));
    process.exit(EXIT.ERROR);
  }
}

module.exports = { main };

if (require.main === module) {
  main();
}
