/**
 * OpenRTB 2.6 Compliant RTB Engine
 * 
 * Implements server-to-server real-time bidding with proper OpenRTB 2.6 support
 */

import crypto from 'crypto';
import logger from '../utils/logger';
import {
  OpenRTBBidRequest,
  OpenRTBBidResponse,
  Seatbid,
  Bid,
  NoBidReason,
} from '../types/openrtb.types';
import { bidLandscapeService } from './bidLandscapeService';
import { transparencyWriter } from './transparencyWriter';

// ========================================
// Adapter Configuration
// ========================================

interface AdapterConfig {
  id: string;
  name: string;
  endpoint: string;
  timeout: number;
  seats: string[];
  enabled: boolean;
  priority: number;
}

const ADAPTERS: AdapterConfig[] = [
  {
    id: 'admob',
    name: 'Google AdMob',
    endpoint: 'https://rtb.admob.com/bid',
    timeout: 100,
    seats: ['admob'],
    enabled: true,
    priority: 1,
  },
  {
    id: 'applovin',
    name: 'AppLovin MAX',
    endpoint: 'https://rtb.applovin.com/bid',
    timeout: 100,
    seats: ['applovin'],
    enabled: true,
    priority: 2,
  },
  {
    id: 'unity',
    name: 'Unity Ads',
    endpoint: 'https://rtb.unity3d.com/bid',
    timeout: 100,
    seats: ['unity'],
    enabled: true,
    priority: 3,
  },
  {
    id: 'ironsource',
    name: 'ironSource',
    endpoint: 'https://rtb.is.com/bid',
    timeout: 100,
    seats: ['ironsource'],
    enabled: true,
    priority: 4,
  },
  {
    id: 'facebook',
    name: 'Meta Audience Network',
    endpoint: 'https://an.facebook.com/bid',
    timeout: 100,
    seats: ['facebook'],
    enabled: true,
    priority: 5,
  },
  {
    id: 'vungle',
    name: 'Vungle (Liftoff)',
    endpoint: 'https://rtb.vungle.com/bid',
    timeout: 100,
    seats: ['vungle'],
    enabled: true,
    priority: 6,
  },
  {
    id: 'chartboost',
    name: 'Chartboost',
    endpoint: 'https://rtb.chartboost.com/bid',
    timeout: 100,
    seats: ['chartboost'],
    enabled: true,
    priority: 7,
  },
  {
    id: 'pangle',
    name: 'Pangle',
    endpoint: 'https://rtb.pangle.com/bid',
    timeout: 100,
    seats: ['pangle'],
    enabled: true,
    priority: 8,
  },
  {
    id: 'mintegral',
    name: 'Mintegral',
    endpoint: 'https://rtb.mintegral.com/bid',
    timeout: 100,
    seats: ['mintegral'],
    enabled: true,
    priority: 9,
  },
  {
    id: 'adcolony',
    name: 'AdColony',
    endpoint: 'https://rtb.adcolony.com/bid',
    timeout: 100,
    seats: ['adcolony'],
    enabled: true,
    priority: 10,
  },
  {
    id: 'tapjoy',
    name: 'Tapjoy',
    endpoint: 'https://rtb.tapjoy.com/bid',
    timeout: 100,
    seats: ['tapjoy'],
    enabled: true,
    priority: 11,
  },
  {
    id: 'moloco',
    name: 'Moloco',
    endpoint: 'https://ads.moloco.com/rtb/bid',
    timeout: 100,
    seats: ['moloco'],
    enabled: true,
    priority: 12,
  },
  {
    id: 'fyber',
    name: 'Fyber (Digital Turbine)',
    endpoint: 'https://rtb.fyber.com/bid',
    timeout: 100,
    seats: ['fyber'],
    enabled: true,
    priority: 13,
  },
  {
    id: 'smaato',
    name: 'Smaato',
    endpoint: 'https://rtb.smaato.com/bid',
    timeout: 100,
    seats: ['smaato'],
    enabled: true,
    priority: 14,
  },
  {
    id: 'amazon',
    name: 'Amazon Publisher Services',
    endpoint: 'https://rtb.amazon-adsystem.com/bid',
    timeout: 100,
    seats: ['amazon'],
    enabled: true,
    priority: 15,
  },
];

// ========================================
// Auction Configuration
// ========================================

interface AuctionConfig {
  /** Maximum timeout for entire auction in milliseconds */
  maxTimeout: number;
  /** Per-adapter timeout in milliseconds */
  adapterTimeout: number;
  /** Auction type: 1 = first price, 2 = second price */
  auctionType: number;
  /** Minimum bid floor in USD */
  globalFloor: number;
}

const DEFAULT_AUCTION_CONFIG: AuctionConfig = {
  maxTimeout: 120,
  adapterTimeout: 100,
  auctionType: 2, // Second price auction
  globalFloor: 0.01,
};

// ========================================
// Auction Result
// ========================================

export interface AuctionResult {
  /** Whether auction was successful */
  success: boolean;
  /** Winning bid response */
  response?: OpenRTBBidResponse;
  /** Reason for no bid */
  noBidReason?: NoBidReason;
  /** Auction metrics */
  metrics: {
    /** Total auction duration in milliseconds */
    auctionDuration: number;
    /** Number of adapters called */
    totalBids: number;
    /** Number of adapter responses */
    adapterResponses: number;
    /** Number of adapter timeouts */
    adapterTimeouts: number;
    /** Number of adapter errors */
    adapterErrors: number;
  };
  /** All bids received (for bid landscape logging) */
  allBids: Array<{
    adapter: {
      id: string;
      name: string;
    };
    bid: Bid;
  }>;
}

// ========================================
// Circuit Breaker
// ========================================

class CircuitBreaker {
  private failures = new Map<string, number>();
  private lastFailure = new Map<string, number>();
  private readonly threshold = 5;
  private readonly resetTime = 60000; // 1 minute

  isOpen(adapterId: string): boolean {
    const failures = this.failures.get(adapterId) || 0;
    const lastFail = this.lastFailure.get(adapterId) || 0;
    const now = Date.now();

    // Reset if enough time has passed
    if (now - lastFail > this.resetTime) {
      this.failures.set(adapterId, 0);
      return false;
    }

    return failures >= this.threshold;
  }

  recordFailure(adapterId: string): void {
    const current = this.failures.get(adapterId) || 0;
    this.failures.set(adapterId, current + 1);
    this.lastFailure.set(adapterId, Date.now());
  }

  recordSuccess(adapterId: string): void {
    this.failures.set(adapterId, 0);
  }

  getStats(adapterId: string): { failures: number; isOpen: boolean } {
    return {
      failures: this.failures.get(adapterId) || 0,
      isOpen: this.isOpen(adapterId),
    };
  }
}

const circuitBreaker = new CircuitBreaker();

// ========================================
// Main Auction Logic
// ========================================

/**
 * Execute RTB auction
 */
export async function executeAuction(
  request: OpenRTBBidRequest,
  config: Partial<AuctionConfig> = {}
): Promise<AuctionResult> {
  const auctionConfig = { ...DEFAULT_AUCTION_CONFIG, ...config };
  const startTime = Date.now();

  logger.info('Starting RTB auction', {
    requestId: request.id,
    impressions: request.imp.length,
    test: request.test,
  });

  // Validate request
  const validation = validateBidRequest(request);
  if (!validation.valid) {
    logger.warn('Invalid bid request', {
      requestId: request.id,
      errors: validation.errors,
    });

    const result: AuctionResult = {
      success: false,
      noBidReason: NoBidReason.InvalidRequest,
      metrics: {
        auctionDuration: Date.now() - startTime,
        totalBids: 0,
        adapterResponses: 0,
        adapterTimeouts: 0,
        adapterErrors: 0,
      },
      allBids: [],
    };

    // Log to bid landscape
    void bidLandscapeService.logAuction(request, result).catch((err: unknown) =>
      logger.error('Failed to log bid landscape', { error: err })
    );
    // Record transparency sample (best-effort)
    void transparencyWriter.recordAuction(request, result).catch((err: unknown) =>
      logger.error('Failed to write transparency record', { error: err })
    );

    return result;
  }

  // Get eligible adapters
  const eligibleAdapters = getEligibleAdapters(request);

  if (eligibleAdapters.length === 0) {
    logger.warn('No eligible adapters found', { requestId: request.id });

    const result: AuctionResult = {
      success: false,
      noBidReason: NoBidReason.BlockedPublisher,
      metrics: {
        auctionDuration: Date.now() - startTime,
        totalBids: 0,
        adapterResponses: 0,
        adapterTimeouts: 0,
        adapterErrors: 0,
      },
      allBids: [],
    };

    // Log to bid landscape
    void bidLandscapeService.logAuction(request, result).catch((err: unknown) =>
      logger.error('Failed to log bid landscape', { error: err })
    );
    // Record transparency sample (best-effort)
    void transparencyWriter.recordAuction(request, result).catch((err: unknown) =>
      logger.error('Failed to write transparency record', { error: err })
    );

    return result;
  }

  // Call adapters in parallel with timeout
  const bidPromises = eligibleAdapters.map((adapter) =>
    callAdapter(adapter, request, auctionConfig.adapterTimeout)
  );

  const bidResponses = await Promise.all(bidPromises);

  // Collect all valid bids in new format
  const allBids: Array<{ adapter: { id: string; name: string }; bid: Bid }> = [];
  let adapterResponses = 0;
  const adapterTimeouts = 0;
  let adapterErrors = 0;

  for (const response of bidResponses) {
    if (response.success && response.response?.seatbid) {
      adapterResponses++;
      for (const seatbid of response.response.seatbid) {
        for (const bid of seatbid.bid) {
          allBids.push({
            adapter: {
              id: response.adapterId,
              name: response.adapterName,
            },
            bid,
          });
        }
      }
    } else if (response.error) {
      // Count both errors and timeouts as errors for simplicity
      adapterErrors++;
    }
  }

  logger.info('Bids collected', {
    requestId: request.id,
    totalBids: allBids.length,
    adapters: eligibleAdapters.length,
  });

  const auctionDuration = Date.now() - startTime;

  // No bids received
  if (allBids.length === 0) {
    const result: AuctionResult = {
      success: false,
      noBidReason: NoBidReason.UnmatchedUser,
      metrics: {
        auctionDuration,
        totalBids: 0,
        adapterResponses,
        adapterTimeouts,
        adapterErrors,
      },
      allBids: [],
    };

    // Log to bid landscape
    void bidLandscapeService.logAuction(request, result).catch((err: unknown) =>
      logger.error('Failed to log bid landscape', { error: err })
    );
    // Record transparency sample (best-effort)
    void transparencyWriter.recordAuction(request, result).catch((err: unknown) =>
      logger.error('Failed to write transparency record', { error: err })
    );

    return result;
  }

  // Run auction logic - sort bids by price descending
  const sortedBids = [...allBids].sort((a, b) => b.bid.price - a.bid.price);
  const winnerBid = sortedBids[0];
  const secondHighestBid = sortedBids[1];

  // Second-price auction: winner pays second-highest price + $0.01
  let clearingPrice = winnerBid.bid.price;
  if (auctionConfig.auctionType === 2 && secondHighestBid) {
    clearingPrice = secondHighestBid.bid.price + 0.01;
  }

  // Check if winning bid meets floor
  const bidFloor = request.imp[0]?.bidfloor || auctionConfig.globalFloor;
  if (clearingPrice < bidFloor) {
    const result: AuctionResult = {
      success: false,
      noBidReason: NoBidReason.TechnicalError,
      metrics: {
        auctionDuration,
        totalBids: allBids.length,
        adapterResponses,
        adapterTimeouts,
        adapterErrors,
      },
      allBids,
    };

    // Log to bid landscape
    void bidLandscapeService.logAuction(request, result).catch((err: unknown) =>
      logger.error('Failed to log bid landscape', { error: err })
    );
    // Record transparency sample (best-effort)
    void transparencyWriter.recordAuction(request, result).catch((err: unknown) =>
      logger.error('Failed to write transparency record', { error: err })
    );

    return result;
  }

  // Find winning response to return
  const winningResponse = bidResponses.find(
    (r) => r.adapterId === winnerBid.adapter.id
  );

  logger.info('Auction complete', {
    requestId: request.id,
    winner: winnerBid.adapter.name,
    price: clearingPrice,
    auctionDuration,
  });

  const result: AuctionResult = {
    success: true,
    response: winningResponse?.response,
    metrics: {
      auctionDuration,
      totalBids: allBids.length,
      adapterResponses,
      adapterTimeouts,
      adapterErrors,
    },
    allBids,
  };

  // Log to bid landscape (async, don't wait)
  void bidLandscapeService.logAuction(request, result).catch((err: unknown) =>
    logger.error('Failed to log bid landscape', { error: err })
  );
  // Record transparency sample (best-effort)
  void transparencyWriter.recordAuction(request, result).catch((err: unknown) =>
    logger.error('Failed to write transparency record', { error: err })
  );

  return result;
}

/**
 * Validate OpenRTB bid request
 */
function validateBidRequest(request: OpenRTBBidRequest): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!request.id) {
    errors.push('Missing request ID');
  }

  if (!request.imp || request.imp.length === 0) {
    errors.push('No impressions in request');
  }

  if (request.imp) {
    for (const imp of request.imp) {
      if (!imp.id) {
        errors.push(`Impression missing ID`);
      }

      if (!imp.banner && !imp.video && !imp.native) {
        errors.push(`Impression ${imp.id} has no ad format`);
      }

      if (imp.bidfloor && imp.bidfloor < 0) {
        errors.push(`Impression ${imp.id} has negative bid floor`);
      }
    }
  }

  if (!request.app && !request.site) {
    errors.push('Missing app or site object');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Get eligible adapters for request
 */
function getEligibleAdapters(request: OpenRTBBidRequest): AdapterConfig[] {
  return ADAPTERS.filter((adapter) => {
    // Check if adapter is enabled
    if (!adapter.enabled) {
      return false;
    }

    // Check circuit breaker
    if (circuitBreaker.isOpen(adapter.id)) {
      logger.debug('Adapter circuit breaker open', { adapterId: adapter.id });
      return false;
    }

    // Check seat allowlist if present
    if (request.wseat && request.wseat.length > 0) {
      const hasMatchingSeat = adapter.seats.some((seat) =>
        request.wseat!.includes(seat)
      );
      if (!hasMatchingSeat) {
        return false;
      }
    }

    return true;
  });
}

/**
 * Call individual adapter
 */
async function callAdapter(
  adapter: AdapterConfig,
  request: OpenRTBBidRequest,
  timeout: number
): Promise<{
  success: boolean;
  adapterId: string;
  adapterName: string;
  response?: OpenRTBBidResponse;
  error?: string;
}> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    // In production, this would make actual HTTP request
    // For now, simulate with mock response
    const mockResponse = await simulateAdapterCall(adapter, request);

    clearTimeout(timeoutId);
    circuitBreaker.recordSuccess(adapter.id);

    return {
      success: true,
      adapterId: adapter.id,
      adapterName: adapter.name,
      response: mockResponse,
    };
  } catch (error) {
    clearTimeout(timeoutId);
    circuitBreaker.recordFailure(adapter.id);

    logger.error('Adapter call failed', {
      adapterId: adapter.id,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    return {
      success: false,
      adapterId: adapter.id,
      adapterName: adapter.name,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Simulate adapter call (replace with actual HTTP requests in production)
 */
async function simulateAdapterCall(
  adapter: AdapterConfig,
  request: OpenRTBBidRequest
): Promise<OpenRTBBidResponse> {
  // In a real implementation, this would make an HTTP request to adapter.endpoint
  // Since this is a BYO-only project, we do not provide default adapter implementations here.
  // The adapterRegistry should be used instead.
  
  throw new Error('Real adapter calls not implemented in openrtbEngine. Use adapterRegistry.');
}

/**
 * Get circuit breaker stats for monitoring
 */
export function getCircuitBreakerStats(): Record<string, {
  failures: number;
  isOpen: boolean;
}> {
  const stats: Record<string, { failures: number; isOpen: boolean }> = {};

  for (const adapter of ADAPTERS) {
    stats[adapter.id] = circuitBreaker.getStats(adapter.id);
  }

  return stats;
}

/**
 * Get adapter configuration
 */
export function getAdapterConfig(): AdapterConfig[] {
  return ADAPTERS;
}

export default {
  executeAuction,
  getCircuitBreakerStats,
  getAdapterConfig,
};
