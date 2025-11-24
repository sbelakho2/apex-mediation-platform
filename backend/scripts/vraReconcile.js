#!/usr/bin/env node
/*
 * VRA Reconcile & Delta Classification CLI (operator tool)
 *
 * Aggregates expected vs. paid over a time window and emits coarse deltas
 * (timing_lag, underpay) into ClickHouse `recon_deltas` (idempotent by window evidence key).
 *
 * Usage:
 *   node backend/scripts/vraReconcile.js \
 *     --from 2025-11-01T00:00:00Z \
 *     --to   2025-11-02T00:00:00Z \
 *     [--dry-run]
 *
 * Env:
 *   CLICKHOUSE_URL=http://localhost:8123 (or CLICKHOUSE_HOST/CLICKHOUSE_PORT)
 */

require('dotenv/config');
try { require('ts-node/register/transpile-only'); } catch (_) {}

const { initializeClickHouse, closeClickHouse } = require('../src/utils/clickhouse');
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

  if (!from || !to) {
    console.error('Missing required args: --from ISO, --to ISO');
    process.exit(EXIT.ERROR);
  }

  try {
    await initializeClickHouse();
  } catch (e) {
    console.error('Failed to initialize ClickHouse:', e.message || e);
    process.exit(EXIT.ERROR);
  }

  try {
    const res = await reconcileWindow({ from, to, dryRun });
    console.log('[VRA Reconcile] Window:', from, '→', to, dryRun ? '(dry-run)' : '');
    console.log('[VRA Reconcile] Amounts USD:', res.amounts);
    console.log('[VRA Reconcile] Deltas computed:', res.deltas, 'Inserted:', res.inserted);
    if (res.deltas === 0 || res.inserted === 0) {
      process.exit(EXIT.WARNINGS);
    }
    process.exit(EXIT.OK);
  } catch (e) {
    console.error('VRA Reconcile failed:', e && e.stack ? e.stack : String(e));
    process.exit(EXIT.ERROR);
  } finally {
    try { await closeClickHouse(); } catch (_) {}
  }
}

main();
