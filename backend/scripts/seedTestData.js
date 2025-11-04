#!/usr/bin/env node
require('dotenv/config');
const { randomUUID } = require('node:crypto');
const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error('DATABASE_URL environment variable is not configured.');
  process.exit(1);
}

const useSsl = process.env.DATABASE_SSL === 'true';
const poolMax = parseInt(process.env.DATABASE_POOL_MAX || '10', 10);
const idleTimeout = parseInt(process.env.DATABASE_POOL_IDLE_MS || '30000', 10);

const pool = new Pool({
  connectionString,
  ssl: useSsl ? { rejectUnauthorized: false } : undefined,
  max: poolMax,
  idleTimeoutMillis: idleTimeout,
});

const SAMPLE_PUBLISHER_ID = '11111111-1111-1111-1111-111111111111';
const SAMPLE_USER_ID = '22222222-2222-2222-2222-222222222222';
const SAMPLE_APP_ID = '33333333-3333-3333-3333-333333333333';
const SAMPLE_PLACEMENT_ID = '44444444-4444-4444-4444-444444444444';
const SAMPLE_ADAPTER_ID = '55555555-5555-5555-5555-555555555555';

const BCRYPT_SAMPLE_HASH = '$2a$10$1aoCA8DmF5asJ5AZt0.p0uFmjZyeNKPdy61mYsw/ZcEF/rVkXdrWO'; // password123

async function seed() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    await client.query(
      'INSERT INTO publishers (id, company_name) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING',
      [SAMPLE_PUBLISHER_ID, 'Sample Publisher']
    );

    await client.query(
      `INSERT INTO users (id, publisher_id, email, password_hash)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash`,
      [SAMPLE_USER_ID, SAMPLE_PUBLISHER_ID, 'sample@publisher.test', BCRYPT_SAMPLE_HASH]
    );

    await client.query(
      `INSERT INTO apps (id, publisher_id, name, bundle_id, platform)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, bundle_id = EXCLUDED.bundle_id, platform = EXCLUDED.platform`,
      [SAMPLE_APP_ID, SAMPLE_PUBLISHER_ID, 'Sample App', 'com.sample.app', 'ios']
    );

    await client.query(
      `INSERT INTO placements (id, app_id, name, type, status)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, type = EXCLUDED.type, status = EXCLUDED.status`,
      [SAMPLE_PLACEMENT_ID, SAMPLE_APP_ID, 'Main Interstitial', 'interstitial', 'active']
    );

    await client.query(
      `INSERT INTO adapters (id, name, enabled)
       VALUES ($1, $2, $3)
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, enabled = EXCLUDED.enabled`,
      [SAMPLE_ADAPTER_ID, 'Sample Adapter', true]
    );

    await client.query('DELETE FROM revenue_events WHERE publisher_id = $1', [SAMPLE_PUBLISHER_ID]);
    await client.query('DELETE FROM fraud_alerts WHERE publisher_id = $1', [SAMPLE_PUBLISHER_ID]);
    await client.query('DELETE FROM payouts WHERE publisher_id = $1', [SAMPLE_PUBLISHER_ID]);
    await client.query('DELETE FROM payout_settings WHERE publisher_id = $1', [SAMPLE_PUBLISHER_ID]);

    const today = new Date();
    const startDate = new Date(today);
    startDate.setDate(startDate.getDate() - 14);

    for (let i = 0; i < 14; i += 1) {
      const eventDate = new Date(startDate);
      eventDate.setDate(startDate.getDate() + i);

      await client.query(
        `INSERT INTO revenue_events
           (publisher_id, placement_id, adapter_id, impressions, clicks, revenue, event_date)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          SAMPLE_PUBLISHER_ID,
          SAMPLE_PLACEMENT_ID,
          SAMPLE_ADAPTER_ID,
          1000 + i * 50,
          100 + i * 5,
          (50 + i * 2) / 10,
          eventDate,
        ]
      );
    }

    const fraudSamples = [
      { type: 'bot', severity: 'high', details: 'Automated traffic detected' },
      { type: 'spoof', severity: 'medium', details: 'Device spoofing signature mismatch' },
      { type: 'bot', severity: 'medium', details: 'Repeated IP pattern across geo' },
    ];

    for (const sample of fraudSamples) {
      await client.query(
        `INSERT INTO fraud_alerts (publisher_id, type, severity, details)
         VALUES ($1, $2, $3, $4)`,
        [SAMPLE_PUBLISHER_ID, sample.type, sample.severity, sample.details]
      );
    }

    await client.query(
      `INSERT INTO payouts (publisher_id, amount, currency, method, status, scheduled_for, processed_at, reference)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        SAMPLE_PUBLISHER_ID,
        250.75,
        'USD',
        'paypal',
        'paid',
        new Date(today.getFullYear(), today.getMonth() - 1, 25),
        new Date(today.getFullYear(), today.getMonth() - 1, 26),
        `PAY-${randomUUID().split('-')[0]}`,
      ]
    );

    await client.query(
      `INSERT INTO payouts (publisher_id, amount, currency, method, status, scheduled_for, reference)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        SAMPLE_PUBLISHER_ID,
        310.25,
        'USD',
        'wire',
        'pending',
        new Date(today.getFullYear(), today.getMonth(), 28),
        `PAY-${randomUUID().split('-')[0]}`,
      ]
    );

    await client.query(
      `INSERT INTO payout_settings (publisher_id, threshold, method, currency, schedule, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (publisher_id)
       DO UPDATE SET threshold = EXCLUDED.threshold, method = EXCLUDED.method, currency = EXCLUDED.currency, schedule = EXCLUDED.schedule, updated_at = NOW()`,
      [SAMPLE_PUBLISHER_ID, 100, 'paypal', 'USD', 'monthly']
    );

    await client.query('COMMIT');
    console.log('✅ Seed data created successfully.');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Failed to seed database:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch((error) => {
  console.error(error);
  process.exit(1);
});
