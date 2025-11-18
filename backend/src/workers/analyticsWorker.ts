/**
 * Analytics Ingest Worker
 *
 * Consumes events from the Redis-backed analytics queue and flushes them
 * to ClickHouse in batches with simple retry/backoff. Intended to be run
 * in a separate process (e.g., `ROLE=analytics node dist/workers/analyticsWorker.js`).
 */

import logger from '../utils/logger';
import { QueueName, popQueueItem } from '../queues/queueManager';
import analyticsService from '../services/analyticsService';

type Kind = 'impressions' | 'clicks' | 'revenue';

const BATCH_MAX = parseInt(process.env.ANALYTICS_WORKER_BATCH_MAX || '5000', 10);
const BATCH_TIMEOUT_MS = parseInt(process.env.ANALYTICS_WORKER_BATCH_TIMEOUT_MS || '1000', 10);
const RETRY_MAX = parseInt(process.env.ANALYTICS_WORKER_RETRY_MAX || '3', 10);
const RETRY_BASE_DELAY_MS = parseInt(process.env.ANALYTICS_WORKER_RETRY_BASE_MS || '250', 10);

interface QueueItem {
  kind: Kind;
  events: unknown[];
  publisherId?: string;
  ts?: number;
}

async function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function flush(kind: Kind, batch: unknown[]) {
  let attempt = 0;
  // naive retry with exponential backoff
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      if (kind === 'impressions') await analyticsService.recordImpressions(batch);
      else if (kind === 'clicks') await analyticsService.recordClicks(batch);
      else await analyticsService.recordRevenue(batch);
      return;
    } catch (e) {
      attempt += 1;
      if (attempt > RETRY_MAX) {
        logger.error('[AnalyticsWorker] Exhausted retries flushing batch', { kind, size: batch.length, error: (e as Error).message });
        throw e;
      }
      const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
      logger.warn('[AnalyticsWorker] Flush failed, retrying', { kind, size: batch.length, attempt, delay });
      await sleep(delay);
    }
  }
}

export async function runAnalyticsWorker(): Promise<void> {
  logger.info('[AnalyticsWorker] Starting worker loop');
  const buffers: Record<Kind, unknown[]> = { impressions: [], clicks: [], revenue: [] };
  let lastFlushAt = Date.now();

  async function drain(force = false) {
    const now = Date.now();
    const elapsed = now - lastFlushAt;
    if (!force && elapsed < BATCH_TIMEOUT_MS) return;
    for (const kind of ['impressions', 'clicks', 'revenue'] as Kind[]) {
      const buf = buffers[kind];
      if (buf.length === 0) continue;
      const toSend = buf.splice(0, buf.length);
      try {
        await flush(kind, toSend);
        logger.debug('[AnalyticsWorker] Flushed batch', { kind, size: toSend.length });
      } catch (e) {
        // On terminal failure, log and drop to avoid infinite loop; in real deployments, send to DLQ/alerts
        logger.error('[AnalyticsWorker] Dropping batch after retries', { kind, size: toSend.length, error: (e as Error).message });
      }
    }
    lastFlushAt = now;
  }

  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      const item = (await popQueueItem(QueueName.ANALYTICS_INGEST, 5)) as QueueItem | null;
      if (item && item.kind && Array.isArray(item.events)) {
        const buf = buffers[item.kind];
        buf.push(...item.events);
        if (buf.length >= BATCH_MAX) {
          await drain(true);
        }
      } else {
        // timeout: periodic flush
        await drain(false);
      }
    } catch (e) {
      logger.warn('[AnalyticsWorker] Loop error', { error: (e as Error).message });
      await sleep(250);
    }
  }
}

// Allow running directly via node dist
if (require.main === module) {
  runAnalyticsWorker().catch((e) => {
    logger.error('[AnalyticsWorker] Fatal error', { error: e });
    process.exit(1);
  });
}
