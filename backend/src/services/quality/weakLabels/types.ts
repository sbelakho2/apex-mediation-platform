/**
 * Weak Labels Library - Types and Core Infrastructure
 * 
 * SDK_CHECKS Part 7.2: Weak labels library for fraud signal generation
 * 
 * Weak labels are soft signals used for:
 * - Training fraud detection models
 * - Generating alerts and investigations
 * - Providing transparency to publishers
 * 
 * They are NOT used for blocking traffic - only for analytics and training.
 */

/**
 * Confidence level for a weak label
 */
export type LabelConfidence = 'low' | 'medium' | 'high' | 'very_high';

/**
 * Category of fraud/quality issue detected
 */
export type LabelCategory = 
  | 'ctit_anomaly'           // Click-Time-To-Install too fast/slow
  | 'datacenter_traffic'     // Traffic from known datacenter IPs
  | 'vpn_detected'           // VPN/proxy usage detected
  | 'tor_exit_node'          // Tor exit node IP
  | 'unauthorized_reseller'  // Unauthorized supply chain path
  | 'device_farm'            // Multiple accounts from same device
  | 'click_spam'             // High click rate anomaly
  | 'impression_fraud'       // Invalid impression patterns
  | 'sdk_spoofing'           // SDK signature mismatch
  | 'geo_mismatch'           // Declared vs actual geography mismatch
  | 'bundle_spoofing'        // App bundle ID manipulation
  | 'creative_injection';    // Unauthorized creative swap

/**
 * A weak label assigned to an event
 */
export interface WeakLabel {
  category: LabelCategory;
  confidence: LabelConfidence;
  confidenceScore: number; // 0-1 numerical score
  reason: string;
  metadata: Record<string, unknown>;
  detectedAt: Date;
}

/**
 * Result from a weak labeling function
 */
export interface LabelingResult {
  labels: WeakLabel[];
  allClean: boolean;
  highestRiskCategory?: LabelCategory;
  aggregateRiskScore: number; // 0-1, weighted combination
}

/**
 * Input for weak labeling analysis
 */
export interface LabelingInput {
  requestId: string;
  placementId: string;
  publisherId?: string;
  
  // Device/network signals
  ip?: string;
  userAgent?: string;
  devicePlatform?: string;
  
  // CTIT data (for post-attribution analysis)
  clickTimestamp?: Date;
  installTimestamp?: Date;
  
  // Supply chain data
  supplyChainPath?: Array<{
    sellerId: string;
    domain: string;
    relationship: 'direct' | 'reseller';
  }>;
  appBundleId?: string;
  declaredPublisher?: string;
  
  // Geo data
  declaredCountry?: string;
  actualCountry?: string; // from IP geo
  
  // Creative data
  creativeId?: string;
  creativeSwapCount?: number;
}

/**
 * Convert confidence level to numeric score
 */
export function confidenceToScore(confidence: LabelConfidence): number {
  switch (confidence) {
    case 'very_high': return 0.95;
    case 'high': return 0.8;
    case 'medium': return 0.6;
    case 'low': return 0.4;
    default: return 0.5;
  }
}

/**
 * Convert numeric score to confidence level
 */
export function scoreToConfidence(score: number): LabelConfidence {
  if (score >= 0.9) return 'very_high';
  if (score >= 0.7) return 'high';
  if (score >= 0.5) return 'medium';
  return 'low';
}

/**
 * Calculate aggregate risk score from multiple labels
 */
export function calculateAggregateRisk(labels: WeakLabel[]): number {
  if (labels.length === 0) return 0;
  
  // Use max + weighted average approach
  const scores = labels.map(l => l.confidenceScore);
  const maxScore = Math.max(...scores);
  const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
  
  // 60% max + 40% average
  return Math.min(1, maxScore * 0.6 + avgScore * 0.4);
}

/**
 * Create a labeling result from labels
 */
export function createLabelingResult(labels: WeakLabel[]): LabelingResult {
  const allClean = labels.length === 0;
  const aggregateRiskScore = calculateAggregateRisk(labels);
  
  let highestRiskCategory: LabelCategory | undefined;
  if (labels.length > 0) {
    const sorted = [...labels].sort((a, b) => b.confidenceScore - a.confidenceScore);
    highestRiskCategory = sorted[0].category;
  }
  
  return { labels, allClean, highestRiskCategory, aggregateRiskScore };
}
