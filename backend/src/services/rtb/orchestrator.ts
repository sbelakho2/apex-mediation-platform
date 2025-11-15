import crypto from 'crypto';
import { registerDefaultAdapters, getAdaptersForFormat } from './adapterRegistry';
import { AdapterBid, AdapterBidRequest, AdapterDefinition } from './adapters/types';
import { auctionLatencySeconds, rtbErrorsTotal, rtbNoFillTotal, rtbWinsTotal } from '../../utils/prometheus';
import { safeInc } from '../../utils/metrics';
import type { ExperimentArm, ExperimentMode } from '../../types/migration';
import { signToken } from '../../utils/signing';
import { recordShadowOutcome, OutcomeStatus, CandidateBidSnapshot } from './shadowRecorder';

const envInt = (key: string, dflt: number) => {
  const v = parseInt(process.env[key] || '', 10);
  return Number.isFinite(v) ? v : dflt;
};

const AUCTION_TTL_MS = envInt('AUCTION_TTL_MS', 120);
const DELIVERY_TOKEN_TTL_SEC = envInt('DELIVERY_TOKEN_TTL_SEC', 300);
const TRACK_TOKEN_TTL_SEC = envInt('TRACK_TOKEN_TTL_SEC', 600);

export interface MigrationContext {
  experimentId: string;
  arm: ExperimentArm;
  assignmentTs: string;
  mirrorPercent?: number;
  mode?: ExperimentMode;
}

export interface AuctionInput extends AdapterBidRequest {
  migration?: MigrationContext;
}

export interface AuctionOutput {
  success: boolean;
  response?: {
    requestId: string;
    bidId: string;
    adapter: string;
    cpm: number;
    currency: 'USD';
    ttlSeconds: number;
    creativeUrl: string; // contains signed delivery token
    tracking: { impression: string; click: string };
    payload: Record<string, unknown>;
    consentEcho?: Record<string, unknown>;
  };
  reason?: string;
}

const makeAbortError = () => { const e: any = new Error('Aborted'); e.name = 'AbortError'; return e; };
function withTimeout<T>(p: Promise<T>, ms: number, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const to = setTimeout(() => {
      (signal as any)._timeoutFired = true;
      reject(makeAbortError());
    }, ms);
    signal.addEventListener('abort', () => {
      clearTimeout(to);
      reject(makeAbortError());
    }, { once: true });
    p.then((v) => { clearTimeout(to); resolve(v); }, (e) => { clearTimeout(to); reject(e); });
  });
}

export async function runAuction(input: AuctionInput, baseUrl: string): Promise<AuctionOutput> {
  registerDefaultAdapters();

  const requestId = input.requestId || crypto.randomUUID();
  const migration = input.migration;
  const mode: ExperimentMode = migration?.mode ?? 'shadow';
  const armLabel = migration ? migration.arm : 'control';
  const metricLabels = { arm: armLabel, exp_id: migration?.experimentId ?? 'none' } as const;
  const decisionStartedAt = Date.now();

  const baseMetadata = migration
    ? {
        assignment_ts: migration.assignmentTs,
        mirror_percent: migration.mirrorPercent ?? null,
        ad_format: input.adFormat,
        floor_cpm: input.floorCpm,
      }
    : undefined;

  const end = auctionLatencySeconds.startTimer(metricLabels);

  const recordOutcome = async (status: OutcomeStatus, options?: Partial<Omit<Parameters<typeof recordShadowOutcome>[0], 'experimentId' | 'requestId' | 'placementId' | 'arm' | 'mode'>>) => {
    if (!migration) return;

    await recordShadowOutcome({
      experimentId: migration.experimentId,
      requestId,
      placementId: input.placementId,
      arm: migration.arm,
      mode,
      status,
      latencyMs: Date.now() - decisionStartedAt,
      mirrorPercent: migration.mirrorPercent,
      ...(options || {}),
      metadata: {
        ...(baseMetadata || {}),
        ...((options && options.metadata) || {}),
      },
    });
  };

  if (migration && migration.arm === 'control') {
    await recordOutcome('skipped', {
      metadata: {
        ...(baseMetadata || {}),
        skip_reason: 'control_arm',
      },
    });
    return { success: false, reason: 'CONTROL_ARM' };
  }

  try {
  const adapters = getAdaptersForFormat(input.adFormat);
    if (adapters.length === 0) {
      rtbErrorsTotal.inc({ code: 'NO_ADAPTER', adapter: 'none', ...metricLabels });
      if (migration) {
        await recordOutcome('error', {
          errorReason: 'NO_ADAPTER',
          metadata: {
            ...(baseMetadata || {}),
            adapter_count: 0,
          },
        });
      }
      return { success: false, reason: 'NO_ADAPTER' };
    }

    const abort = new AbortController();
    const deadline = Date.now() + AUCTION_TTL_MS;

    const tasks = adapters.map(async (adapter) => ({
      adapter,
      result: await bidWithAdapter(adapter, input, abort.signal, deadline),
    }));
    const results = await Promise.all(tasks);

    const candidateSnapshots: CandidateBidSnapshot[] = results.map(({ adapter, result }) => {
      if (!result) {
        return { adapter: adapter.name, status: 'nobid', reason: 'NO_RESPONSE' };
      }

      if ((result as any).nobid) {
        return {
          adapter: (result as any).adapter || adapter.name,
          status: 'nobid',
          reason: (result as any).reason,
        };
      }

      const bid = result as AdapterBid;
      return {
        adapter: bid.adapter || adapter.name,
        status: 'bid',
        cpm: bid.cpm,
        latencyMs: bid.latencyMs,
      };
    });

    const bids = results
      .map(({ result }) => result)
      .filter((r): r is AdapterBid => Boolean(r) && !(r as any).nobid);

    if (bids.length === 0) {
      if (migration) {
        await recordOutcome('no_fill', {
          bids: candidateSnapshots,
          metadata: {
            ...(baseMetadata || {}),
            candidate_count: candidateSnapshots.length,
          },
        });
      }

      if (!migration || mode === 'mirroring') {
        safeInc(rtbNoFillTotal, metricLabels);
      }

      if (migration && mode === 'shadow') {
        return { success: false, reason: 'SHADOW_NO_BID' };
      }

      return { success: true, response: undefined, reason: 'NO_BID' };
    }

    bids.sort((a: any, b: any) => (b.cpm - a.cpm) || ((a.latencyMs || 9999) - (b.latencyMs || 9999)));
    const winner = bids[0] as any;
    abort.abort();

    const latencyMs = Date.now() - decisionStartedAt;

    if (migration && mode === 'shadow') {
      await recordOutcome('win', {
        adapterName: winner.adapter,
        adapterId: winner.adapter,
        bidCpm: winner.cpm,
        currency: winner.currency,
        latencyMs,
        bids: candidateSnapshots,
        metadata: {
          ...(baseMetadata || {}),
          ttl_seconds: winner.ttlSeconds || 0,
          delivered: false,
        },
      });

      return { success: false, reason: 'SHADOW_MODE' };
    }

    const bidId = crypto.randomUUID();
    const impressionToken = signToken({
      bidId,
      placementId: input.placementId,
      adapter: winner.adapter,
      cpm: winner.cpm,
      currency: 'USD',
      purpose: 'imp',
      nonce: crypto.randomUUID(),
    }, TRACK_TOKEN_TTL_SEC);

    const clickToken = signToken({
      bidId,
      placementId: input.placementId,
      adapter: winner.adapter,
      cpm: winner.cpm,
      currency: 'USD',
      purpose: 'click',
      nonce: crypto.randomUUID(),
    }, TRACK_TOKEN_TTL_SEC);

    const deliveryToken = signToken({
      bidId,
      placementId: input.placementId,
      adapter: winner.adapter,
      cpm: winner.cpm,
      currency: 'USD',
      purpose: 'delivery',
      nonce: crypto.randomUUID(),
      url: winner.creativeUrl,
    }, DELIVERY_TOKEN_TTL_SEC);

    const impression = `${baseUrl}/t/imp?token=${encodeURIComponent(impressionToken)}`;
    const click = `${baseUrl}/t/click?token=${encodeURIComponent(clickToken)}`;
    const creativeUrl = `${baseUrl}/creative?token=${encodeURIComponent(deliveryToken)}`;

    safeInc(rtbWinsTotal, { adapter: winner.adapter, ...metricLabels });

    if (migration) {
      await recordOutcome('win', {
        adapterName: winner.adapter,
        adapterId: winner.adapter,
        bidCpm: winner.cpm,
        currency: winner.currency,
        latencyMs,
        bids: candidateSnapshots,
        metadata: {
          ...(baseMetadata || {}),
          ttl_seconds: winner.ttlSeconds || 0,
          delivered: true,
        },
      });
    }

    const payload: Record<string, unknown> = { ...(winner.meta || {}) };
    if (migration) {
      payload.migration = {
        experiment_id: migration.experimentId,
        arm: migration.arm,
        assignment_ts: migration.assignmentTs,
        ...(typeof migration.mirrorPercent === 'number'
          ? { mirror_percent: migration.mirrorPercent }
          : {}),
        ...(mode ? { mode } : {}),
      };
    }

    return {
      success: true,
      response: {
        requestId,
        bidId,
        adapter: winner.adapter,
        cpm: winner.cpm,
        currency: 'USD',
        ttlSeconds: winner.ttlSeconds || 300,
        creativeUrl,
        tracking: { impression, click },
        payload,
        consentEcho: input.consent || {},
      }
    };
  } catch (error) {
    if (migration) {
      await recordOutcome('error', {
        errorReason: (error as Error)?.message || 'UNKNOWN_ERROR',
        metadata: {
          ...(baseMetadata || {}),
          stack: (error as Error)?.stack,
        },
      });
    }
    throw error;
  } finally {
    try { end(); } catch (e) { void e; }
  }
}

async function bidWithAdapter(adapter: AdapterDefinition, req: AdapterBidRequest, signal: AbortSignal, deadlineTs: number) {
  const remaining = Math.max(1, deadlineTs - Date.now());
  const perAdapterTimeout = Math.min(adapter.timeoutMs, remaining);
  const ctl = new AbortController();
  const onAbort = () => ctl.abort();
  signal.addEventListener('abort', onAbort, { once: true });
  try {
    const result = await withTimeout(
      adapter.requestBid({ signal: ctl.signal, deadlineMs: perAdapterTimeout }, req),
      perAdapterTimeout,
      ctl.signal
    );

    if (result && (result as any).nobid) {
      return { ...(result as any), adapter: adapter.name } as any;
    }

    return result;
  } catch (e) {
    return {
      nobid: true,
      reason: (e as any)?.name === 'AbortError' ? 'TIMEOUT' : 'ERROR',
      adapter: adapter.name,
    } as any;
  } finally {
    signal.removeEventListener('abort', onAbort);
  }
}
