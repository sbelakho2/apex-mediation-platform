import type { ExperimentArm, ExperimentMode } from '../../../types/migration';

export type AdFormat = 'banner' | 'interstitial' | 'rewarded' | 'native';

export interface AuctionContext {
  signal: AbortSignal;
  deadlineMs: number;
}

export interface AdapterBidRequest {
  requestId: string;
  placementId: string;
  adFormat: AdFormat;
  floorCpm: number;
  consent?: {
    gdpr?: number; // 0/1
    gdprConsent?: string; // TCF v2
    usPrivacy?: string; // CCPA string
    coppa?: boolean;
  };
  device?: Record<string, unknown>;
  app?: Record<string, unknown>;
  user?: Record<string, unknown>;
  signal?: Record<string, unknown>;
  migration?: {
    experimentId: string;
    arm: ExperimentArm;
    assignmentTs: string;
    mirrorPercent?: number;
    mode?: ExperimentMode;
  };
}

export interface AdapterBid {
  adapter: string;
  cpm: number;
  currency: 'USD';
  creativeUrl: string;
  ttlSeconds: number;
  meta?: Record<string, unknown>;
  latencyMs?: number;
}

export type NoBid = { nobid: true; reason?: string };

export interface AdapterDefinition {
  name: string;
  supports: AdFormat[];
  timeoutMs: number; // per-adapter ceiling
  requestBid: (ctx: AuctionContext, req: AdapterBidRequest) => Promise<AdapterBid | NoBid>;
}
