import type { Job } from 'bullmq';
import { PrivacyJob } from '../queueManager';
import logger from '../../utils/logger';
import { Pool } from 'pg';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { Storage } from '@google-cloud/storage';

type ExportProvider = 's3' | 'gcs' | 'local';

const exportProvider = (process.env.PRIVACY_EXPORT_PROVIDER as ExportProvider) || 'local';
const exportBucket = process.env.PRIVACY_EXPORT_BUCKET || 'privacy-exports-dev';
const exportExpiryDays = parseInt(process.env.PRIVACY_EXPIRY_DAYS || '30', 10);

// Minimal Postgres pool for delete operations
const DATABASE_URL = process.env.DATABASE_URL;
const pgPool = DATABASE_URL ? new Pool({ connectionString: DATABASE_URL }) : undefined;

async function performExport(tenantId: string, userId: string, format: 'json' | 'csv' = 'json') {
  // NOTE: Replace with real queries that gather user data across tables.
  const now = new Date().toISOString();
  const artifactName = `privacy-exports/${tenantId}/${userId}/${Date.now()}.${format === 'csv' ? 'csv' : 'jsonl'}`;
  const content = format === 'csv'
    ? `type,timestamp,tenant,user\naccount,${now},${tenantId},${userId}\n`
    : JSON.stringify({ type: 'account', timestamp: now, tenantId, userId }) + '\n';

  switch (exportProvider) {
    case 's3': {
      const s3 = new S3Client({});
      await s3.send(new PutObjectCommand({
        Bucket: exportBucket,
        Key: artifactName,
        Body: content,
        ContentType: format === 'csv' ? 'text/csv' : 'application/json',
        Expires: new Date(Date.now() + exportExpiryDays * 24 * 60 * 60 * 1000),
      }));
      return { provider: 's3', bucket: exportBucket, key: artifactName };
    }
    case 'gcs': {
      const storage = new Storage();
      const bucket = storage.bucket(exportBucket);
      const file = bucket.file(artifactName);
      await file.save(content, { contentType: format === 'csv' ? 'text/csv' : 'application/json' });
      await file.setMetadata({ cacheControl: 'no-cache' });
      return { provider: 'gcs', bucket: exportBucket, key: artifactName };
    }
    default: {
      // local: write under ./logs/exports for developer visibility
      const fs = await import('node:fs/promises');
      const path = await import('node:path');
      const outPath = path.resolve(process.cwd(), 'logs', 'exports');
      await fs.mkdir(outPath, { recursive: true });
      const full = path.join(outPath, artifactName.replace(/^privacy-exports\//, ''));
      await fs.mkdir(path.dirname(full), { recursive: true });
      await fs.writeFile(full, content, 'utf8');
      return { provider: 'local', path: full };
    }
  }
}

async function performDelete(tenantId: string, userId: string) {
  if (!pgPool) {
    logger.warn('GDPR delete requested but DATABASE_URL is not configured; skipping');
    return { deleted: 0 };
  }
  // Minimal example: redact PII in usage_events for this tenant/user
  const client = await pgPool.connect();
  try {
    const res = await client.query(
      `UPDATE usage_events SET user_pii = NULL, email = NULL
       WHERE tenant_id = $1 AND user_id = $2`,
      [tenantId, userId]
    );
    return { deleted: res.rowCount };
  } finally {
    client.release();
  }
}

export async function processPrivacyJob(job: Job<PrivacyJob>) {
  const { kind, tenantId, userId, format } = job.data;
  logger.info('Processing privacy job', { jobId: job.id, kind, tenantId, userId });
  if (kind === 'export') {
    const artifact = await performExport(tenantId, userId!, format || 'json');
    await job.updateProgress(100);
    return { status: 'exported', artifact };
  } else if (kind === 'delete') {
    const result = await performDelete(tenantId, userId!);
    await job.updateProgress(100);
    return { status: 'deleted', result };
  }
  throw new Error(`Unknown privacy job kind: ${kind}`);
}
