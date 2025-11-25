#!/usr/bin/env node
/*
 * VRA Issue Proofs CLI (operator tool)
 *
 * Manages monthly digest entries in ClickHouse table `proofs_monthly_digest`.
 * Guardrails: validate --month YYYY-MM; exit codes 0 OK, 10 WARNINGS (no-op/dry-run), 20 ERROR.
 *
 * Usage:
 *   node backend/scripts/vraIssueProofs.js \
 *     --month 2025-11 \
 *     [--dry-run]
 */

require('dotenv/config');
try { require('ts-node/register/transpile-only'); } catch (_) {}

const { initializeClickHouse, closeClickHouse, executeQuery, insertBatch } = require('../src/utils/clickhouse');

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

function isMonth(v) {
  return typeof v === 'string' && /^\d{4}-\d{2}$/.test(v);
}

async function main() {
  const args = parseArgs(process.argv);
  const month = args.month;
  const dryRun = toBool(args['dry-run']);

  if (!isMonth(month)) {
    console.error('Invalid or missing --month. Expected format YYYY-MM');
    process.exit(EXIT.ERROR);
  }

  try {
    await initializeClickHouse();
  } catch (e) {
    console.error('Failed to initialize ClickHouse:', e && e.message ? e.message : String(e));
    process.exit(EXIT.ERROR);
  }

  try {
    // Check if a digest already exists for the month
    const rows = await executeQuery(
      'SELECT month, digest FROM proofs_monthly_digest WHERE month = {m:String} LIMIT 1',
      { m: month }
    );

    let action = 'create';
    if (Array.isArray(rows) && rows.length > 0) action = 'update';

    // Simple deterministic placeholder digest for scaffolding; real implementation would compute from daily roots
    const digest = `digest_${month}`;
    const sig = `sig_${month}`;
    const coverage = '0.00';
    const notes = dryRun ? 'dry-run' : '';

    console.log('[VRA Proofs]', action, 'monthly digest for', month, dryRun ? '(dry-run)' : '');

    if (!dryRun) {
      if (action === 'create') {
        await insertBatch('proofs_monthly_digest', [
          { month, digest, sig, coverage_pct: Number(coverage), notes },
        ]);
      } else {
        // ClickHouse has no UPDATE in MergeTree; emulate by re-insert (idempotent semantics are out of scope here)
        await insertBatch('proofs_monthly_digest', [
          { month, digest, sig, coverage_pct: Number(coverage), notes },
        ]);
      }
    }

    // If we are dry-run or created/updated zero rows, return WARNINGS(10); treat insertBatch as success path
    if (dryRun) {
      process.exit(EXIT.WARNINGS);
    }
    process.exit(EXIT.OK);
  } catch (e) {
    console.error('VRA Issue Proofs failed:', e && e.stack ? e.stack : String(e));
    process.exit(EXIT.ERROR);
  } finally {
    try { await closeClickHouse(); } catch (_) {}
  }
}

main();
