/**
 * Weak Labels Library
 * 
 * SDK_CHECKS Part 7.2: Weak labels for fraud signal generation
 * 
 * This library provides weak labeling functions for training fraud detection models.
 * Signals are used for:
 * - Model training and improvement
 * - Analytics and reporting
 * - Publisher transparency
 * 
 * IMPORTANT: These labels are NOT used for blocking traffic.
 */

// Types
export * from './types';

// Detectors
export * from './ctitDetector';
export * from './networkDetector';
export * from './resellerDetector';

// Re-export main labeling function
import {
  WeakLabel,
  LabelingInput,
  LabelingResult,
  createLabelingResult,
} from './types';
import { detectCTITAnomaly, CTITInput } from './ctitDetector';
import { detectNetworkAnomalies, NetworkSignals } from './networkDetector';
import { detectUnauthorizedReseller, SupplyChainContext, SupplyChainNode } from './resellerDetector';
import logger from '../../../utils/logger';

/**
 * Run all weak labeling checks on an event
 */
export async function generateWeakLabels(input: LabelingInput): Promise<LabelingResult> {
  const labels: WeakLabel[] = [];
  
  try {
    // CTIT analysis
    if (input.clickTimestamp && input.installTimestamp) {
      const ctitInput: CTITInput = {
        clickTimestamp: input.clickTimestamp,
        installTimestamp: input.installTimestamp,
        platform: input.devicePlatform,
      };
      const ctitLabel = detectCTITAnomaly(ctitInput);
      if (ctitLabel) labels.push(ctitLabel);
    }
    
    // Network quality analysis
    if (input.ip) {
      const networkSignals: NetworkSignals = {
        ip: input.ip,
      };
      const networkLabels = detectNetworkAnomalies(networkSignals);
      labels.push(...networkLabels);
    }
    
    // Supply chain validation
    if (input.supplyChainPath && input.supplyChainPath.length > 0) {
      const supplyChainContext: SupplyChainContext = {
        appBundleId: input.appBundleId || 'unknown',
        publisherDomain: input.declaredPublisher || 'unknown',
        supplyChain: input.supplyChainPath as SupplyChainNode[],
        // In production, these would be fetched/cached
        appAdsTxt: undefined,
        sellersJson: undefined,
      };
      const resellerLabels = detectUnauthorizedReseller(supplyChainContext);
      labels.push(...resellerLabels);
    }
    
    // Geo mismatch detection
    if (input.declaredCountry && input.actualCountry) {
      if (input.declaredCountry.toLowerCase() !== input.actualCountry.toLowerCase()) {
        labels.push({
          category: 'geo_mismatch',
          confidence: 'medium',
          confidenceScore: 0.6,
          reason: 'declared_actual_country_mismatch',
          metadata: {
            declared: input.declaredCountry,
            actual: input.actualCountry,
          },
          detectedAt: new Date(),
        });
      }
    }
    
  } catch (error) {
    logger.warn('Weak labeling error', { error, requestId: input.requestId });
  }
  
  return createLabelingResult(labels);
}

/**
 * Generate weak labels for batch of events (for training pipeline)
 */
export async function batchGenerateWeakLabels(
  inputs: LabelingInput[]
): Promise<Map<string, LabelingResult>> {
  const results = new Map<string, LabelingResult>();
  
  await Promise.all(
    inputs.map(async (input) => {
      const result = await generateWeakLabels(input);
      results.set(input.requestId, result);
    })
  );
  
  return results;
}
