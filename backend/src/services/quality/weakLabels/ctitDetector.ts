/**
 * CTIT Anomaly Detector
 * 
 * Detects Click-Time-To-Install anomalies which are strong fraud signals:
 * - Too fast CTIT: Indicates attribution fraud (click injection/flooding)
 * - Too slow CTIT: May indicate organic hijacking
 * 
 * Based on industry research and MMA/TAG guidelines.
 */

import { WeakLabel, LabelConfidence, scoreToConfidence } from './types';

/**
 * CTIT thresholds by platform (in seconds)
 * Based on industry benchmarks and app size considerations
 */
export interface CTITThresholds {
  // Minimum realistic install time
  minRealistic: number;
  // Below this is very suspicious
  extremelyFast: number;
  // Normal organic range
  organicMin: number;
  organicMax: number;
  // Beyond this is suspicious for campaign attribution
  suspiciouslyLate: number;
}

export const CTIT_THRESHOLDS: Record<string, CTITThresholds> = {
  ios: {
    minRealistic: 10,      // iOS downloads are fast
    extremelyFast: 3,      // Physically impossible
    organicMin: 15,
    organicMax: 7200,      // 2 hours
    suspiciouslyLate: 86400, // 24 hours
  },
  android: {
    minRealistic: 8,       // Android varies more
    extremelyFast: 2,
    organicMin: 12,
    organicMax: 10800,     // 3 hours
    suspiciouslyLate: 86400,
  },
  default: {
    minRealistic: 10,
    extremelyFast: 3,
    organicMin: 15,
    organicMax: 10800,
    suspiciouslyLate: 86400,
  },
};

export interface CTITInput {
  clickTimestamp: Date;
  installTimestamp: Date;
  platform?: string;
  appSizeMb?: number; // Larger apps take longer
  networkType?: 'wifi' | 'cellular' | 'unknown';
}

/**
 * Analyze CTIT for anomalies
 */
export function detectCTITAnomaly(input: CTITInput): WeakLabel | null {
  const ctitSeconds = (input.installTimestamp.getTime() - input.clickTimestamp.getTime()) / 1000;
  
  // Negative CTIT is definitely fraud
  if (ctitSeconds < 0) {
    return {
      category: 'ctit_anomaly',
      confidence: 'very_high',
      confidenceScore: 0.99,
      reason: 'install_before_click',
      metadata: { ctit_seconds: ctitSeconds },
      detectedAt: new Date(),
    };
  }
  
  const platform = input.platform?.toLowerCase() || 'default';
  const thresholds = CTIT_THRESHOLDS[platform] || CTIT_THRESHOLDS.default;
  
  // Adjust for app size if known
  let adjustedMinRealistic = thresholds.minRealistic;
  if (input.appSizeMb) {
    // Add ~5 seconds per 100MB on cellular, ~2s on wifi
    const sizeFactor = input.networkType === 'wifi' ? 0.02 : 0.05;
    adjustedMinRealistic += input.appSizeMb * sizeFactor;
  }
  
  // Extremely fast - click injection/flooding
  if (ctitSeconds < thresholds.extremelyFast) {
    return {
      category: 'ctit_anomaly',
      confidence: 'very_high',
      confidenceScore: 0.95,
      reason: 'impossible_ctit',
      metadata: { 
        ctit_seconds: ctitSeconds, 
        threshold: thresholds.extremelyFast,
        platform,
      },
      detectedAt: new Date(),
    };
  }
  
  // Very fast - likely attribution fraud
  if (ctitSeconds < adjustedMinRealistic) {
    const confidence = ctitSeconds < thresholds.extremelyFast * 2 ? 0.85 : 0.7;
    return {
      category: 'ctit_anomaly',
      confidence: scoreToConfidence(confidence),
      confidenceScore: confidence,
      reason: 'unrealistic_ctit',
      metadata: { 
        ctit_seconds: ctitSeconds, 
        threshold: adjustedMinRealistic,
        platform,
        app_size_mb: input.appSizeMb,
      },
      detectedAt: new Date(),
    };
  }
  
  // Very late - possible organic hijacking
  if (ctitSeconds > thresholds.suspiciouslyLate) {
    // Late CTIT is less confident as a fraud signal
    const confidence = ctitSeconds > thresholds.suspiciouslyLate * 2 ? 0.6 : 0.5;
    return {
      category: 'ctit_anomaly',
      confidence: scoreToConfidence(confidence),
      confidenceScore: confidence,
      reason: 'late_ctit_organic_hijack_risk',
      metadata: { 
        ctit_seconds: ctitSeconds, 
        threshold: thresholds.suspiciouslyLate,
        platform,
      },
      detectedAt: new Date(),
    };
  }
  
  // Within normal range
  return null;
}

/**
 * Batch analyze CTIT distribution for a campaign/placement
 * Detects statistical anomalies in CTIT patterns
 */
export interface CTITDistributionInput {
  ctitValues: number[]; // CTIT in seconds for each install
  expectedMedian?: number;
  expectedStdDev?: number;
}

export interface CTITDistributionResult {
  median: number;
  mean: number;
  stdDev: number;
  percentileP10: number;
  percentileP90: number;
  anomalyRate: number; // % of installs with anomalous CTIT
  isAnomalous: boolean;
  anomalyReason?: string;
}

export function analyzeCTITDistribution(input: CTITDistributionInput): CTITDistributionResult {
  const values = [...input.ctitValues].sort((a, b) => a - b);
  const n = values.length;
  
  if (n === 0) {
    return {
      median: 0,
      mean: 0,
      stdDev: 0,
      percentileP10: 0,
      percentileP90: 0,
      anomalyRate: 0,
      isAnomalous: false,
    };
  }
  
  const median = values[Math.floor(n / 2)];
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / n;
  const stdDev = Math.sqrt(variance);
  const percentileP10 = values[Math.floor(n * 0.1)];
  const percentileP90 = values[Math.floor(n * 0.9)];
  
  // Count anomalous values (< 10s or negative)
  const anomalousCount = values.filter(v => v < 10 || v < 0).length;
  const anomalyRate = anomalousCount / n;
  
  // Detect if distribution is anomalous
  let isAnomalous = false;
  let anomalyReason: string | undefined;
  
  // Very low median suggests click spam
  if (median < 30) {
    isAnomalous = true;
    anomalyReason = 'median_ctit_too_low';
  }
  
  // High anomaly rate
  if (anomalyRate > 0.1) { // More than 10% anomalous
    isAnomalous = true;
    anomalyReason = 'high_anomaly_rate';
  }
  
  // Compare to expected if provided
  if (input.expectedMedian && Math.abs(median - input.expectedMedian) > input.expectedMedian * 0.5) {
    isAnomalous = true;
    anomalyReason = 'distribution_drift';
  }
  
  return {
    median,
    mean,
    stdDev,
    percentileP10,
    percentileP90,
    anomalyRate,
    isAnomalous,
    anomalyReason,
  };
}
