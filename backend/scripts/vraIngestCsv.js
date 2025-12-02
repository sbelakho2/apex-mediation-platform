#!/usr/bin/env node
/*
 * VRA CSV Ingestion CLI (operator tool)
 *
 * Usage:
 *   node backend/scripts/vraIngestCsv.js \
 *     --network unity \
 *     --schemaVer 1 \
 *     --loadId unity-2025-11-01 \
 *     --reportId unity-report-2025-11-01 \
 *     --file /path/to/unity_report.csv
 *
 * Notes:
 * - Writes to recon_statements_raw and recon_statements_norm tables in Postgres
 * - Safe and additive: does not touch serving/SDK paths; idempotent by (network, load_id)
 */

require('dotenv/config');
// Enable importing TypeScript modules from src
try { require('ts-node/register/transpile-only'); } catch (_) {}

const fs = require('node:fs');
const path = require('node:path');

const { ingestNetworkCsvReport, normalizeNetworkCsvReport } = require('../src/services/vra/ingestion/networkNormalizers');

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const val = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : 'true';
      args[key] = val;
    }
  }
  return args;
}

function toBool(v, def = false) {
  if (v == null) return def;
  const s = String(v).trim().toLowerCase();
  return s === '1' || s === 'true' || s === 'yes' || s === 'on';
}

function detectSeparator(sample) {
  const header = sample.split(/\r?\n/, 1)[0] || '';
  const count = (ch) => (header.match(new RegExp(`\${ch}`, 'g')) || []).length;
  const commas = count(',');
  const semis = count(';');
  const tabs = count('\t');
  if (semis > commas && semis >= tabs) return ';';
  if (tabs > commas && tabs >= semis) return '\t';
  return ','; // default
}

function maybeRewriteSeparator(csv, sep) {
  if (sep === ',' || !sep) return csv;
  // Simple replace; note: this is a heuristic and may not preserve quoted fields with embedded separators.
  // For operator uploads in controlled environments this is acceptable; for broader cases, switch to a robust CSV lib.
  const re = sep === '\t' ? /\t/g : /;/g;
  return csv.replace(re, ',');
}

function antivirusScanPlaceholder(_filePath, _bytes) {
  // Stub: hook for AV scanning (e.g., ClamAV) — currently always passes.
  // Intentionally synchronous stub for simplicity.
  return { ok: true, engine: 'stub', details: 'not scanned (placeholder)' };
}

const EXIT = {
  OK: 0,
  WARNINGS: 10,
  ERROR: 20,
  SCHEMA_DRIFT: 30,
  BLOCKED: 40,
};

async function main() {
  const args = parseArgs(process.argv);
  const required = ['network', 'schemaVer', 'loadId', 'reportId', 'file'];
  const missing = required.filter((k) => !(k in args));
  if (missing.length) {
    console.error('Missing required args:', missing.join(', '));
    process.exit(EXIT.ERROR);
  }

  const network = String(args.network);
  const schemaVer = Number(args.schemaVer);
  const loadId = String(args.loadId);
  const reportId = String(args.reportId);
  const filePath = path.resolve(String(args.file));
  const dryRun = toBool(args['dry-run']);
  const strictMime = toBool(args['strictMime']);
  const maxBytes = Number(args['maxBytes'] || process.env.VRA_INGEST_MAX_BYTES || 50 * 1024 * 1024); // 50 MB default
  const maxRows = Number(args['maxRows'] || process.env.VRA_INGEST_MAX_ROWS || 500000);
  const sepOpt = args['sep'] || 'auto'; // auto | comma | semicolon | tab

  if (!fs.existsSync(filePath)) {
    console.error('File not found:', filePath);
    process.exit(EXIT.ERROR);
  }

  // MIME/type check (best-effort): enforce .csv when strict
  const ext = path.extname(filePath).toLowerCase();
  if (strictMime && ext !== '.csv') {
    console.error('Strict MIME check failed: expected .csv file extension.');
    process.exit(EXIT.ERROR);
  }

  // Size cap
  const stat = fs.statSync(filePath);
  if (stat.size > maxBytes) {
    console.error(`File exceeds maximum allowed size: ${stat.size} bytes > ${maxBytes} bytes`);
    process.exit(EXIT.ERROR);
  }

  // Antivirus placeholder
  const av = antivirusScanPlaceholder(filePath, stat.size);
  if (!av.ok) {
    console.error('Antivirus scan failed:', av.details || 'unknown');
    process.exit(EXIT.ERROR);
  }

  // Load CSV text
  let csv = fs.readFileSync(filePath, 'utf8');

  // Optional separator rewrite
  let sepUsed = ',';
  if (sepOpt === 'auto') {
    sepUsed = detectSeparator(csv);
  } else if (sepOpt === 'semicolon') sepUsed = ';';
  else if (sepOpt === 'tab') sepUsed = '\t';
  else sepUsed = ',';
  if (sepUsed !== ',') {
    console.warn(`[VRA Ingest] Detected separator "${sepUsed === '\t' ? 'TAB' : sepUsed}" — rewriting to comma for parser.`);
    csv = maybeRewriteSeparator(csv, sepUsed);
  }

  // Row cap (rough): count EOLs
  const rowCount = (csv.match(/\r?\n/g) || []).length; // includes header
  if (rowCount - 1 > maxRows) {
    console.error(`Row cap exceeded: ${rowCount - 1} rows > max ${maxRows}`);
    process.exit(EXIT.ERROR);
  }

  try {
    if (dryRun) {
      const out = normalizeNetworkCsvReport({ network, schemaVer, reportId, csv });
      const warnCount = out.errors?.length || 0;
      console.log('[VRA Ingest DRY-RUN] Network:', network);
      console.log('[VRA Ingest DRY-RUN] Rows parsed:', out.rows.length);
      if (warnCount) {
        console.warn('[VRA Ingest DRY-RUN] Parser warnings:', out.errors.slice(0, 5));
        if (warnCount > 5) console.warn(`[VRA Ingest DRY-RUN] ...${warnCount - 5} more`);
      }
      process.exit(warnCount ? EXIT.WARNINGS : EXIT.OK);
    } else {
      const res = await ingestNetworkCsvReport({ network, schemaVer, loadId, reportId, csv });
      if (res.skipped) {
        console.log('[VRA Ingest] Skipped:', res.reason || 'unknown');
        // Map reasons to exit codes
        if (res.reason === 'already_loaded') process.exit(EXIT.OK);
        if (res.reason === 'network_not_allowed') process.exit(EXIT.BLOCKED);
        // parse_no_rows or norm_insert_failed treated as errors
        process.exit(EXIT.ERROR);
      } else {
        console.log('[VRA Ingest] Normalized rows inserted:', res.normalizedRows);
        if (res.errors && res.errors.length) {
          console.warn('[VRA Ingest] Parser warnings:', res.errors.slice(0, 5));
          if (res.errors.length > 5) console.warn(`[VRA Ingest] ...${res.errors.length - 5} more`);
          process.exit(EXIT.WARNINGS);
        }
        process.exit(EXIT.OK);
      }
    }
  } catch (e) {
    console.error('VRA ingestion failed:', e.message);
    process.exitCode = EXIT.ERROR;
  }
}

main();
