#!/usr/bin/env node
require('dotenv/config');
const { execFileSync } = require('node:child_process');
const { Client } = require('pg');
const { createClient } = require('@clickhouse/client');

function log(msg){ process.stdout.write(`${msg}\n`); }

async function pgCheck() {
  const cs = process.env.DATABASE_URL;
  if (!cs) throw new Error('DATABASE_URL not set');
  const client = new Client({ connectionString: cs, ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined });
  await client.connect();
  try {
    const tables = ['auctions','bids','auction_wins','signing_keys'];
    for (const t of tables) {
      const r = await client.query(`SELECT to_regclass($1) as exists`, [t]);
      if (!r.rows[0].exists) throw new Error(`Missing table: ${t}`);
    }
  } finally {
    await client.end();
  }
}

async function chCheck() {
  const ch = createClient({
    host: process.env.CLICKHOUSE_URL || 'http://localhost:8123',
    database: process.env.CLICKHOUSE_DATABASE || 'apexmediation',
    username: process.env.CLICKHOUSE_USER || 'default',
    password: process.env.CLICKHOUSE_PASSWORD || '',
    application: 'apex-verify-migrations',
  });
  try {
    // ensure tables exist by simple DESCRIBE
    for (const t of ['impressions','clicks','auction_events']) {
      await ch.query({ query: `DESCRIBE TABLE ${t}` });
    }
  } finally {
    await ch.close();
  }
}

async function main() {
  log('Applying Postgres migrations (up)');
  execFileSync('node', ['scripts/runMigrationsV2.js'], { stdio: 'inherit', cwd: __dirname + '/..' });

  log('Applying ClickHouse migrations (up)');
  execFileSync('node', ['scripts/runClickHouseMigrations.js'], { stdio: 'inherit', cwd: __dirname + '/..' });

  log('Running smoke checks');
  await pgCheck();
  await chCheck();

  log('Reverting last PG migration (down)');
  process.env.ALLOW_MIGRATION_DOWN = process.env.ALLOW_MIGRATION_DOWN || '1';
  execFileSync('node', ['scripts/runMigrationsV2.js','--down'], { stdio: 'inherit', cwd: __dirname + '/..' });

  log('Re-applying PG migrations');
  execFileSync('node', ['scripts/runMigrationsV2.js'], { stdio: 'inherit', cwd: __dirname + '/..' });

  log('Verification complete');
}

main().catch((e)=>{ console.error(e); process.exit(1); });
