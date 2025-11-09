export type LabelClass = 'fraud' | 'legit' | 'uncertain';

export interface SupplyChainContext {
  domain: string;
  sellerId: string;
  appStoreId?: string | null;
  siteId?: string | null;
  sellerDomain?: string | null;
  relationship?: 'DIRECT' | 'RESELLER' | 'BOTH' | string;
}

export interface NetworkOriginContext {
  ip: string;
  deviceCountry?: string | null;
  paymentCountry?: string | null;
  appStoreCountry?: string | null;
  timezone?: string | null;
  expectedTimezone?: string | null;
  carrier?: string | null;
  expectedCarrier?: string | null;
  userAgent?: string | null;
}

export interface CtitContext {
  seconds: number;
  partnerId: string;
  placementId: string;
  history?: {
    partnerMeanSeconds?: number;
    partnerP95Seconds?: number;
    globalMeanSeconds?: number;
    globalP95Seconds?: number;
  };
}

export interface OmsdkContext {
  sessionStarted: boolean;
  impressionType: 'display' | 'video' | 'unknown';
  wasViewable: boolean;
  measurable: boolean;
  viewableTimeMs: number;
  totalDurationMs?: number;
  engagementEvents: string[];
  geometry?: {
    coveragePercent: number;
    overlappingCreatives: number;
  };
}

export interface SyntheticScenarioSignals {
  requestsPerMinute: number;
  uniqueDevicesPerMinute: number;
  creativeSwapRate: number;
  bundlesPerRequest: number;
}

export interface WeakSupervisionContext {
  eventId: string;
  timestamp: string;
  partnerId: string;
  placementId: string;
  groundTruthLabel?: LabelClass;
  supplyChain: SupplyChainContext;
  network: NetworkOriginContext;
  ctit: CtitContext;
  omsdk: OmsdkContext;
  synthetic: SyntheticScenarioSignals;
}

export interface LabelFunctionOutcome {
  functionName: string;
  label: LabelClass;
  confidence: number;
  reasons: string[];
  signals?: Record<string, unknown>;
}

export interface WeakSupervisionResult {
  context: WeakSupervisionContext;
  outcomes: LabelFunctionOutcome[];
}

export interface PrecisionProxy {
  truePositives: number;
  falsePositives: number;
  precision: number | null;
}

export interface LabelQualityReport {
  coverage: Record<string, number>;
  conflictRate: number;
  precisionProxy: Record<string, PrecisionProxy>;
  totalEvents: number;
}

export interface SyntheticScenarioDefinition {
  name: string;
  description: string;
  thresholds: {
    minRequestsPerMinute?: number;
    maxUniqueDevicesPerMinute?: number;
    minCreativeSwapRate?: number;
    minBundlesPerRequest?: number;
  };
  label: LabelClass;
  confidence: number;
  rationale: string;
}
``