#!/usr/bin/env ts-node
/**
 * Purge old usage records beyond retention window.
 * Default retention: 18 months (configurable via RETENTION_MONTHS).
 * Dry-run by default; set CONFIRM=1 to execute.
 */
import pkg from 'pg';
const { Pool } = pkg;

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://localhost:5432/adtech';
const RETENTION_MONTHS = parseInt(process.env.RETENTION_MONTHS || '18', 10);
const CONFIRM = process.env.CONFIRM === '1' || process.env.CONFIRM === 'true';

async function main() {
  const pool = new Pool({ connectionString: DATABASE_URL });
  try {
    const now = new Date();
    const cutoff = new Date(now.getFullYear(), now.getMonth() - RETENTION_MONTHS, now.getDate());
    console.log(`[purge-old-usage] Retention months: ${RETENTION_MONTHS}`);
    console.log(`[purge-old-usage] Cutoff date: ${cutoff.toISOString()}`);

    const countSql = `SELECT COUNT(1) AS cnt FROM usage_events WHERE created_at < $1`;
    const countRes = await pool.query(countSql, [cutoff.toISOString()]);
    const toDelete = Number(countRes.rows?.[0]?.cnt || 0);
    console.log(`[purge-old-usage] Rows older than cutoff: ${toDelete}`);

    if (!CONFIRM) {
      console.log('[purge-old-usage] Dry-run. Set CONFIRM=1 to execute delete.');
      process.exit(0);
    }

    const deleteSql = `DELETE FROM usage_events WHERE created_at < $1`;
    const res = await pool.query(deleteSql, [cutoff.toISOString()]);
    console.log(`[purge-old-usage] Deleted rows: ${res.rowCount}`);
  } catch (err) {
    console.error('[purge-old-usage] Error:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error('[purge-old-usage] Unhandled error:', e);
  process.exit(1);
});
