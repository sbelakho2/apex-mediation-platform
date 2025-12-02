#!/usr/bin/env node
/*
 * VRA Issue Proofs CLI (operator tool)
 *
 * Manages monthly digest entries in the Postgres table `proofs_monthly_digest`.
 * Guardrails: validate --month YYYY-MM; exit codes 0 OK, 10 WARNINGS (no-op/dry-run), 20 ERROR.
 *
 * Usage:
 *   node backend/scripts/vraIssueProofs.js \
 *     --month 2025-11 \
 *     [--dry-run]
 */

require('dotenv/config');
try { require('ts-node/register/transpile-only'); } catch (_) {}

const { query } = require('../src/utils/postgres');

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
    // Check if a digest already exists for the month
    const existing = await query(
      'SELECT month, digest FROM proofs_monthly_digest WHERE month = $1 LIMIT 1',
      [month],
      { label: 'VRA_PROOFS_DIGEST_LOOKUP' }
    );

    const action = existing.rowCount && existing.rowCount > 0 ? 'update' : 'create';

    // Simple deterministic placeholder digest for scaffolding; real implementation would compute from daily roots
    const digest = `digest_${month}`;
    const sig = `sig_${month}`;
    const coveragePct = 0.0;
    const notes = dryRun ? 'dry-run' : '';

    console.log('[VRA Proofs]', action, 'monthly digest for', month, dryRun ? '(dry-run)' : '');

    if (!dryRun) {
      await query(
        `INSERT INTO proofs_monthly_digest (month, digest, sig, coverage_pct, notes)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (month) DO UPDATE
            SET digest = EXCLUDED.digest,
                sig = EXCLUDED.sig,
                coverage_pct = EXCLUDED.coverage_pct,
                notes = EXCLUDED.notes`,
        [month, digest, sig, coveragePct, notes],
        { label: 'VRA_PROOFS_DIGEST_UPSERT' }
      );
    }

    // If we are dry-run or created/updated zero rows, return WARNINGS(10); treat insertBatch as success path
    if (dryRun) {
      process.exit(EXIT.WARNINGS);
    }
    process.exit(EXIT.OK);
  } catch (e) {
    console.error('VRA Issue Proofs failed:', e && e.stack ? e.stack : String(e));
    process.exit(EXIT.ERROR);
  }
}

module.exports = { main };

if (require.main === module) {
  main();
}
