export interface ReconOverviewParams {
  appId?: string;
  from?: string; // ISO date
  to?: string;   // ISO date
}

export interface ReconOverviewItem {
  network: string;
  format: string;
  country: string;
  impressions: number;
  paid: number; // in USD (normalized)
  expected?: number; // in USD (if available)
}

export interface ReconOverviewResult {
  coveragePercent: number; // 0-100
  variancePercent: number; // unexplained variance
  totals: {
    impressions: number;
    paid: number;
    expected: number;
  };
  byBreakdown: ReconOverviewItem[];
  // Aggregated per-network slices for UI overview and dashboards
  byNetwork?: Array<{
    network: string;
    impressions: number;
    paid: number;
    expected: number;
  }>;
}

export interface ReconDeltaItem {
  kind: 'underpay' | 'missing' | 'viewability_gap' | 'ivt_outlier' | 'fx_mismatch' | 'timing_lag';
  amount: number; // USD
  currency: string; // ISO-4217
  reasonCode: string;
  windowStart: string; // ISO ts
  windowEnd: string;   // ISO ts
  evidenceId: string;
  confidence: number; // 0..1
}

export interface ReconDeltaQuery {
  appId?: string;
  from?: string;
  to?: string;
  kind?: ReconDeltaItem['kind'];
  minConf?: number; // 0..1
  page?: number;
  pageSize?: number;
}

export interface ProofsMonthlyDigest {
  month: string; // YYYY-MM
  digest: string; // hex
  signature: string; // hex
  coveragePct: number;
  notes?: string;
}
