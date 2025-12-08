#!/usr/bin/env node
/*
 * Transparency export redaction validator
 * Usage:
 *   node scripts/ops/redaction_validate.js evidence-YYYY-MM-DD/console/transparency-export.json [--out evidence-YYYY-MM-DD/console/transparency-validate.json]
 * Fails (exit 1) if suspected PII is present or required transparency fields are missing.
 */
const fs = require('fs');

function loadJson(path) {
  const txt = fs.readFileSync(path, 'utf8');
  try { return JSON.parse(txt); } catch (e) { throw new Error(`Invalid JSON in ${path}: ${e.message}`); }
}

function isSha256Hex(s) {
  return typeof s === 'string' && /^[a-f0-9]{64}$/i.test(s);
}

function validate(records) {
  const report = { total: records.length, errors: [], warnings: [], sample: {} };
  const piiKeys = [
    'idfa','gaid','advertising_id','adid','aaid','device_id','idfv','android_ad_id','google_ad_id','ifa'
  ];
  const requiredKeys = ['request_id','timestamp','adapter','auction_root','bid_commitment'];

  for (let i = 0; i < records.length; i++) {
    const r = records[i] || {};
    // Check for PII keys
    for (const k of Object.keys(r)) {
      if (piiKeys.includes(k.toLowerCase())) {
        report.errors.push({ index: i, field: k, reason: 'PII key must not be present in transparency exports' });
      }
    }
    // Required keys
    for (const k of requiredKeys) {
      if (!(k in r)) {
        report.errors.push({ index: i, field: k, reason: 'missing required field' });
      }
    }
    // tc_string must not be present in exports (policy: summary booleans only)
    if ('tc_string' in r) {
      report.errors.push({ index: i, field: 'tc_string', reason: 'TCF string must not be exported' });
    }
    // Hash shapes
    if (r.auction_root && !isSha256Hex(r.auction_root)) {
      report.errors.push({ index: i, field: 'auction_root', reason: 'must be sha256 hex(64)' });
    }
    if (r.bid_commitment && !isSha256Hex(r.bid_commitment)) {
      report.errors.push({ index: i, field: 'bid_commitment', reason: 'must be sha256 hex(64)' });
    }
    // Clearing price should be number when present
    if ('clearing_price' in r && typeof r.clearing_price !== 'number') {
      report.errors.push({ index: i, field: 'clearing_price', reason: 'clearing_price must be a number' });
    }
  }
  report.sample = records[0] || {};
  report.ok = report.errors.length === 0;
  return report;
}

function main() {
  const args = process.argv.slice(2);
  if (args.length < 1) {
    console.error('Usage: redaction_validate.js <export.json> [--out <report.json>]');
    process.exit(2);
  }
  const path = args[0];
  const outIdx = args.indexOf('--out');
  const outPath = outIdx >= 0 ? args[outIdx + 1] : null;
  const records = loadJson(path);
  if (!Array.isArray(records)) {
    console.error('Input must be an array of transparency records');
    process.exit(2);
  }
  const report = validate(records);
  const summary = `[validate] records=${report.total} ok=${report.ok} errors=${report.errors.length} warnings=${report.warnings.length}`;
  console.log(summary);
  if (report.errors.length) {
    console.log('[validate] First 5 errors:', report.errors.slice(0, 5));
  }
  if (outPath) {
    fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  }
  process.exit(report.ok ? 0 : 1);
}

main();
