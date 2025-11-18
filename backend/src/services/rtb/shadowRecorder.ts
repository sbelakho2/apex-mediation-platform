import { ExperimentArm, ExperimentMode } from '../../types/migration';
import { query } from '../../utils/postgres';
import logger from '../../utils/logger';

export type OutcomeStatus = 'win' | 'no_fill' | 'error' | 'skipped';

export interface CandidateBidSnapshot {
  adapter: string;
  status: 'bid' | 'nobid';
  cpm?: number;
  latencyMs?: number;
  reason?: string;
}

export interface ShadowOutcomeRecord {
  experimentId: string;
  requestId: string;
  placementId?: string | null;
  arm: ExperimentArm;
  mode: ExperimentMode;
  status: OutcomeStatus;
  adapterName?: string;
  adapterId?: string;
  bidCpm?: number;
  currency?: string;
  latencyMs?: number;
  mirrorPercent?: number;
  bids?: CandidateBidSnapshot[];
  metadata?: Record<string, unknown>;
  errorReason?: string;
}

// Simple batching queue with size/time flush and payload size limits
type PendingRow = [
  string, // experiment_id
  string, // request_id
  string | null, // placement_id
  string, // arm
  string, // mode
  string, // status
  string | null, // adapter_name
  string | null, // adapter_id
  number | null, // bid_cpm
  string, // currency
  number | null, // latency_ms
  number | null, // mirror_percent
  string, // bids json
  string, // metadata json
  string | null // error_reason
];

const queue: PendingRow[] = [];
let flushing = false;
let timer: NodeJS.Timeout | null = null;

const MAX_QUEUE = Math.max(100, +(process.env.RTB_SHADOW_MAX_QUEUE || '500'));
const FLUSH_MS = Math.max(250, +(process.env.RTB_SHADOW_FLUSH_MS || '1000'));
const MAX_JSON_LEN = Math.max(2_000, +(process.env.RTB_SHADOW_MAX_JSON || '20000'));

async function flush(): Promise<void> {
  if (flushing || queue.length === 0) return;
  flushing = true;
  try {
    const batch: PendingRow[] = queue.splice(0, Math.min(queue.length, MAX_QUEUE));
    const valuesSql = batch
      .map(
        (_r, i) =>
          `($${i * 15 + 1},$${i * 15 + 2},$${i * 15 + 3},$${i * 15 + 4},$${i * 15 + 5},$${i * 15 + 6},$${i * 15 + 7},$${i * 15 + 8},$${i * 15 + 9},$${i * 15 + 10},$${i * 15 + 11},$${i * 15 + 12},$${i * 15 + 13}::jsonb,$${i * 15 + 14}::jsonb,$${i * 15 + 15})`
      )
      .join(',');
    const flatParams = batch.flat();
    await query(
      `INSERT INTO migration_shadow_outcomes (
         experiment_id,request_id,placement_id,arm,mode,status,adapter_name,adapter_id,bid_cpm,currency,latency_ms,mirror_percent,bids,metadata,error_reason
       ) VALUES ${valuesSql}`,
      flatParams
    );
  } catch (error) {
    logger.warn('Failed to batch-insert migration shadow outcomes', { error });
  } finally {
    flushing = false;
  }
}

function schedule(): void {
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    void flush();
  }, FLUSH_MS).unref();
}

export const recordShadowOutcome = async (outcome: ShadowOutcomeRecord): Promise<void> => {
  try {
    // Truncate oversized metadata to protect DB
    const bidsPayload = JSON.stringify((outcome.bids ?? []).slice(0, 25)).slice(0, MAX_JSON_LEN);
    const metadataPayload = JSON.stringify(outcome.metadata ?? {}).slice(0, MAX_JSON_LEN);

    const row: PendingRow = [
      outcome.experimentId,
      outcome.requestId,
      outcome.placementId ?? null,
      outcome.arm,
      outcome.mode,
      outcome.status,
      outcome.adapterName ?? null,
      outcome.adapterId ?? null,
      typeof outcome.bidCpm === 'number' ? outcome.bidCpm : null,
      outcome.currency ?? 'USD',
      typeof outcome.latencyMs === 'number' ? Math.round(outcome.latencyMs) : null,
      typeof outcome.mirrorPercent === 'number' ? Math.round(outcome.mirrorPercent) : null,
      bidsPayload,
      metadataPayload,
      outcome.errorReason ?? null,
    ];

    queue.push(row);
    if (queue.length >= MAX_QUEUE) {
      // best-effort flush
      void flush();
    } else {
      schedule();
    }
  } catch (error) {
    logger.warn('Failed to queue migration shadow outcome', {
      error,
      experimentId: outcome.experimentId,
      requestId: outcome.requestId,
    });
  }
};
