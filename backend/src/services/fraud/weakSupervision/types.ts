import { z } from 'zod';

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

// Runtime schemas and guards (FIX-11-678)
export const LabelClassSchema = z.enum(['fraud', 'legit', 'uncertain']);

export const SupplyChainContextSchema = z.object({
  domain: z.string().min(1),
  sellerId: z.string().min(1),
  appStoreId: z.string().nullable().optional(),
  siteId: z.string().nullable().optional(),
  sellerDomain: z.string().nullable().optional(),
  relationship: z.string().optional(),
});

export const NetworkOriginContextSchema = z.object({
  ip: z.string().min(1),
  deviceCountry: z.string().nullable().optional(),
  paymentCountry: z.string().nullable().optional(),
  appStoreCountry: z.string().nullable().optional(),
  timezone: z.string().nullable().optional(),
  expectedTimezone: z.string().nullable().optional(),
  carrier: z.string().nullable().optional(),
  expectedCarrier: z.string().nullable().optional(),
  userAgent: z.string().nullable().optional(),
});

export const CtitContextSchema = z.object({
  seconds: z.number().int().nonnegative(),
  partnerId: z.string().min(1),
  placementId: z.string().min(1),
  history: z
    .object({
      partnerMeanSeconds: z.number().optional(),
      partnerP95Seconds: z.number().optional(),
      globalMeanSeconds: z.number().optional(),
      globalP95Seconds: z.number().optional(),
    })
    .optional(),
});

export const OmsdkContextSchema = z.object({
  sessionStarted: z.boolean(),
  impressionType: z.enum(['display', 'video', 'unknown']),
  wasViewable: z.boolean(),
  measurable: z.boolean(),
  viewableTimeMs: z.number().nonnegative(),
  totalDurationMs: z.number().nonnegative().optional(),
  engagementEvents: z.array(z.string()),
  geometry: z
    .object({
      coveragePercent: z.number(),
      overlappingCreatives: z.number().int().nonnegative(),
    })
    .optional(),
});

export const SyntheticScenarioSignalsSchema = z.object({
  requestsPerMinute: z.number().nonnegative(),
  uniqueDevicesPerMinute: z.number().nonnegative(),
  creativeSwapRate: z.number().min(0),
  bundlesPerRequest: z.number().min(0),
});

export const WeakSupervisionContextSchema = z.object({
  eventId: z.string().min(1),
  timestamp: z.string().min(1),
  partnerId: z.string().min(1),
  placementId: z.string().min(1),
  groundTruthLabel: LabelClassSchema.optional(),
  supplyChain: SupplyChainContextSchema,
  network: NetworkOriginContextSchema,
  ctit: CtitContextSchema,
  omsdk: OmsdkContextSchema,
  synthetic: SyntheticScenarioSignalsSchema,
});

export const SyntheticScenarioDefinitionSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  thresholds: z.object({
    minRequestsPerMinute: z.number().optional(),
    maxUniqueDevicesPerMinute: z.number().optional(),
    minCreativeSwapRate: z.number().optional(),
    minBundlesPerRequest: z.number().optional(),
  }),
  label: LabelClassSchema,
  confidence: z.number().min(0).max(1),
  rationale: z.string().min(1),
});

export function parseLabelClass(input: unknown): LabelClass {
  return LabelClassSchema.parse(input);
}

export function assertWeakSupervisionContext(input: unknown): asserts input is WeakSupervisionContext {
  WeakSupervisionContextSchema.parse(input);
}