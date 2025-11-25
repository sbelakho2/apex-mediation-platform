#!/usr/bin/env node
/*
 * VRA Match CLI (operator tool)
 *
 * Evaluates candidate matches between statements and expected rows for a window.
 * Guardrails: max 3-day window unless --force --yes. Exit codes: 0 OK, 10 WARNINGS (no work/dry-run), 20 ERROR.
 *
 * Usage:
 *   node backend/scripts/vraMatch.js \
 *     --from 2025-11-01T00:00:00Z \
 *     --to   2025-11-02T00:00:00Z \
 *     --autoThreshold 0.8 \
 *     --minConf 0.5 \
 *     [--dry-run]
 */

require('dotenv/config');
try { require('ts-node/register/transpile-only'); } catch (_) {}

// For now, we import the TS matching library and exercise it minimally.
const matching = require('../src/services/vra/matchingEngine');
const { initializeClickHouse, closeClickHouse } = require('../src/utils/clickhouse');

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

function toNum(v) {
  if (v == null) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

async function main() {
  const args = parseArgs(process.argv);
  const from = args.from;
  const to = args.to;
  const autoThreshold = toNum(args.autoThreshold) ?? 0.8;
  const minConf = toNum(args.minConf) ?? 0.5;
  const dryRun = toBool(args['dry-run']);
  const force = toBool(args['force']);
  const yes = toBool(args['yes']);

  if (!from || !to) {
    console.error('Missing required args: --from ISO, --to ISO');
    process.exit(EXIT.ERROR);
  }
  // Basic numeric validation
  if (autoThreshold < 0 || autoThreshold > 1 || minConf < 0 || minConf > 1) {
    console.error('--autoThreshold and --minConf must be within [0,1]');
    process.exit(EXIT.ERROR);
  }

  // Guardrails
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
    await initializeClickHouse();
  } catch (e) {
    console.error('Failed to initialize ClickHouse:', e && e.message ? e.message : String(e));
    process.exit(EXIT.ERROR);
  }

  try {
    // Placeholder: exercise scoring with empty arrays to validate CLI plumbing + thresholds.
    const matches = matching.matchStatementsToExpected([], [], {
      timeWindowSec: 3600,
      autoThreshold,
      minConfidence: minConf,
    });

    const auto = matches.auto?.length || 0;
    const review = matches.review?.length || 0;
    const unmatched = matches.unmatched?.length || 0;

    console.log('[VRA Match] Window:', from, '→', to, dryRun ? '(dry-run)' : '');
    console.log('[VRA Match] auto:', auto, 'review:', review, 'unmatched:', unmatched);

    if (auto + review === 0) {
      process.exit(EXIT.WARNINGS);
    }
    process.exit(EXIT.OK);
  } catch (e) {
    console.error('VRA Match failed:', e && e.stack ? e.stack : String(e));
    process.exit(EXIT.ERROR);
  } finally {
    try { await closeClickHouse(); } catch (_) {}
  }
}

main();
