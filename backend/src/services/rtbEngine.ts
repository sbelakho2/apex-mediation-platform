import crypto from 'crypto';
import { auctionLatencySeconds } from '../utils/prometheus';

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
    creativeUrl: 'https://ads.apexmediation.com/admob/interstitial-1.mp4',
  },
  {
    adapter: 'applovin',
    cpm: 11.7,
    creativeUrl: 'https://ads.apexmediation.com/applovin/rewarded-2.mp4',
  },
  {
    adapter: 'unity',
    cpm: 10.9,
    creativeUrl: 'https://ads.apexmediation.com/unity/banner-4.png',
  },
];

/**
 * Simulates hybrid waterfall + bidding engine.
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

    return {
      requestId: request.requestId,
      bidId,
      adapter: winner.adapter,
      cpm: winner.cpm,
      currency: 'USD',
      creativeUrl: winner.creativeUrl,
      ttlSeconds: 300,
      tracking: {
        impression: `https://track.apexmediation.com/${bidId}/imp`,
        click: `https://track.apexmediation.com/${bidId}/click`,
      },
      payload: {
        waterfallRank: 1,
        decisionTimeMs: 42,
        metadata: winner.metadata || {},
        originalBidCount: eligibleBids.length,
      },
    };
  } finally {
    try { end(); } catch {}
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
