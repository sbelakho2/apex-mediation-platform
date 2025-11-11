import { Job } from 'bullmq';
import { insertBatch } from '../../utils/clickhouse';
import logger from '../../utils/logger';
import { analyticsEventsFailedTotal, analyticsEventsWrittenTotal } from '../../utils/prometheus';

type AnalyticsIngestJob = {
  kind: 'imp' | 'click';
  payload: {
    ts: string;
    bid_id: string;
    placement_id: string;
    adapter: string;
    cpm: number;
    ua?: string;
    ip?: string;
  };
};

// In-memory batch buffer (per process). In production, prefer BullMQ job batch with queue.drain patterns.
const buffer: Record<'imp' | 'click', any[]> = { imp: [], click: [] };
const BATCH_SIZE = parseInt(process.env.ANALYTICS_BATCH_SIZE || '1000', 10);
const FLUSH_MS = parseInt(process.env.ANALYTICS_FLUSH_MS || '1000', 10);
let lastFlush = Date.now();

async function flush(kind: 'imp' | 'click') {
  const items = buffer[kind].splice(0, buffer[kind].length);
  if (items.length === 0) return;
  try {
    await insertBatch(kind === 'imp' ? 'impressions' : 'clicks', items);
    try { analyticsEventsWrittenTotal.inc({ kind }, items.length); } catch {}
  } catch (e) {
    try { analyticsEventsFailedTotal.inc({ kind }, items.length); } catch {}
    logger.warn('Analytics batch insert failed', { kind, count: items.length, error: (e as Error).message });
  }
}

let flushTimer: NodeJS.Timeout | null = null;
function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(async () => {
    flushTimer = null;
    await flush('imp');
    await flush('click');
    lastFlush = Date.now();
  }, FLUSH_MS);
}

export async function processAnalyticsIngest(job: Job<AnalyticsIngestJob>) {
  const { kind, payload } = job.data;
  buffer[kind].push(payload);
  // flush on size threshold or time
  if (buffer[kind].length >= BATCH_SIZE || Date.now() - lastFlush >= FLUSH_MS) {
    await flush(kind);
  } else {
    scheduleFlush();
  }
}

export default processAnalyticsIngest;
