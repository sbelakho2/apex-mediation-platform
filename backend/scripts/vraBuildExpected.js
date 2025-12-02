#!/usr/bin/env node
/*
 * VRA Expected Builder CLI (operator tool)
 *
 * Builds recon_expected by joining PG transparency receipts with ClickHouse revenue_events.
 *
 * Usage:
 *   node backend/scripts/vraBuildExpected.js \
 *     --from 2025-11-01T00:00:00Z \
 *     --to   2025-11-02T00:00:00Z \
 *     --limit 10000 \
 *     [--dry-run]
 *
 * Env:
 *   DATABASE_URL=postgresql://user:pass@host:5432/db
 *   CLICKHOUSE_URL=http://localhost:8123 (or CLICKHOUSE_HOST/CLICKHOUSE_PORT)
 */

require('dotenv/config');
// Allow requiring TS modules (force transpile-only CJS to avoid tsconfig NodeNext constraints in ops environments)
try {
  process.env.TS_NODE_TRANSPILE_ONLY = process.env.TS_NODE_TRANSPILE_ONLY || '1';
  process.env.TS_NODE_COMPILER_OPTIONS =
    process.env.TS_NODE_COMPILER_OPTIONS || JSON.stringify({ module: 'CommonJS', moduleResolution: 'Node' });
  require('ts-node/register/transpile-only');
} catch (_) {}

const { Pool } = require('pg');
const { initializeClickHouse, closeClickHouse } = require('../src/utils/clickhouse');
const { buildReconExpected } = require('../src/services/vra/expectedBuilder');
const config = require('../src/config/index').default;

const EXIT = {
  OK: 0,
  WARNINGS: 10,
  ERROR: 20,
};

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
  const limit = args.limit ? Number(args.limit) : undefined;
  const dryRun = toBool(args['dry-run']);
  const force = toBool(args['force']);
  const yes = toBool(args['yes']);

  if (!from || !to) {
    console.error('Missing required args: --from ISO, --to ISO');
    process.exit(EXIT.ERROR);
  }

  // Safety caps — guardrails for operators
  const MAX_WINDOW_MS = 3 * 24 * 60 * 60 * 1000; // 3 days
  const MAX_ROWS = 10000; // per-run soft cap
  try {
    const fromMs = Date.parse(from);
    const toMs = Date.parse(to);
    if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) {
      console.error('Invalid ISO timestamps for --from/--to');
      process.exit(EXIT.ERROR);
    }
    const windowMs = toMs - fromMs;
    if (windowMs > MAX_WINDOW_MS && !(force && yes)) {
      console.error(
        `Refusing to run: window exceeds ${MAX_WINDOW_MS / (24 * 60 * 60 * 1000)} days. Use --force --yes to bypass.`
      );
      process.exit(EXIT.ERROR);
    }
    if (args.limit != null) {
      if (!Number.isFinite(limit) || limit <= 0) {
        console.error('Refusing to run: --limit must be a positive integer');
        process.exit(EXIT.ERROR);
      }
    }
    if (typeof limit === 'number' && limit > MAX_ROWS && !(force && yes)) {
      console.error(
        `Refusing to run: --limit ${limit} exceeds cap ${MAX_ROWS}. Use --force --yes to bypass.`
      );
      process.exit(EXIT.ERROR);
    }
  } catch (_) {
    console.error('Failed to evaluate safety caps for window/limit');
    process.exit(EXIT.ERROR);
  }

  // Postgres
  const databaseUrl = config.databaseUrl || process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('DATABASE_URL is required to connect to Postgres');
    process.exit(EXIT.ERROR);
  }
  const pgPool = new Pool({ connectionString: databaseUrl });

  try {
    await initializeClickHouse();
  } catch (e) {
    console.error('Failed to initialize ClickHouse:', e.message || e);
    await pgPool.end().catch(()=>{});
    process.exit(EXIT.ERROR);
  }

  try {
    const res = await buildReconExpected(pgPool, { from, to, limit }, { dryRun, collectMetrics: true });
    console.log('[VRA Expected] Window:', from, '→', to, 'limit:', limit ?? '(default)');
    console.log('[VRA Expected] Seen:', res.seen, 'Written:', res.written, 'Skipped:', res.skipped, dryRun ? '(dry-run)' : '');

    if (res.seen === 0 || res.written === 0) {
      process.exit(EXIT.WARNINGS);
    }
    process.exit(EXIT.OK);
  } catch (e) {
    console.error('VRA Expected Builder failed:', e && e.stack ? e.stack : String(e));
    process.exit(EXIT.ERROR);
  } finally {
    try { await pgPool.end(); } catch (_) {}
    try { await closeClickHouse(); } catch (_) {}
  }
}

module.exports = { main };

if (require.main === module) {
  main();
}
