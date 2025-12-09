/**
 * Unauthorized Reseller Detector
 * 
 * Validates supply chain paths against authorized sellers.json and app-ads.txt.
 * Detects unauthorized intermediaries in the programmatic supply chain.
 * 
 * Based on IAB ads.txt/sellers.json specification for supply chain transparency.
 */

import { WeakLabel, scoreToConfidence } from './types';
import logger from '../../../utils/logger';

/**
 * Seller entry from sellers.json
 */
export interface SellerEntry {
  sellerId: string;
  domain: string;
  name?: string;
  isConfidential?: boolean;
  sellerType?: 'publisher' | 'intermediary' | 'both';
}

/**
 * App-ads.txt entry
 */
export interface AppAdsEntry {
  domain: string;
  publisherId: string;
  relationship: 'DIRECT' | 'RESELLER';
  certAuthorityId?: string;
}

/**
 * Supply chain node
 */
export interface SupplyChainNode {
  sellerId: string;
  domain: string;
  relationship: 'direct' | 'reseller';
  name?: string;
}

/**
 * Validation context
 */
export interface SupplyChainContext {
  appBundleId: string;
  publisherDomain: string;
  supplyChain: SupplyChainNode[];
  appAdsTxt?: AppAdsEntry[];
  sellersJson?: Record<string, SellerEntry>;
}

/**
 * Validate a single supply chain node
 */
export function validateNode(
  node: SupplyChainNode,
  sellersJson: Record<string, SellerEntry>,
  position: number,
  chainLength: number
): { valid: boolean; reason?: string; confidence: number } {
  const seller = sellersJson[node.sellerId];
  
  // Unknown seller
  if (!seller) {
    return {
      valid: false,
      reason: 'unknown_seller',
      confidence: 0.7,
    };
  }
  
  // Domain mismatch
  if (seller.domain.toLowerCase() !== node.domain.toLowerCase()) {
    return {
      valid: false,
      reason: 'domain_mismatch',
      confidence: 0.85,
    };
  }
  
  // First node should be direct (publisher)
  if (position === 0 && node.relationship !== 'direct') {
    return {
      valid: false,
      reason: 'first_node_not_direct',
      confidence: 0.6,
    };
  }
  
  // Seller type validation
  if (seller.sellerType === 'publisher' && node.relationship !== 'direct') {
    return {
      valid: false,
      reason: 'publisher_as_reseller',
      confidence: 0.75,
    };
  }
  
  return { valid: true, confidence: 0 };
}

/**
 * Validate against app-ads.txt
 */
export function validateAgainstAppAdsTxt(
  supplyChain: SupplyChainNode[],
  appAdsTxt: AppAdsEntry[]
): { valid: boolean; reason?: string; confidence: number } {
  if (supplyChain.length === 0) {
    return { valid: false, reason: 'empty_supply_chain', confidence: 0.5 };
  }
  
  // Get the first (publisher) and last (SSP) nodes
  const publisherNode = supplyChain[0];
  
  // Check if publisher is authorized in app-ads.txt
  const directEntry = appAdsTxt.find(
    entry => entry.domain.toLowerCase() === publisherNode.domain.toLowerCase() &&
             entry.relationship === 'DIRECT'
  );
  
  if (!directEntry) {
    return {
      valid: false,
      reason: 'publisher_not_in_app_ads_txt',
      confidence: 0.8,
    };
  }
  
  // Check resellers
  for (let i = 1; i < supplyChain.length; i++) {
    const node = supplyChain[i];
    if (node.relationship === 'reseller') {
      const resellerEntry = appAdsTxt.find(
        entry => entry.domain.toLowerCase() === node.domain.toLowerCase() &&
                 (entry.relationship === 'RESELLER' || entry.relationship === 'DIRECT')
      );
      
      if (!resellerEntry) {
        return {
          valid: false,
          reason: 'unauthorized_reseller',
          confidence: 0.75,
        };
      }
    }
  }
  
  return { valid: true, confidence: 0 };
}

/**
 * Detect unauthorized reseller patterns
 */
export function detectUnauthorizedReseller(context: SupplyChainContext): WeakLabel[] {
  const labels: WeakLabel[] = [];
  
  try {
    // Validate each node if sellers.json available
    if (context.sellersJson && Object.keys(context.sellersJson).length > 0) {
      for (let i = 0; i < context.supplyChain.length; i++) {
        const node = context.supplyChain[i];
        const result = validateNode(
          node,
          context.sellersJson,
          i,
          context.supplyChain.length
        );
        
        if (!result.valid) {
          labels.push({
            category: 'unauthorized_reseller',
            confidence: scoreToConfidence(result.confidence),
            confidenceScore: result.confidence,
            reason: result.reason || 'invalid_supply_chain_node',
            metadata: {
              position: i,
              seller_id: node.sellerId,
              domain: node.domain,
              relationship: node.relationship,
            },
            detectedAt: new Date(),
          });
        }
      }
    }
    
    // Validate against app-ads.txt if available
    if (context.appAdsTxt && context.appAdsTxt.length > 0) {
      const appAdsResult = validateAgainstAppAdsTxt(
        context.supplyChain,
        context.appAdsTxt
      );
      
      if (!appAdsResult.valid) {
        labels.push({
          category: 'unauthorized_reseller',
          confidence: scoreToConfidence(appAdsResult.confidence),
          confidenceScore: appAdsResult.confidence,
          reason: appAdsResult.reason || 'app_ads_txt_violation',
          metadata: {
            app_bundle: context.appBundleId,
            publisher_domain: context.publisherDomain,
            chain_length: context.supplyChain.length,
          },
          detectedAt: new Date(),
        });
      }
    }
    
    // Suspiciously long supply chain
    if (context.supplyChain.length > 5) {
      labels.push({
        category: 'unauthorized_reseller',
        confidence: 'low',
        confidenceScore: 0.4,
        reason: 'suspiciously_long_supply_chain',
        metadata: {
          chain_length: context.supplyChain.length,
        },
        detectedAt: new Date(),
      });
    }
    
  } catch (error) {
    logger.warn('Unauthorized reseller detection error', { 
      error, 
      appBundle: context.appBundleId,
    });
  }
  
  return labels;
}

/**
 * Load and parse sellers.json
 */
export function parseSellersJson(json: string): Record<string, SellerEntry> {
  try {
    const data = JSON.parse(json);
    const sellers: Record<string, SellerEntry> = {};
    
    if (Array.isArray(data.sellers)) {
      for (const seller of data.sellers) {
        if (seller.seller_id && seller.domain) {
          sellers[seller.seller_id] = {
            sellerId: seller.seller_id,
            domain: seller.domain,
            name: seller.name,
            isConfidential: seller.is_confidential === 1,
            sellerType: seller.seller_type,
          };
        }
      }
    }
    
    return sellers;
  } catch (e) {
    logger.warn('Failed to parse sellers.json', { error: e });
    return {};
  }
}

/**
 * Load and parse app-ads.txt
 */
export function parseAppAdsTxt(content: string): AppAdsEntry[] {
  const entries: AppAdsEntry[] = [];
  const lines = content.split('\n');
  
  for (const line of lines) {
    const trimmed = line.trim();
    // Skip comments and empty lines
    if (!trimmed || trimmed.startsWith('#')) continue;
    
    // Parse: domain, publisher-id, relationship, [cert-authority-id]
    const parts = trimmed.split(',').map(p => p.trim());
    if (parts.length >= 3) {
      const relationship = parts[2].toUpperCase();
      if (relationship === 'DIRECT' || relationship === 'RESELLER') {
        entries.push({
          domain: parts[0],
          publisherId: parts[1],
          relationship,
          certAuthorityId: parts[3] || undefined,
        });
      }
    }
  }
  
  return entries;
}
