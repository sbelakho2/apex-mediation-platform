/**
 * Waterfall Service Tests
 */

import {
  executeWithWaterfall,
  executeWithPriority,
  executeSmartWaterfall,
  getWaterfallStats,
  resetWaterfallStats,
  updateWaterfallStats,
  WaterfallResult,
} from '../waterfallService';
import { OpenRTBBidRequest } from '../../types/openrtb.types';
import * as openrtbEngine from '../openrtbEngine';

// Mock the openrtb engine
jest.mock('../openrtbEngine');
jest.mock('../bidLandscapeService');

describe('WaterfallService', () => {
  const mockRequest: OpenRTBBidRequest = {
    id: 'test-request-123',
    imp: [
      {
        id: '1',
        banner: {
          w: 320,
          h: 50,
        },
        bidfloor: 0.5,
      },
    ],
    app: {
      id: 'test-app',
      name: 'Test App',
      bundle: 'com.test.app',
    },
    device: {
      ua: 'Mozilla/5.0',
      ip: '192.168.1.1',
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    resetWaterfallStats();
  });

  describe('executeWithWaterfall', () => {
    it('should return immediately on successful first attempt', async () => {
      const mockAuctionResult = {
        success: true,
        response: {
          id: 'test-request-123',
          seatbid: [
            {
              bid: [
                {
                  id: 'bid-123',
                  impid: '1',
                  price: 1.5,
                  adm: '<ad>test</ad>',
                },
              ],
            },
          ],
        },
        metrics: {
          auctionDuration: 50,
          totalBids: 3,
          adapterResponses: 3,
          adapterTimeouts: 0,
          adapterErrors: 0,
        },
        allBids: [],
      };

      (openrtbEngine.executeAuction as jest.Mock).mockResolvedValue(mockAuctionResult);

      const result = await executeWithWaterfall(mockRequest);

      expect(result.success).toBe(true);
      expect(result.fallbackUsed).toBe(false);
      expect(result.attempts).toHaveLength(1);
      expect(openrtbEngine.executeAuction).toHaveBeenCalledTimes(1);
    });

    it('should fallback through adapters on failure', async () => {
      const failedResult = {
        success: false,
        noBidReason: 8, // UnmatchedUser
        metrics: {
          auctionDuration: 50,
          totalBids: 0,
          adapterResponses: 0,
          adapterTimeouts: 2,
          adapterErrors: 2,
        },
        allBids: [],
      };

      const successResult = {
        success: true,
        response: {
          id: 'test-request-123',
          seatbid: [
            {
              bid: [
                {
                  id: 'bid-456',
                  impid: '1',
                  price: 1.0,
                  adm: '<ad>fallback</ad>',
                },
              ],
            },
          ],
        },
        metrics: {
          auctionDuration: 40,
          totalBids: 1,
          adapterResponses: 1,
          adapterTimeouts: 0,
          adapterErrors: 0,
        },
        allBids: [],
      };

      (openrtbEngine.executeAuction as jest.Mock)
        .mockResolvedValueOnce(failedResult) // First attempt fails
        .mockResolvedValueOnce(successResult); // Second attempt succeeds

      (openrtbEngine.getAdapterConfig as jest.Mock).mockReturnValue([
        { id: 'admob', enabled: true, priority: 1 },
        { id: 'applovin', enabled: true, priority: 2 },
      ]);

      const result = await executeWithWaterfall(mockRequest, { maxAttempts: 3 });

      expect(result.success).toBe(true);
      expect(result.fallbackUsed).toBe(true);
      expect(result.attempts).toHaveLength(2);
      expect(openrtbEngine.executeAuction).toHaveBeenCalledTimes(2);
    });

    it('should respect maxAttempts configuration', async () => {
      const failedResult = {
        success: false,
        noBidReason: 8,
        metrics: {
          auctionDuration: 50,
          totalBids: 0,
          adapterResponses: 0,
          adapterTimeouts: 1,
          adapterErrors: 0,
        },
        allBids: [],
      };

      (openrtbEngine.executeAuction as jest.Mock).mockResolvedValue(failedResult);
      (openrtbEngine.getAdapterConfig as jest.Mock).mockReturnValue([
        { id: 'admob', enabled: true, priority: 1 },
        { id: 'applovin', enabled: true, priority: 2 },
        { id: 'unity', enabled: true, priority: 3 },
      ]);

      const result = await executeWithWaterfall(mockRequest, { maxAttempts: 2 });

      expect(result.success).toBe(false);
      expect(result.attempts).toHaveLength(2);
      expect(openrtbEngine.executeAuction).toHaveBeenCalledTimes(2);
    });

    it('should apply exponential backoff delays', async () => {
      const failedResult = {
        success: false,
        noBidReason: 8,
        metrics: {
          auctionDuration: 50,
          totalBids: 0,
          adapterResponses: 0,
          adapterTimeouts: 1,
          adapterErrors: 0,
        },
        allBids: [],
      };

      (openrtbEngine.executeAuction as jest.Mock).mockResolvedValue(failedResult);
      (openrtbEngine.getAdapterConfig as jest.Mock).mockReturnValue([
        { id: 'admob', enabled: true, priority: 1 },
        { id: 'applovin', enabled: true, priority: 2 },
      ]);

      const result = await executeWithWaterfall(mockRequest, {
        maxAttempts: 3,
        initialRetryDelay: 10,
        backoffMultiplier: 2,
      });

      expect(result.attempts[0].delayMs).toBe(0); // First attempt: no delay
      expect(result.attempts[1].delayMs).toBe(10); // Second attempt: 10ms
      expect(result.attempts[2].delayMs).toBe(20); // Third attempt: 20ms (10 * 2)
    });

    it('should not use waterfall when disabled', async () => {
      const failedResult = {
        success: false,
        noBidReason: 8,
        metrics: {
          auctionDuration: 50,
          totalBids: 0,
          adapterResponses: 0,
          adapterTimeouts: 1,
          adapterErrors: 0,
        },
        allBids: [],
      };

      (openrtbEngine.executeAuction as jest.Mock).mockResolvedValue(failedResult);

      const result = await executeWithWaterfall(mockRequest, { enabled: false });

      expect(result.success).toBe(false);
      expect(result.fallbackUsed).toBe(false);
      expect(result.attempts).toHaveLength(1);
      expect(openrtbEngine.executeAuction).toHaveBeenCalledTimes(1);
    });
  });

  describe('executeWithPriority', () => {
    it('should execute auction with specified adapters', async () => {
      const mockResult = {
        success: true,
        response: {
          id: 'test-request-123',
          seatbid: [],
        },
        metrics: {
          auctionDuration: 50,
          totalBids: 1,
          adapterResponses: 1,
          adapterTimeouts: 0,
          adapterErrors: 0,
        },
        allBids: [],
      };

      (openrtbEngine.executeAuction as jest.Mock).mockResolvedValue(mockResult);

      const result = await executeWithPriority(mockRequest, ['admob', 'applovin']);

      expect(result.success).toBe(true);
      expect(openrtbEngine.executeAuction).toHaveBeenCalledWith(
        expect.objectContaining({
          wseat: ['admob', 'applovin'],
        })
      );
    });
  });

  describe('executeSmartWaterfall', () => {
    it('should use performance data to order adapters', async () => {
      const failedResult = {
        success: false,
        noBidReason: 8,
        metrics: {
          auctionDuration: 50,
          totalBids: 0,
          adapterResponses: 0,
          adapterTimeouts: 1,
          adapterErrors: 0,
        },
        allBids: [],
      };

      const successResult = {
        success: true,
        response: {
          id: 'test-request-123',
          seatbid: [],
        },
        metrics: {
          auctionDuration: 40,
          totalBids: 1,
          adapterResponses: 1,
          adapterTimeouts: 0,
          adapterErrors: 0,
        },
        allBids: [],
      };

      (openrtbEngine.executeAuction as jest.Mock)
        .mockResolvedValueOnce(failedResult)
        .mockResolvedValueOnce(successResult);

      (openrtbEngine.getAdapterConfig as jest.Mock).mockReturnValue([
        { id: 'admob', enabled: true, priority: 1 },
        { id: 'applovin', enabled: true, priority: 2 },
        { id: 'unity', enabled: true, priority: 3 },
      ]);

      const performanceData = new Map([
        ['admob', 0.5],
        ['applovin', 0.8], // Highest success rate
        ['unity', 0.3],
      ]);

      const result = await executeSmartWaterfall(mockRequest, performanceData);

      expect(result.success).toBe(true);
      expect(result.fallbackUsed).toBe(true);
      
      // Should try applovin first (highest success rate)
      const secondAttempt = result.attempts[1];
      expect(secondAttempt.adaptersQueried).toContain('applovin');
    });
  });

  describe('waterfall stats', () => {
    it('should track statistics correctly', () => {
      const result: WaterfallResult = {
        success: true,
        finalResult: {
          success: true,
          metrics: {
            auctionDuration: 50,
            totalBids: 2,
            adapterResponses: 2,
            adapterTimeouts: 0,
            adapterErrors: 0,
          },
          allBids: [],
        },
        attempts: [
          {
            attemptNumber: 1,
            adaptersQueried: ['all'],
            result: {
              success: false,
              metrics: {
                auctionDuration: 30,
                totalBids: 0,
                adapterResponses: 0,
                adapterTimeouts: 2,
                adapterErrors: 0,
              },
              allBids: [],
            },
            delayMs: 0,
            timestamp: new Date().toISOString(),
          },
          {
            attemptNumber: 2,
            adaptersQueried: ['admob'],
            result: {
              success: true,
              metrics: {
                auctionDuration: 50,
                totalBids: 2,
                adapterResponses: 2,
                adapterTimeouts: 0,
                adapterErrors: 0,
              },
              allBids: [],
            },
            delayMs: 50,
            timestamp: new Date().toISOString(),
          },
        ],
        totalDuration: 100,
        fallbackUsed: true,
      };

      updateWaterfallStats(result);

      const stats = getWaterfallStats();

      expect(stats.totalRequests).toBe(1);
      expect(stats.successfulWithFallback).toBe(1);
      expect(stats.successfulFirstAttempt).toBe(0);
      expect(stats.failedAllAttempts).toBe(0);
      expect(stats.averageAttempts).toBe(2);
      expect(stats.averageDuration).toBe(100);
    });

    it('should reset statistics', () => {
      const result: WaterfallResult = {
        success: true,
        finalResult: {
          success: true,
          metrics: {
            auctionDuration: 50,
            totalBids: 1,
            adapterResponses: 1,
            adapterTimeouts: 0,
            adapterErrors: 0,
          },
          allBids: [],
        },
        attempts: [],
        totalDuration: 50,
        fallbackUsed: false,
      };

      updateWaterfallStats(result);

      let stats = getWaterfallStats();
      expect(stats.totalRequests).toBe(1);

      resetWaterfallStats();

      stats = getWaterfallStats();
      expect(stats.totalRequests).toBe(0);
      expect(stats.successfulFirstAttempt).toBe(0);
    });
  });
});
