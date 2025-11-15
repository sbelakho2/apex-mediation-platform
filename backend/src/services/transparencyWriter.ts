import type { KeyObject } from 'crypto';
import * as crypto from 'crypto';
import type { Counter as PromCounterType, Gauge as PromGaugeType } from 'prom-client';
import { Counter as PromCounter, Gauge as PromGauge } from 'prom-client';
import { promRegister } from '../utils/prometheus';
import { getClickHouseClient } from '../utils/clickhouse';
import type { OpenRTBBidRequest, Bid } from '../types/openrtb.types';
import { DeviceType, NoBidReason } from '../types/openrtb.types';
import type { AuctionResult } from './openrtbEngine';
import { canonicalizeForSignature, canonicalString } from './transparency/canonicalizer';
export { canonicalizeForSignature } from './transparency/canonicalizer';
import logger from '../utils/logger';
import { emitOpsAlert } from '../utils/opsAlert';

export type ClickHouseInsertArgs = {
  table: string;
  values: unknown[];
  format: 'JSONEachRow';
};

export type ClickHouseClient = {
  insert: (args: ClickHouseInsertArgs) => Promise<unknown>;
};

type AuctionRow = {
  auction_id: string;
  timestamp: string;
  publisher_id: string;
  app_or_site_id: string;
  placement_id: string;
  surface_type: 'mobile_app' | 'web' | 'ctv';
  device_os: string;
  device_geo: string;
  att_status: string;
  tc_string_sha256: string;
  winner_source: string;
  winner_bid_ecpm: number;
  winner_gross_price: number;
  winner_currency: string;
  winner_reason: string;
  aletheia_fee_bp: number;
  sample_bps: number;
  effective_publisher_share: number;
  integrity_algo: 'ed25519';
  integrity_key_id: string;
  integrity_signature: string;
};

type CandidateRow = {
  auction_id: string;
  timestamp: string;
  source: string;
  bid_ecpm: number;
  currency: string;
  response_time_ms: number;
  status: string;
  metadata_hash: string;
};

type TransparencyPayload = {
  auction: Pick<
    AuctionRow,
    'auction_id' | 'publisher_id' | 'timestamp' | 'winner_source' | 'winner_bid_ecpm' | 'winner_currency' | 'winner_reason'
  > & {
    sample_bps: number;
  };
  candidates: Array<Pick<CandidateRow, 'source' | 'bid_ecpm' | 'status'>>;
};

const DEFAULT_TC_HASH = '0'.repeat(64);
const DEFAULT_SAMPLE_BPS = 250; // 2.5%
const DEFAULT_FEE_BP = 150; // 1.5%
const DEFAULT_RETRY_ATTEMPTS = 3;
const DEFAULT_RETRY_MIN_DELAY_MS = 50;
const DEFAULT_RETRY_MAX_DELAY_MS = 250;
const DEFAULT_BREAKER_THRESHOLD = 5;
const DEFAULT_BREAKER_COOLDOWN_MS = 60_000;
const TRANSIENT_ERROR_CODES = new Set(['ECONNRESET', 'ETIMEDOUT', 'EPIPE', 'ECONNREFUSED']);

type SanitizedErrorInfo = {
  message: string;
  code?: string;
  status?: number;
  transient: boolean;
};

type CounterKey =
  | 'writes_attempted'
  | 'writes_succeeded'
  | 'writes_failed'
  | 'sampled'
  | 'unsampled'
  | 'breaker_skipped';

const METRIC_PREFIX = 'transparency_writer';

function createPromCounter(name: string, help: string): PromCounterType<string> | undefined {
  try {
    const metricName = `${METRIC_PREFIX}_${name}_total`;
    const existing = promRegister.getSingleMetric(metricName) as PromCounterType<string> | undefined;
    if (existing) {
      return existing;
    }
    return new PromCounter({
      name: metricName,
      help,
      registers: [promRegister],
    });
  } catch (error) {
    logger.warn('TransparencyWriter: failed to register Prometheus counter', { name, error });
    return undefined;
  }
}

function createPromGauge(name: string, help: string): PromGaugeType<string> | undefined {
  try {
    const metricName = `${METRIC_PREFIX}_${name}`;
    const existing = promRegister.getSingleMetric(metricName) as PromGaugeType<string> | undefined;
    if (existing) {
      return existing;
    }
    return new PromGauge({
      name: metricName,
      help,
      registers: [promRegister],
    });
  } catch (error) {
    logger.warn('TransparencyWriter: failed to register Prometheus gauge', { name, error });
    return undefined;
  }
}


export function buildTransparencySignaturePayload(
  auction: AuctionRow,
  candidates: CandidateRow[],
  samplingBps: number
): TransparencyPayload {
  return {
    auction: {
      auction_id: auction.auction_id,
      publisher_id: auction.publisher_id,
      timestamp: auction.timestamp,
      winner_source: auction.winner_source,
      winner_bid_ecpm: auction.winner_bid_ecpm,
      winner_currency: auction.winner_currency,
      winner_reason: auction.winner_reason,
      sample_bps: samplingBps,
    },
    candidates: candidates.map((candidate) => ({
      source: candidate.source,
      bid_ecpm: candidate.bid_ecpm,
      status: candidate.status,
    })),
  };
}


interface TransparencyWriterOptions {
  client?: ClickHouseClient | null;
  samplingBps?: number;
  privateKeySource?: string;
  keyId?: string;
  aletheiaFeeBp?: number;
  featureEnabled?: boolean;
  retryAttempts?: number;
  retryMinDelayMs?: number;
  retryMaxDelayMs?: number;
  breakerThreshold?: number;
  breakerCooldownMs?: number;
  nowProvider?: () => number;
  randomProvider?: () => number;
}

export class TransparencyWriter {
  private counters = {
    writes_attempted: 0,
    writes_succeeded: 0,
    writes_failed: 0,
    sampled: 0,
    unsampled: 0,
    breaker_skipped: 0,
  };
  private readonly client: ClickHouseClient | null;
  private readonly samplingBps: number;
  private readonly keyId: string;
  private readonly privateKey?: KeyObject;
  private readonly featureEnabled: boolean;
  private readonly enabled: boolean;
  private readonly aletheiaFeeBp: number;
  private readonly publisherShare: number;
  private readonly retryAttempts: number;
  private readonly retryMinDelayMs: number;
  private readonly retryMaxDelayMs: number;
  private readonly breakerThreshold: number;
  private readonly breakerCooldownMs: number;
  private readonly now: () => number;
  private readonly random: () => number;
  private consecutiveFailures = 0;
  private breakerOpenUntil: number | null = null;
  private breakerOpenLogged = false;
  private breakerClosedLogged = true;
  private warnedMissingKey = false;
  private warnedNoClient = false;
  private lastFailureAt: number | null = null;
  private lastFailureStage: 'auctions' | 'candidates' | null = null;
  private lastFailureWasPartial = false;
  private lastSuccessAt: number | null = null;
  private readonly promCounters: Partial<Record<CounterKey, PromCounterType<string>>>;
  private readonly promGauges: {
    breakerOpen?: PromGaugeType<string>;
    failureStreak?: PromGaugeType<string>;
    breakerCooldownRemaining?: PromGaugeType<string>;
    lastFailureTimestamp?: PromGaugeType<string>;
    lastSuccessTimestamp?: PromGaugeType<string>;
  };

  constructor(options: TransparencyWriterOptions) {
    this.client = options.client ?? null; // Optional: injected for tests; runtime path uses getClickHouseClient()
    this.samplingBps = Math.max(0, Math.min(10000, options.samplingBps ?? DEFAULT_SAMPLE_BPS));
    this.keyId = options.keyId ?? 'dev-ed25519';
    this.privateKey = this.parsePrivateKey(options.privateKeySource);
    const envEnabled = /^1|true$/i.test(String(process.env.TRANSPARENCY_ENABLED ?? '1'));
    this.featureEnabled = options.featureEnabled ?? envEnabled;
    this.enabled = Boolean(this.featureEnabled && this.privateKey && this.samplingBps > 0);
    this.aletheiaFeeBp = Math.max(0, options.aletheiaFeeBp ?? DEFAULT_FEE_BP);
    this.publisherShare = Math.max(0, Math.min(1, 1 - this.aletheiaFeeBp / 10000));
    this.retryAttempts = Math.max(0, Math.floor(options.retryAttempts ?? DEFAULT_RETRY_ATTEMPTS));
    const minDelay = Math.max(0, Math.floor(options.retryMinDelayMs ?? DEFAULT_RETRY_MIN_DELAY_MS));
    const maxDelay = Math.max(minDelay, Math.floor(options.retryMaxDelayMs ?? DEFAULT_RETRY_MAX_DELAY_MS));
    this.retryMinDelayMs = minDelay;
    this.retryMaxDelayMs = maxDelay;
    this.breakerThreshold = Math.max(0, Math.floor(options.breakerThreshold ?? DEFAULT_BREAKER_THRESHOLD));
    this.breakerCooldownMs = Math.max(0, Math.floor(options.breakerCooldownMs ?? DEFAULT_BREAKER_COOLDOWN_MS));
    this.now = options.nowProvider ?? (() => Date.now());
    this.random = options.randomProvider ?? Math.random;
    this.promCounters = {
      writes_attempted: createPromCounter('writes_attempted', 'Total transparency write attempts'),
      writes_succeeded: createPromCounter('writes_succeeded', 'Successful transparency write operations'),
      writes_failed: createPromCounter('writes_failed', 'Failed transparency write operations'),
      sampled: createPromCounter('sampled', 'Auctions selected for transparency sampling'),
      unsampled: createPromCounter('unsampled', 'Auctions skipped from transparency sampling'),
      breaker_skipped: createPromCounter('breaker_skipped', 'Auctions skipped due to transparency breaker cooldown'),
    };
    this.promGauges = {
      breakerOpen: createPromGauge('breaker_open', '1 when the transparency breaker is open, otherwise 0'),
      failureStreak: createPromGauge('failure_streak', 'Current transparency write consecutive failure streak'),
      breakerCooldownRemaining: createPromGauge('breaker_cooldown_remaining_ms', 'Time remaining before breaker allows writes again'),
      lastFailureTimestamp: createPromGauge('last_failure_timestamp_ms', 'Epoch millis of the last ClickHouse failure'),
      lastSuccessTimestamp: createPromGauge('last_success_timestamp_ms', 'Epoch millis of the last successful ClickHouse write'),
    };
    this.promGauges.breakerOpen?.set(0);
    this.promGauges.failureStreak?.set(0);
    this.promGauges.breakerCooldownRemaining?.set(0);
    this.promGauges.lastFailureTimestamp?.set(0);
    this.promGauges.lastSuccessTimestamp?.set(0);
  }

  private getClient(): ClickHouseClient | null {
    if (this.client) return this.client;
    try {
      const clickhouse = getClickHouseClient();
      return {
        insert: async (args: ClickHouseInsertArgs) =>
          clickhouse.insert({ table: args.table, values: args.values, format: args.format }),
      };
    } catch (_err) {
      return null;
    }
  }

  public async recordAuction(
    request: OpenRTBBidRequest,
    result: AuctionResult,
    observedAt: Date = new Date()
  ): Promise<void> {
    const now = this.now();
    this.refreshBreakerState(now);

    if (!this.enabled) {
      this.incrementCounter('unsampled');
      return;
    }

    const client = this.getClient();
    if (!client) {
      if (!this.warnedNoClient) {
        logger.warn('TransparencyWriter: ClickHouse client not available; transparency disabled');
        this.warnedNoClient = true;
      }
      return;
    }

    const publisherId = this.extractPublisherId(request);
    if (!publisherId) {
      this.incrementCounter('unsampled');
      return;
    }

    if (!this.shouldSample(publisherId, request.id)) {
      this.incrementCounter('unsampled');
      return;
    }

    if (this.shouldSkipDueToBreaker(now)) {
      return;
    }

    this.incrementCounter('sampled');
    this.incrementCounter('writes_attempted');

    const timestampIso = observedAt.toISOString();
    const auctionRow = this.buildAuctionRow(request, result, publisherId, timestampIso);
    const candidateRows = this.buildCandidateRows(request, result, timestampIso);
    const payload = buildTransparencySignaturePayload(auctionRow, candidateRows, this.samplingBps);
    const signature = this.signPayload(payload);

    if (!signature) {
      if (!this.warnedMissingKey) {
        logger.warn('TransparencyWriter: signature could not be produced; skipping auction write');
        this.warnedMissingKey = true;
      }
      this.incrementCounter('writes_failed');
      return;
    }

    auctionRow.integrity_signature = signature;

    try {
      await this.insertWithRetry(() =>
        client.insert({
          table: 'auctions',
          values: [auctionRow],
          format: 'JSONEachRow',
        })
      );
    } catch (error) {
      this.recordFailure(error, request.id, 'auctions');
      return;
    }

    if (candidateRows.length > 0) {
      try {
        await this.insertWithRetry(() =>
          client.insert({
            table: 'auction_candidates',
            values: candidateRows,
            format: 'JSONEachRow',
          })
        );
      } catch (error) {
        this.recordFailure(error, request.id, 'candidates', { partial: true });
        return;
      }
    }

    this.recordSuccess();
  }

  public getMetrics() {
    const now = this.now();
    this.refreshBreakerState(now);
    const breakerOpen = this.breakerOpenUntil !== null && now < this.breakerOpenUntil;
    return {
      ...this.counters,
      breaker_open: breakerOpen,
      failure_streak: this.consecutiveFailures,
      breaker_cooldown_remaining_ms: this.getBreakerCooldownRemaining(now),
      last_failure_at_ms: this.lastFailureAt,
      last_failure_stage: this.lastFailureStage,
      last_failure_partial: this.lastFailureWasPartial,
      last_success_at_ms: this.lastSuccessAt,
    };
  }

  private incrementCounter(key: CounterKey): void {
    this.counters[key]++;
    this.promCounters[key]?.inc();
  }

  private refreshBreakerState(now: number): void {
    if (this.breakerOpenUntil && now >= this.breakerOpenUntil) {
      this.closeBreaker(now);
      return;
    }
    this.updateBreakerCooldownGauge(now);
  }

  private shouldSkipDueToBreaker(now: number): boolean {
    if (!this.breakerOpenUntil) {
      return false;
    }
    if (now < this.breakerOpenUntil) {
      this.incrementCounter('breaker_skipped');
      this.promGauges.breakerOpen?.set(1);
      this.updateBreakerCooldownGauge(now);
      return true;
    }
    this.closeBreaker(now);
    return false;
  }

  private openBreaker(now: number): void {
    if (this.breakerThreshold <= 0) {
      return;
    }

    this.breakerOpenUntil = now + this.breakerCooldownMs;
    if (!this.breakerOpenLogged) {
      logger.warn('TransparencyWriter: breaker opened after consecutive failures', {
        failures: this.consecutiveFailures,
        threshold: this.breakerThreshold,
        cooldownMs: this.breakerCooldownMs,
      });
      this.breakerOpenLogged = true;
    }
    this.breakerClosedLogged = false;
    this.promGauges.breakerOpen?.set(1);
    this.updateBreakerCooldownGauge(now);
    emitOpsAlert('transparency_breaker_open', 'critical', {
      failures: this.consecutiveFailures,
      threshold: this.breakerThreshold,
      cooldown_ms: this.breakerCooldownMs,
    });
  }

  private closeBreaker(now: number = this.now()): void {
    if (!this.breakerOpenUntil) {
      return;
    }

    this.breakerOpenUntil = null;
    this.consecutiveFailures = 0;
    if (!this.breakerClosedLogged) {
      logger.info('TransparencyWriter: breaker cooldown elapsed; resuming writes', {
        cooldownMs: this.breakerCooldownMs,
      });
      this.breakerClosedLogged = true;
    }
    this.breakerOpenLogged = false;
    this.promGauges.breakerOpen?.set(0);
    this.promGauges.failureStreak?.set(this.consecutiveFailures);
    this.updateBreakerCooldownGauge(now);
    emitOpsAlert('transparency_breaker_closed', 'info', {
      cooldown_ms: this.breakerCooldownMs,
    });
  }

  private computeRetryDelay(): number {
    if (this.retryMaxDelayMs <= 0) {
      return 0;
    }
    if (this.retryMaxDelayMs === this.retryMinDelayMs) {
      return this.retryMaxDelayMs;
    }
    const range = this.retryMaxDelayMs - this.retryMinDelayMs;
    return this.retryMinDelayMs + Math.floor(this.random() * (range + 1));
  }

  private async insertWithRetry<T>(fn: () => Promise<T>): Promise<T> {
    const attempts = this.retryAttempts + 1;
    let lastError: unknown;
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        const isTransient = this.isTransientError(error);
        if (!isTransient || attempt === attempts) {
          throw error;
        }
        const delay = this.computeRetryDelay();
        if (delay > 0) {
          await new Promise<void>((resolve) => setTimeout(resolve, delay));
        }
      }
    }
    throw lastError ?? new Error('Unknown transparency writer error');
  }

  private isTransientError(error: unknown): boolean {
    if (!error || typeof error !== 'object') {
      return false;
    }

    const status = (error as { statusCode?: number; status?: number }).statusCode ?? (error as { status?: number }).status;
    if (typeof status === 'number') {
      if (status === 429) {
        return true;
      }
      if (status >= 500 && status < 600) {
        return true;
      }
    }

    const code = (error as { code?: string }).code;
    if (typeof code === 'string' && TRANSIENT_ERROR_CODES.has(code)) {
      return true;
    }

    return false;
  }

  private recordFailure(
    error: unknown,
    requestId: string,
    stage: 'auctions' | 'candidates',
    opts: { partial?: boolean } = {}
  ): void {
    const now = this.now();
    this.incrementCounter('writes_failed');
    this.consecutiveFailures += 1;
    this.promGauges.failureStreak?.set(this.consecutiveFailures);

    const sanitizedError = this.sanitizeClickHouseError(error);
    this.lastFailureAt = now;
    this.lastFailureStage = stage;
    this.lastFailureWasPartial = opts.partial ?? false;
    this.promGauges.lastFailureTimestamp?.set(now);

    logger.error('TransparencyWriter: failed to persist auction sample', {
      error: sanitizedError,
      requestId,
      stage,
      partial: opts.partial ?? false,
    });

    const opsDetails: Record<string, unknown> = {
      request_id: requestId,
      stage,
      partial: opts.partial ?? false,
      failure_streak: this.consecutiveFailures,
      threshold: this.breakerThreshold,
      code: sanitizedError.code,
      status: sanitizedError.status,
      transient: sanitizedError.transient,
    };
    if (sanitizedError.message) {
      opsDetails.message = sanitizedError.message.slice(0, 240);
    }
    emitOpsAlert('transparency_clickhouse_failure', sanitizedError.transient ? 'warning' : 'critical', opsDetails);

    this.updateBreakerCooldownGauge(now);

    if (this.breakerThreshold > 0 && this.consecutiveFailures >= this.breakerThreshold) {
      this.openBreaker(now);
    }
  }

  private recordSuccess(): void {
    const now = this.now();
    this.incrementCounter('writes_succeeded');
    this.consecutiveFailures = 0;
    this.promGauges.failureStreak?.set(0);
    this.lastSuccessAt = now;
    this.promGauges.lastSuccessTimestamp?.set(now);
    this.updateBreakerCooldownGauge(now);
    if (this.breakerOpenUntil) {
      this.closeBreaker(now);
    }
  }

  private buildAuctionRow(
    request: OpenRTBBidRequest,
    result: AuctionResult,
    publisherId: string,
    timestamp: string
  ): AuctionRow {
    const { winner, clearingPrice, currency } = this.resolveWinner(result, request);
    const deviceOs = (request.device?.os ?? 'unknown').toLowerCase();
    const deviceGeo = normalizeCountry(request.device?.geo?.country);
    const placementId = request.imp[0]?.tagid ?? 'unknown';

    return {
      auction_id: request.id,
      timestamp,
      publisher_id: publisherId,
      app_or_site_id: this.resolveAppOrSiteId(request),
      placement_id: placementId,
      surface_type: this.resolveSurfaceType(request),
      device_os: deviceOs,
      device_geo: deviceGeo,
      att_status: this.resolveAttStatus(request),
      tc_string_sha256: this.computeTcHash(request),
      winner_source: winner?.adapterId ?? 'none',
      winner_bid_ecpm: roundAsDecimal(winner?.price ?? 0, 6),
      winner_gross_price: roundAsDecimal(clearingPrice, 6),
      winner_currency: currency,
      winner_reason: this.resolveWinnerReason(result),
      aletheia_fee_bp: this.aletheiaFeeBp,
      sample_bps: this.samplingBps,
      effective_publisher_share: Number(this.publisherShare.toFixed(6)),
      integrity_algo: 'ed25519',
      integrity_key_id: this.keyId,
      integrity_signature: '',
    };
  }

  private buildCandidateRows(
    request: OpenRTBBidRequest,
    result: AuctionResult,
    timestamp: string
  ): CandidateRow[] {
    const { currency, winner } = this.resolveWinner(result, request);
    const auctionId = request.id;

    if (!result.allBids.length) {
      return [];
    }

    return result.allBids.map((entry) => {
      const status = this.resolveCandidateStatus(entry, winner, result);
      const metadata = this.buildCandidateMetadata(entry.bid);

      return {
        auction_id: auctionId,
        timestamp,
        source: entry.adapter.id,
        bid_ecpm: roundAsDecimal(entry.bid.price, 6),
        currency,
        response_time_ms: result.metrics.auctionDuration,
        status,
        metadata_hash: hashObject(metadata),
      };
    });
  }

  private resolveWinner(
    result: AuctionResult,
    request: OpenRTBBidRequest
  ): { winner: { adapterId: string; price: number } | null; clearingPrice: number; currency: string } {
    if (!result.allBids.length) {
      return { winner: null, clearingPrice: 0, currency: result.response?.cur ?? 'USD' };
    }

    const sorted = [...result.allBids].sort((a, b) => b.bid.price - a.bid.price);
    const top = sorted[0];
    const second = sorted[1];
    const floor = request.imp[0]?.bidfloor ?? 0;

    let clearingPrice = top.bid.price;
    if (result.success && second) {
      clearingPrice = Math.max(floor, second.bid.price + 0.01);
    } else if (!result.success) {
      clearingPrice = 0;
    } else {
      clearingPrice = Math.max(floor, top.bid.price);
    }

    return {
      winner: top ? { adapterId: top.adapter.id, price: top.bid.price } : null,
      clearingPrice,
      currency: result.response?.cur ?? 'USD',
    };
  }

  private resolveCandidateStatus(
    entry: { adapter: { id: string }; bid: Bid },
    winner: { adapterId: string; price: number } | null,
    result: AuctionResult
  ): string {
    if (!winner) {
      return result.success ? 'loss' : 'no_bid';
    }

    if (entry.adapter.id === winner.adapterId && result.success) {
      return 'winner';
    }

    return 'loss';
  }

  private resolveWinnerReason(result: AuctionResult): string {
    if (result.success) {
      return 'highest_bid';
    }

    if (typeof result.noBidReason === 'number') {
      return NoBidReason[result.noBidReason] ?? 'no_bid';
    }

    return 'no_bid';
  }

  private resolveSurfaceType(request: OpenRTBBidRequest): 'mobile_app' | 'web' | 'ctv' {
    if (request.app) {
      return 'mobile_app';
    }

    const deviceType = request.device?.devicetype;
    if (deviceType === DeviceType.ConnectedTV || deviceType === DeviceType.ConnectedDevice) {
      return 'ctv';
    }

    return 'web';
  }

  private resolveAppOrSiteId(request: OpenRTBBidRequest): string {
    if (request.app?.id) {
      return request.app.id;
    }
    if (request.site?.id) {
      return request.site.id;
    }
    return 'unknown';
  }

  private resolveAttStatus(request: OpenRTBBidRequest): string {
    const atts = request.device?.ext && typeof request.device.ext === 'object'
      ? (request.device.ext as Record<string, unknown>).atts
      : undefined;

    if (typeof atts !== 'number') {
      return 'unknown';
    }

    switch (atts) {
      case 3:
        return 'authorized';
      case 2:
        return 'denied';
      case 1:
        return 'restricted';
      case 0:
        return 'not_determined';
      default:
        return 'unknown';
    }
  }

  private computeTcHash(request: OpenRTBBidRequest): string {
    const tcString =
      request.user?.consent ??
      (request.user?.ext && typeof request.user.ext === 'object' ? (request.user.ext as Record<string, unknown>).tcfv2 : undefined);

    if (typeof tcString !== 'string' || tcString.length === 0) {
      return DEFAULT_TC_HASH;
    }

    return crypto.createHash('sha256').update(tcString).digest('hex');
  }

  private buildCandidateMetadata(bid: Bid): Record<string, unknown> {
    return {
      adomain: bid.adomain ?? [],
      cid: bid.cid ?? null,
      crid: bid.crid ?? null,
      bundle: bid.bundle ?? null,
    };
  }

  private shouldSample(publisherId: string, auctionId: string): boolean {
    if (this.samplingBps >= 10000) {
      return true;
    }

    const hash = crypto.createHash('sha256').update(publisherId).update(auctionId).digest();
    const value = hash.readUInt16BE(0) % 10000;
    return value < this.samplingBps;
  }

  private extractPublisherId(request: OpenRTBBidRequest): string | null {
    const fromApp = request.app?.publisher?.id;
    if (fromApp && fromApp.length > 0) {
      return fromApp;
    }
    const fromSite = request.site?.publisher?.id;
    if (fromSite && fromSite.length > 0) {
      return fromSite;
    }
    return null;
  }

  private parsePrivateKey(source?: string): KeyObject | undefined {
    if (!source) {
      return undefined;
    }

    try {
      const trimmed = source.trim();
      if (trimmed.includes('BEGIN')) {
        return crypto.createPrivateKey({ key: trimmed, format: 'pem', type: 'pkcs8' });
      }
      return crypto.createPrivateKey({ key: Buffer.from(trimmed, 'base64'), format: 'der', type: 'pkcs8' });
    } catch (error) {
      logger.error('TransparencyWriter: failed to parse private key', { error });
      return undefined;
    }
  }

  private signPayload(payload: TransparencyPayload): string | null {
    if (!this.privateKey) {
      return null;
    }

    try {
      const canonical = canonicalizeForSignature(payload);
      const signature = crypto.sign(null, Buffer.from(canonical, 'utf8'), this.privateKey);
      return signature.toString('base64');
    } catch (error) {
      logger.error('TransparencyWriter: signing failed', { error });
      return null;
    }
  }

  private getBreakerCooldownRemaining(now: number): number {
    if (!this.breakerOpenUntil || now >= this.breakerOpenUntil) {
      return 0;
    }
    return Math.max(0, this.breakerOpenUntil - now);
  }

  private updateBreakerCooldownGauge(now: number): void {
    this.promGauges.breakerCooldownRemaining?.set(this.getBreakerCooldownRemaining(now));
  }

  private sanitizeClickHouseError(error: unknown): SanitizedErrorInfo {
    if (!error || typeof error !== 'object') {
      return {
        message: typeof error === 'string' ? error : 'Unknown transparency writer error',
        transient: false,
      };
    }

    const candidate = error as { message?: string; code?: string; statusCode?: number; status?: number };
    const status = typeof candidate.statusCode === 'number'
      ? candidate.statusCode
      : typeof candidate.status === 'number'
        ? candidate.status
        : undefined;

    return {
      message: typeof candidate.message === 'string' ? candidate.message : 'Unknown transparency writer error',
      code: typeof candidate.code === 'string' ? candidate.code : undefined,
      status,
      transient: this.isTransientError(error),
    };
  }
}

function normalizeCountry(country?: string): string {
  if (!country) {
    return 'ZZ';
  }
  return country.toUpperCase().slice(0, 2);
}

function hashObject(value: unknown): string {
  return crypto.createHash('sha256').update(canonicalString(value)).digest('hex');
}

function roundAsDecimal(value: number, precision: number): number {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

export const transparencyWriter = new TransparencyWriter({
  samplingBps: Number(process.env.TRANSPARENCY_SAMPLE_BPS ?? DEFAULT_SAMPLE_BPS),
  privateKeySource: process.env.TRANSPARENCY_PRIVATE_KEY,
  keyId: process.env.TRANSPARENCY_KEY_ID,
  aletheiaFeeBp: Number(process.env.ALETHEIA_FEE_BP ?? DEFAULT_FEE_BP),
  retryAttempts: Number(process.env.TRANSPARENCY_RETRY_ATTEMPTS ?? DEFAULT_RETRY_ATTEMPTS),
  retryMinDelayMs: Number(process.env.TRANSPARENCY_RETRY_MIN_DELAY_MS ?? DEFAULT_RETRY_MIN_DELAY_MS),
  retryMaxDelayMs: Number(process.env.TRANSPARENCY_RETRY_MAX_DELAY_MS ?? DEFAULT_RETRY_MAX_DELAY_MS),
  breakerThreshold: Number(process.env.TRANSPARENCY_BREAKER_THRESHOLD ?? DEFAULT_BREAKER_THRESHOLD),
  breakerCooldownMs: Number(process.env.TRANSPARENCY_BREAKER_COOLDOWN_MS ?? DEFAULT_BREAKER_COOLDOWN_MS),
  featureEnabled: /^1|true$/i.test(String(process.env.TRANSPARENCY_ENABLED ?? '1')),
});
