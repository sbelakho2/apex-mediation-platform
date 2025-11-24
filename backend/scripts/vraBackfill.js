#!/usr/bin/env node
/*
 * VRA Backfill Orchestrator (shadow‑first, additive)
 *
 * Safely orchestrates pipeline stages across a date window with resumable checkpoints:
 *   ingestion → expected → matching → reconcile → proofs
 *
 * Usage (dry-run default):
 *   node backend/scripts/vraBackfill.js \
 *     --from 2025-11-01T00:00:00Z \
 *     --to   2025-11-03T00:00:00Z \
 *     --step all \
 *     --publisher pub-1 \
 *     --network unity \
 *     --checkpoint logs/vra-backfill-checkpoints.json \
 *     --dry-run true
 *
 * Notes:
 * - This is a safe scaffold. It logs planned work and writes checkpoints. Integration hooks are TODOs that can call
 *   existing CLIs (vraIngestCsv.js, vraBuildExpected.js, vraMatch.js, vraReconcile.js, vraIssueProofs.js) when ready.
 * - Add minimal, deterministic checkpoints so reruns resume instead of duplicating work.
 */

require('dotenv/config');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { spawn } = require('node:child_process');

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

function ensureDirSync(p) {
  try { fs.mkdirSync(p, { recursive: true }); } catch {}
}

async function readCheckpoints(file) {
  try {
    const txt = await fsp.readFile(file, 'utf8');
    return JSON.parse(txt);
  } catch {
    return { runs: {} };
  }
}

async function writeCheckpoints(file, data) {
  ensureDirSync(path.dirname(file));
  await fsp.writeFile(file, JSON.stringify(data, null, 2), 'utf8');
}

function keyForRun({ from, to, publisher, network }) {
  return `${from}..${to}|pub=${publisher || 'any'}|net=${network || 'any'}`;
}

async function main() {
  const args = parseArgs(process.argv);
  const from = args.from;
  const to = args.to;
  const step = (args.step || 'all').toLowerCase();
  const publisher = args.publisher || '';
  const network = args.network || '';
  const dryRun = toBool(args['dry-run'], true);
  const checkpointFile = args.checkpoint || path.resolve(process.cwd(), 'logs', 'vra-backfill-checkpoints.json');

  if (!from || !to) {
    console.error('Missing required args: --from ISO, --to ISO');
    process.exit(EXIT.ERROR);
  }

  const plan = ['ingestion', 'expected', 'matching', 'reconcile', 'proofs'];
  const stages = step === 'all' ? plan : plan.filter(s => s === step);
  if (stages.length === 0) {
    console.error('Invalid --step. Use one of:', plan.join(','), 'or "all"');
    process.exit(EXIT.ERROR);
  }

  const ck = await readCheckpoints(checkpointFile);
  const runKey = keyForRun({ from, to, publisher, network });
  ck.runs[runKey] = ck.runs[runKey] || { stages: {} };

  console.log('[VRA Backfill] Window:', from, '→', to, dryRun ? '(dry-run)' : '');
  if (publisher) console.log('[VRA Backfill] Publisher:', publisher);
  if (network) console.log('[VRA Backfill] Network:', network);
  console.log('[VRA Backfill] Stages:', stages.join(' → '));

  let warnings = 0;

  for (const s of stages) {
    const done = !!ck.runs[runKey].stages[s]?.done;
    if (done) {
      console.log(`[VRA Backfill] Skipping stage "${s}" — checkpoint exists.`);
      continue;
    }
    try {
      switch (s) {
        case 'ingestion':
          console.log('[VRA Backfill] (ingestion) — operator-driven; ensure statements are ingested via vraIngestCsv.js (dry-run first).');
          break;
        case 'expected':
          console.log('[VRA Backfill] (expected) running vraBuildExpected.js for window');
          await runNodeScript(
            path.resolve(__dirname, 'vraBuildExpected.js'),
            ['--from', from, '--to', to].concat(dryRun ? ['--dry-run'] : [])
          );
          break;
        case 'matching':
          console.log('[VRA Backfill] (matching) running vraMatch.js with thresholds');
          await runNodeScript(
            path.resolve(__dirname, 'vraMatch.js'),
            ['--from', from, '--to', to, '--autoThreshold', '0.8', '--minConf', '0.5'].concat(dryRun ? ['--dry-run'] : [])
          );
          break;
        case 'reconcile':
          console.log('[VRA Backfill] (reconcile) running vraReconcile.js for window');
          await runNodeScript(
            path.resolve(__dirname, 'vraReconcile.js'),
            ['--from', from, '--to', to].concat(dryRun ? ['--dry-run'] : [])
          );
          break;
        case 'proofs':
          console.log('[VRA Backfill] (proofs) running monthly digest issuance for the month of --from');
          // Derive YYYY-MM from from
          const month = new Date(from).toISOString().slice(0, 7);
          await runNodeScript(
            path.resolve(__dirname, 'vraIssueProofs.js'),
            ['--month', month].concat(dryRun ? ['--dry-run'] : [])
          );
          break;
        default:
          throw new Error(`Unknown stage: ${s}`);
      }
      ck.runs[runKey].stages[s] = { done: true, at: new Date().toISOString(), dryRun };
      await writeCheckpoints(checkpointFile, ck);
    } catch (e) {
      warnings++;
      console.warn(`[VRA Backfill] Stage "${s}" failed:`, (e && e.message) || e);
      // Leave checkpoint as-is; allow resume.
      break;
    }
  }

  if (warnings > 0) {
    process.exit(EXIT.WARNINGS);
  }
  process.exit(EXIT.OK);
}

function runNodeScript(scriptPath, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath, ...args], {
      stdio: 'inherit',
      env: process.env,
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) return resolve();
      // Consider WARNINGS(10) acceptable for backfill flows to continue
      if (code === 10) return resolve();
      reject(new Error(`${path.basename(scriptPath)} exited with code ${code}`));
    });
  });
}

main().catch((e) => { console.error(e); process.exit(EXIT.ERROR); });
