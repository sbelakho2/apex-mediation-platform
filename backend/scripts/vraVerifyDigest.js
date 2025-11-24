#!/usr/bin/env node
/*
 * VRA Proofs Verification CLI (operator tool)
 *
 * Verifies the stored monthly digest by recomputing from daily roots and checking the signature (if public key provided).
 *
 * Usage:
 *   node backend/scripts/vraVerifyDigest.js --month 2025-11
 *
 * Env:
 *   CLICKHOUSE_URL=http://localhost:8123 (or CLICKHOUSE_HOST/CLICKHOUSE_PORT)
 *   PROOFS_SIGNING_PUBLIC_KEY=-----BEGIN PUBLIC KEY----- ... (optional)
 */

require('dotenv/config');
try { require('ts-node/register/transpile-only'); } catch (_) {}

const { initializeClickHouse, closeClickHouse } = require('../src/utils/clickhouse');
const { verifyMonthlyDigest } = require('../src/services/vra/proofsIssuer');

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

async function main() {
  const args = parseArgs(process.argv);
  const month = args.month;

  if (!month || !/^\d{4}-\d{2}$/.test(String(month))) {
    console.error('Provide --month YYYY-MM');
    process.exit(EXIT.ERROR);
  }

  try {
    await initializeClickHouse();
  } catch (e) {
    console.error('Failed to initialize ClickHouse:', e.message || e);
    process.exit(EXIT.ERROR);
  }

  try {
    const res = await verifyMonthlyDigest(String(month));
    if (res.ok) {
      console.log('[VRA Proofs] Verify OK for month', month);
      process.exit(EXIT.OK);
    } else {
      console.warn('[VRA Proofs] Verify FAILED for month', month, 'reason:', res.reason || 'unknown');
      process.exit(EXIT.WARNINGS);
    }
  } catch (e) {
    console.error('VRA Proofs verify failed:', e && e.stack ? e.stack : String(e));
    process.exit(EXIT.ERROR);
  } finally {
    try { await closeClickHouse(); } catch (_) {}
  }
}

main();
