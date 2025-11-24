#!/usr/bin/env node
/*
 * VRA Matching Engine CLI (operator tool)
 *
 * Runs the fuzzy/exact matching batch for a given time window by reading
 * `recon_statements_norm` and `recon_expected` from ClickHouse and persisting
 * auto‑accepted matches into `recon_match`.
 *
 * Usage:
 *   node backend/scripts/vraMatch.js \
 *     --from 2025-11-01T00:00:00Z \
 *     --to   2025-11-02T00:00:00Z \
 *     [--limitStatements 100000] \
 *     [--limitExpected 100000] \
 *     [--autoThreshold 0.8] \
 *     [--minConf 0.5] \
 *     [--persistReview true|false] \
 *     [--dry-run]
 *
 * Env:
 *   CLICKHOUSE_URL=http://localhost:8123 (or CLICKHOUSE_HOST/CLICKHOUSE_PORT)
 */

require('dotenv/config');
try { require('ts-node/register/transpile-only'); } catch (_) {}

const { initializeClickHouse, closeClickHouse } = require('../src/utils/clickhouse');
const { runMatchingBatch } = require('../src/services/vra/matchJob');

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
  const limitStatements = args.limitStatements ? Number(args.limitStatements) : undefined;
  const limitExpected = args.limitExpected ? Number(args.limitExpected) : undefined;
  const dryRun = toBool(args['dry-run']);
  const autoThreshold = args.autoThreshold ? Number(args.autoThreshold) : undefined;
  const minConf = args.minConf ? Number(args.minConf) : undefined;
  const persistReview = toBool(args.persistReview, false);

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
    const options = {};
    if (Number.isFinite(autoThreshold)) options.autoAcceptThreshold = autoThreshold;
    if (Number.isFinite(minConf)) options.reviewMinThreshold = minConf;
    const res = await runMatchingBatch({ from, to, limitStatements, limitExpected, dryRun, options, persistReview });
    console.log('[VRA Match] Window:', from, '→', to);
    console.log('[VRA Match] Auto:', res.auto, 'Review:', res.review, 'Unmatched:', res.unmatched);
    console.log('[VRA Match] Inserted:', res.inserted, dryRun ? '(dry-run)' : '');
    if (persistReview) {
      console.log('[VRA Match] Review persisted:', res.reviewPersisted);
    }
    if (res.auto === 0) {
      process.exit(EXIT.WARNINGS);
    }
    process.exit(EXIT.OK);
  } catch (e) {
    console.error('VRA Matching Engine failed:', e && e.stack ? e.stack : String(e));
    process.exit(EXIT.ERROR);
  } finally {
    try { await closeClickHouse(); } catch (_) {}
  }
}

main();
