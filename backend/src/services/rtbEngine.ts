import crypto from 'crypto';
import { auctionLatencySeconds } from '../utils/prometheus';
import { signToken } from '../utils/signing';

export interface BidRequest {
  requestId: string;
  placementId: string;
  adFormat: 'banner' | 'interstitial' | 'rewarded' | 'native';
  floorCpm: number;
  device: {
    platform: 'ios' | 'android' | 'web' | 'unity';
    osVersion: string;
    model: string;
    idfa?: string;
    gaid?: string;
  };
  user: {
    country: string;
    language: string;
    age?: number;
  };
  app: {
    id: string;
    name: string;
    bundle: string;
    version: string;
  };
  signal?: Record<string, unknown>;
}

export interface BidResponse {
  requestId: string;
  bidId: string;
  adapter: string;
  cpm: number;
  currency: 'USD';
  creativeUrl: string;
  ttlSeconds: number;
  tracking: {
    impression: string;
    click: string;
  };
  payload: Record<string, unknown>;
}

interface DemandPartnerBid {
  adapter: string;
  cpm: number;
  creativeUrl: string;
  metadata?: Record<string, unknown>;
}

const DEMAND_PARTNERS: DemandPartnerBid[] = [
  {
    adapter: 'admob',
    cpm: 12.3,
    creativeUrl: 'https://ads.apexmediation.ee/admob/interstitial-1.mp4',
  },
  {
    adapter: 'applovin',
    cpm: 11.7,
    creativeUrl: 'https://ads.apexmediation.ee/applovin/rewarded-2.mp4',
  },
  {
    adapter: 'unity',
    cpm: 10.9,
    creativeUrl: 'https://ads.apexmediation.ee/unity/banner-4.png',
  },
];

/**
 * Simulates hybrid waterfall + bidding engine.
 * @deprecated This is a legacy mock engine. Use orchestrator.ts for production.
 */
export const executeBid = async (request: BidRequest): Promise<BidResponse | null> => {
  const end = auctionLatencySeconds.startTimer({ arm: 'control', exp_id: 'none' });
  try {
    const eligibleBids = DEMAND_PARTNERS.filter((partner) => partner.cpm >= request.floorCpm);

    if (eligibleBids.length === 0) {
      return null;
    }

    const sorted = eligibleBids.sort((a, b) => b.cpm - a.cpm);
    const winner = sorted[0];

    const bidId = crypto.randomUUID();

    // Build authenticated tracking URLs using signed tokens
    const baseTrack = process.env.TRACK_BASE_URL || 'https://track.apexmediation.ee';
    const tokenClaims = {
      bidId,
      placementId: request.placementId,
      adapter: winner.adapter,
      cpm: winner.cpm,
      currency: 'USD' as const,
      nonce: crypto.randomBytes(6).toString('base64url'),
    };
    const impToken = signToken({ ...tokenClaims, purpose: 'imp' as const }, 600);
    const clickToken = signToken({ ...tokenClaims, purpose: 'click' as const }, 600);

    return {
      requestId: request.requestId,
      bidId,
      adapter: winner.adapter,
      cpm: winner.cpm,
      currency: 'USD',
      creativeUrl: winner.creativeUrl,
      ttlSeconds: 300,
      tracking: {
        impression: `${baseTrack}/${bidId}/imp?t=${impToken}`,
        click: `${baseTrack}/${bidId}/click?t=${clickToken}`,
      },
      payload: {
        waterfallRank: 1,
        decisionTimeMs: 42,
        metadata: winner.metadata || {},
        originalBidCount: eligibleBids.length,
        consentEcho: request.signal && (request.signal as any).consent ? (request.signal as any).consent : undefined,
      },
    };
  } finally {
    try {
      // ensure the histogram timer is closed; swallow any metrics errors but keep block non-empty
      end();
    } catch (e) {
      // Metrics collection failure should not impact response
      void e; // explicitly reference error to satisfy no-empty rule
    }
  }
};

/**
 * Returns diagnostics for RTB engine.
 */
export const getDiagnostics = () => ({
  partnersConfigured: DEMAND_PARTNERS.length,
  adapters: DEMAND_PARTNERS.map((partner) => partner.adapter),
  averageCpm: DEMAND_PARTNERS.reduce((sum, partner) => sum + partner.cpm, 0) /
    (DEMAND_PARTNERS.length || 1),
  strategy: 'hybrid',
});
