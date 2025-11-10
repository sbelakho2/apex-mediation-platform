import type { KeyObject } from 'crypto';
import * as crypto from 'crypto';
import { getClickHouseClient } from '../utils/clickhouse';
import type { OpenRTBBidRequest, Bid } from '../types/openrtb.types';
import { DeviceType, NoBidReason } from '../types/openrtb.types';
import type { AuctionResult } from './openrtbEngine';
import { canonicalizeForSignature, canonicalString } from './transparency/canonicalizer';
import logger from '../utils/logger';

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
}

export class TransparencyWriter {
  private counters = {
    writes_attempted: 0,
    writes_succeeded: 0,
    writes_failed: 0,
    sampled: 0,
    unsampled: 0,
  };
  private readonly client: ClickHouseClient | null;
  private readonly samplingBps: number;
  private readonly keyId: string;
  private readonly privateKey?: KeyObject;
  private readonly featureEnabled: boolean;
  private readonly enabled: boolean;
  private readonly aletheiaFeeBp: number;
  private readonly publisherShare: number;
  private warnedMissingKey = false;
  private warnedNoClient = false;

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
    // Feature disabled or missing key/sampling -> treat as unsampled and return
    if (!this.enabled) {
      this.counters.unsampled++;
      return;
    }

    const client = this.getClient();
    if (!client) {
      if (!this.warnedNoClient) {
        logger.warn('TransparencyWriter: ClickHouse client not available; transparency disabled');
        this.warnedNoClient = true;
      }
      // Not counted as an attempted write since we cannot connect to CH
      return;
    }

    const publisherId = this.extractPublisherId(request);
    if (!publisherId) {
      // Cannot scope sampling without publisher
      this.counters.unsampled++;
      return;
    }

    if (!this.shouldSample(publisherId, request.id)) {
      this.counters.unsampled++;
      return;
    }

    this.counters.sampled++;
    this.counters.writes_attempted++;

    try {
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
        this.counters.writes_failed++;
        return;
      }

      auctionRow.integrity_signature = signature;

      await client.insert({
        table: 'auctions',
        values: [auctionRow],
        format: 'JSONEachRow',
      });

      if (candidateRows.length > 0) {
        await client.insert({
          table: 'auction_candidates',
          values: candidateRows,
          format: 'JSONEachRow',
        });
      }

      this.counters.writes_succeeded++;
    } catch (error) {
      this.counters.writes_failed++;
      logger.error('TransparencyWriter: failed to persist auction sample', {
        error,
        requestId: request.id,
      });
    }
  }

  public getMetrics() {
    return { ...this.counters };
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
  featureEnabled: /^1|true$/i.test(String(process.env.TRANSPARENCY_ENABLED ?? '1')),
});
