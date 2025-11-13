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

export const recordShadowOutcome = async (outcome: ShadowOutcomeRecord): Promise<void> => {
  try {
    const bidsPayload = JSON.stringify(outcome.bids ?? []);
    const metadataPayload = JSON.stringify(outcome.metadata ?? {});

    await query(
      `INSERT INTO migration_shadow_outcomes (
         experiment_id,
         request_id,
         placement_id,
         arm,
         mode,
         status,
         adapter_name,
         adapter_id,
         bid_cpm,
         currency,
         latency_ms,
         mirror_percent,
         bids,
         metadata,
         error_reason
       ) VALUES (
         $1,
         $2,
         $3,
         $4,
         $5,
         $6,
         $7,
         $8,
         $9,
         $10,
         $11,
         $12,
         $13::jsonb,
         $14::jsonb,
         $15
       )`,
      [
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
      ]
    );
  } catch (error) {
    logger.warn('Failed to record migration shadow outcome', {
      error,
      experimentId: outcome.experimentId,
      requestId: outcome.requestId,
    });
  }
};
