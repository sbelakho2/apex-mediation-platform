#!/usr/bin/env node
/*
 * VRA Proofs Issuance CLI (operator tool)
 *
 * Issues daily Merkle roots over receipts referenced by recon_expected and/or a monthly digest.
 *
 * Usage:
 *   node backend/scripts/vraIssueProofs.js --daily 2025-11-01 [--dry-run]
 *   node backend/scripts/vraIssueProofs.js --month 2025-11 [--dry-run]
 *
 * Env:
 *   CLICKHOUSE_URL=http://localhost:8123 (or CLICKHOUSE_HOST/CLICKHOUSE_PORT)
 *   PROOFS_SIGNING_PRIVATE_KEY=-----BEGIN PRIVATE KEY----- ... (optional)
 */

require('dotenv/config');
try { require('ts-node/register/transpile-only'); } catch (_) {}

const { initializeClickHouse, closeClickHouse } = require('../src/utils/clickhouse');
const proofs = require('../src/services/vra/proofsIssuer');

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
  const day = args.daily;
  const month = args.month;
  const dryRun = toBool(args['dry-run']);

  if (!day && !month) {
    console.error('Provide either --daily YYYY-MM-DD or --month YYYY-MM');
    process.exit(EXIT.ERROR);
  }

  try {
    await initializeClickHouse();
  } catch (e) {
    console.error('Failed to initialize ClickHouse:', e.message || e);
    process.exit(EXIT.ERROR);
  }

  try {
    if (day) {
      const res = await proofs.issueDailyRoot(String(day), { dryRun });
      console.log('[VRA Proofs] Daily:', day, 'root:', res.root, 'sig:', res.sig ? res.sig.slice(0, 16) + '…' : '(none)', 'coverage:', res.coveragePct.toFixed(2) + '%', dryRun ? '(dry-run)' : '');
      process.exit(res.root ? EXIT.OK : EXIT.WARNINGS);
    } else {
      const res = await proofs.issueMonthlyDigest(String(month), { dryRun });
      console.log('[VRA Proofs] Month:', month, 'digest:', res.digest, 'sig:', res.sig ? res.sig.slice(0, 16) + '…' : '(none)', 'coverage:', res.coveragePct.toFixed(2) + '%', dryRun ? '(dry-run)' : '');
      process.exit(res.digest ? EXIT.OK : EXIT.WARNINGS);
    }
  } catch (e) {
    console.error('VRA Proofs issuance failed:', e && e.stack ? e.stack : String(e));
    process.exit(EXIT.ERROR);
  } finally {
    try { await closeClickHouse(); } catch (_) {}
  }
}

main();
