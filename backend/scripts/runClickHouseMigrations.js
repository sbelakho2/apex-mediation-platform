#!/usr/bin/env node
require('dotenv/config');
const path = require('node:path');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const crypto = require('node:crypto');
const { createClient } = require('@clickhouse/client');
function resolveClickHouseUrl(){
  if (process.env.CLICKHOUSE_URL) {
    return process.env.CLICKHOUSE_URL;
  }

  const host = (process.env.CLICKHOUSE_HOST || '').trim();
  const port = process.env.CLICKHOUSE_PORT || '8123';

  if (!host) {
    return `http://localhost:${port}`;
  }

  let normalized = host.replace(/\/$/, '');
  if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) {
    normalized = `http://${normalized}`;
  }
  const afterScheme = normalized.split('://')[1] ?? normalized;
  if (!/:[0-9]+$/.test(afterScheme)) {
    normalized = `${normalized}:${port}`;
  }
  return normalized;
}

const CH_URL = resolveClickHouseUrl();
const CH_DB = process.env.CLICKHOUSE_DATABASE || 'apexmediation';

const client = createClient({
  url: CH_URL,
  database: CH_DB,
  username: process.env.CLICKHOUSE_USER || 'default',
  password: process.env.CLICKHOUSE_PASSWORD || '',
  application: 'apexmediation-ch-migrator',
});

const TABLE = 'analytics_schema_migrations';
const DIR = path.resolve(__dirname, '../migrations/clickhouse');

function sha256(txt){ return crypto.createHash('sha256').update(txt).digest('hex'); }

async function ensureTable(){
  await client.exec({
    query: `CREATE TABLE IF NOT EXISTS ${TABLE} (
      version String,
      checksum String,
      direction LowCardinality(String),
      applied_at DateTime DEFAULT now()
    ) ENGINE = MergeTree ORDER BY (version)`,
  });
}

async function getApplied(){
  const r = await client.query({ query: `SELECT version, checksum, direction FROM ${TABLE} FORMAT JSONEachRow`});
  const rows = await r.json();
  const map = new Map();
  for (const row of rows){ map.set(row.version, { checksum: row.checksum, direction: row.direction }); }
  return map;
}

async function listPairs(){
  if (!fs.existsSync(DIR)) return [];
  const files = (await fsp.readdir(DIR)).filter(f=>f.endsWith('.sql'));
  const groups = {};
  for (const f of files){
    const isUp = f.endsWith('.up.sql');
    const isDown = f.endsWith('.down.sql');
    if (!isUp && !isDown) continue;
    const base = f.replace(/\.(up|down)\.sql$/, '');
    groups[base] = groups[base] || { base, up: null, down: null };
    if (isUp) groups[base].up = f; else groups[base].down = f;
  }
  return Object.values(groups).sort((a,b)=> a.base.localeCompare(b.base));
}

async function run(){
  const args = process.argv.slice(2);
  const down = args.includes('--down');
  const allowDown = process.env.ALLOW_CH_DOWN === '1' || process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test';
  if (down && !allowDown){
    console.error('Down CH migrations disabled. Set ALLOW_CH_DOWN=1 to enable.');
    process.exit(2);
  }

  await ensureTable();
  const groups = await listPairs();
  const applied = await getApplied();

  if (down){
    const appliedVersions = groups.map(g=>g.base).filter(v=> applied.has(v)).sort();
    const last = appliedVersions[appliedVersions.length-1];
    if (!last){ console.log('No CH migrations to revert.'); return; }
    const group = groups.find(g=>g.base===last);
    if (!group || !group.down){ console.log(`No CH down migration file for ${last}`); return; }
    const sql = await fsp.readFile(path.join(DIR, group.down), 'utf8');
    console.log(`Reverting CH ${last}...`);
    await client.exec({ query: sql });
    await client.insert({
      table: TABLE,
      values: [{ version: last, checksum: sha256(sql), direction: 'down' }],
      format: 'JSONEachRow',
    });
    console.log(`Reverted CH ${last}`);
    return;
  }

  for (const g of groups){
    if (!g.up) continue;
    if (applied.has(g.base)) continue;
    const sql = await fsp.readFile(path.join(DIR, g.up), 'utf8');
    console.log(`Applying CH ${g.base}...`);
    await client.exec({ query: sql });
    await client.insert({
      table: TABLE,
      values: [{ version: g.base, checksum: sha256(sql), direction: 'up' }],
      format: 'JSONEachRow',
    });
    console.log(`Applied CH ${g.base}`);
  }
  console.log('All CH migrations applied.');
}

run().catch((e)=>{ console.error(e); process.exit(1); });
