/**
 * Thompson Sampling Service Tests
 */

import {
  ThompsonSamplingService,
  thompsonSamplingService,
  BidFloorUpdate,
} from '../thompsonSamplingService';
import { query } from '../../utils/postgres';
import logger from '../../utils/logger';

// Mock dependencies
jest.mock('../../utils/postgres');
jest.mock('../../utils/logger');

const mockQuery = jest.mocked(query);
const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};
(logger.info as jest.Mock) = mockLogger.info;
(logger.warn as jest.Mock) = mockLogger.warn;
(logger.error as jest.Mock) = mockLogger.error;
(logger.debug as jest.Mock) = mockLogger.debug;

describe('ThompsonSamplingService', () => {
  let service: ThompsonSamplingService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ThompsonSamplingService();

    // Mock empty database by default
    mockQuery.mockResolvedValue({
      rows: [],
      rowCount: 0,
      command: '',
      oid: 0,
      fields: [],
    });
  });

  describe('getOptimalBidFloor', () => {
    it('should return a valid bid floor price', async () => {
      mockQuery.mockResolvedValue({
        rows: [],
        rowCount: 0,
        command: '',
        oid: 0,
        fields: [],
      });

      const floor = await service.getOptimalBidFloor('admob', 'US', 'banner', 'USD');

      expect(floor).toBeGreaterThan(0);
      expect(floor).toBeLessThanOrEqual(10);
    });

    it('should initialize experiment on first call', async () => {
      await service.getOptimalBidFloor('applovin', 'UK', 'interstitial', 'USD');

      // Verify experiment was saved to database
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO thompson_sampling_experiments'),
        expect.arrayContaining(['applovin', 'UK', 'interstitial', 'USD'])
      );
    });

    it('should use exploration for new experiments', async () => {
      const floors = new Set<number>();

      // Run multiple times to collect different explored floors
      for (let i = 0; i < 50; i++) {
        const floor = await service.getOptimalBidFloor('unity', 'CA', 'rewarded', 'USD');
        floors.add(floor);
      }

      // Should have explored multiple different floors
      expect(floors.size).toBeGreaterThan(1);
    });

    it('should load existing experiments from database', async () => {
      const mockExperiment = {
        adapter_id: 'admob',
        geo: 'US',
        format: 'banner',
        currency: 'USD',
        candidates: JSON.stringify([
          { price: 0.5, alphaSuccesses: 50, betaFailures: 50 },
          { price: 1.0, alphaSuccesses: 100, betaFailures: 20 },
          { price: 2.0, alphaSuccesses: 30, betaFailures: 90 },
        ]),
        last_updated: new Date(),
      };

      mockQuery.mockResolvedValueOnce({
        rows: [mockExperiment],
        rowCount: 1,
        command: '',
        oid: 0,
        fields: [],
      });

      // Create new service to trigger loadExperiments
      await new Promise((resolve) => setTimeout(resolve, 100));
      const newService = new ThompsonSamplingService();
      await new Promise((resolve) => setTimeout(resolve, 100));

      const floor = await newService.getOptimalBidFloor('admob', 'US', 'banner', 'USD');

      // Should use loaded experiment instead of creating new one
      expect(floor).toBeGreaterThan(0);
    });
  });

  describe('updateBidFloor', () => {
    it('should update alpha (successes) when bid wins', async () => {
      // Initialize experiment first
      await service.getOptimalBidFloor('admob', 'US', 'banner', 'USD');
      jest.clearAllMocks();

      const update: BidFloorUpdate = {
        adapterId: 'admob',
        geo: 'US',
        format: 'banner',
        bidFloor: 1.0,
        bidAmount: 1.5,
        won: true,
        revenue: 1.5,
      };

      await service.updateBidFloor(update);

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Bid floor experiment updated',
        expect.objectContaining({
          adapterId: 'admob',
          geo: 'US',
          format: 'banner',
          floor: 1.0,
          won: true,
        })
      );

      // Verify database update
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO thompson_sampling_experiments'),
        expect.any(Array)
      );
    });

    it('should update beta (failures) when bid loses', async () => {
      await service.getOptimalBidFloor('applovin', 'UK', 'interstitial', 'USD');
      jest.clearAllMocks();

      const update: BidFloorUpdate = {
        adapterId: 'applovin',
        geo: 'UK',
        format: 'interstitial',
        bidFloor: 2.0,
        bidAmount: 1.5,
        won: false,
        revenue: 0,
      };

      await service.updateBidFloor(update);

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Bid floor experiment updated',
        expect.objectContaining({
          won: false,
        })
      );
    });

    it('should handle updates for non-existent experiments', async () => {
      const update: BidFloorUpdate = {
        adapterId: 'unknown',
        geo: 'ZZ',
        format: 'banner',
        bidFloor: 1.0,
        bidAmount: 1.5,
        won: true,
        revenue: 1.5,
      };

      await service.updateBidFloor(update);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Experiment not found for bid floor update',
        expect.any(Object)
      );
    });

    it('should handle updates for non-matching floor prices', async () => {
      await service.getOptimalBidFloor('admob', 'US', 'banner', 'USD');
      jest.clearAllMocks();

      const update: BidFloorUpdate = {
        adapterId: 'admob',
        geo: 'US',
        format: 'banner',
        bidFloor: 99.99, // Non-existent floor
        bidAmount: 100,
        won: true,
        revenue: 100,
      };

      await service.updateBidFloor(update);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Candidate not found for bid floor update',
        expect.any(Object)
      );
    });
  });

  describe('getExperimentStats', () => {
    it('should return empty array for no experiments', async () => {
      const stats = await service.getExperimentStats();

      expect(stats).toEqual([]);
    });

    it('should calculate statistics for experiments', async () => {
      // Initialize experiment
      await service.getOptimalBidFloor('admob', 'US', 'banner', 'USD');

      // Add some updates
      await service.updateBidFloor({
        adapterId: 'admob',
        geo: 'US',
        format: 'banner',
        bidFloor: 1.0,
        bidAmount: 1.5,
        won: true,
        revenue: 1.5,
      });

      await service.updateBidFloor({
        adapterId: 'admob',
        geo: 'US',
        format: 'banner',
        bidFloor: 1.0,
        bidAmount: 1.2,
        won: true,
        revenue: 1.2,
      });

      const stats = await service.getExperimentStats();

      expect(stats).toHaveLength(1);
      expect(stats[0]).toMatchObject({
        adapterId: 'admob',
        geo: 'US',
        format: 'banner',
      });
      expect(stats[0].bestFloor).toBeGreaterThan(0);
      expect(stats[0].confidence).toBeGreaterThanOrEqual(0);
      expect(stats[0].confidence).toBeLessThanOrEqual(1);
      expect(stats[0].totalTrials).toBeGreaterThan(0);
      expect(stats[0].successRate).toBeGreaterThanOrEqual(0);
      expect(stats[0].successRate).toBeLessThanOrEqual(1);
    });

    it('should identify best performing floor', async () => {
      await service.getOptimalBidFloor('admob', 'US', 'banner', 'USD');

      // Make floor 1.0 clearly the best performer
      for (let i = 0; i < 20; i++) {
        await service.updateBidFloor({
          adapterId: 'admob',
          geo: 'US',
          format: 'banner',
          bidFloor: 1.0,
          bidAmount: 1.5,
          won: true,
          revenue: 1.5,
        });
      }

      // Make floor 2.0 perform poorly
      for (let i = 0; i < 20; i++) {
        await service.updateBidFloor({
          adapterId: 'admob',
          geo: 'US',
          format: 'banner',
          bidFloor: 2.0,
          bidAmount: 1.5,
          won: false,
          revenue: 0,
        });
      }

      const stats = await service.getExperimentStats();

      expect(stats[0].bestFloor).toBe(1.0);
      expect(stats[0].successRate).toBeGreaterThan(0.9);
    });
  });

  describe('resetExperiment', () => {
    it('should delete experiment from database and cache', async () => {
      await service.getOptimalBidFloor('admob', 'US', 'banner', 'USD');
      jest.clearAllMocks();

      await service.resetExperiment('admob', 'US', 'banner');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM thompson_sampling_experiments'),
        ['admob', 'US', 'banner']
      );

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Thompson sampling experiment reset',
        expect.objectContaining({
          adapterId: 'admob',
          geo: 'US',
          format: 'banner',
        })
      );
    });
  });

  describe('Beta sampling algorithm', () => {
    it('should converge to best option over time', async () => {
      await service.getOptimalBidFloor('test', 'US', 'banner', 'USD');

      // Simulate many trials where floor 1.0 wins 90% of the time
      for (let i = 0; i < 100; i++) {
        await service.updateBidFloor({
          adapterId: 'test',
          geo: 'US',
          format: 'banner',
          bidFloor: 1.0,
          bidAmount: 1.5,
          won: Math.random() < 0.9,
          revenue: Math.random() < 0.9 ? 1.5 : 0,
        });
      }

      // Simulate many trials where floor 2.0 wins only 20% of the time
      for (let i = 0; i < 100; i++) {
        await service.updateBidFloor({
          adapterId: 'test',
          geo: 'US',
          format: 'banner',
          bidFloor: 2.0,
          bidAmount: 1.5,
          won: Math.random() < 0.2,
          revenue: Math.random() < 0.2 ? 1.5 : 0,
        });
      }

      // After many trials, should prefer floor 1.0
      const selections = new Map<number, number>();
      for (let i = 0; i < 100; i++) {
        const floor = await service.getOptimalBidFloor('test', 'US', 'banner', 'USD');
        selections.set(floor, (selections.get(floor) || 0) + 1);
      }

      const floor1Count = selections.get(1.0) || 0;
      const floor2Count = selections.get(2.0) || 0;

      // Floor 1.0 should be selected more often due to higher success rate
      expect(floor1Count).toBeGreaterThan(floor2Count);
    });
  });

  describe('Singleton export', () => {
    it('should export singleton instance', () => {
      expect(thompsonSamplingService).toBeInstanceOf(ThompsonSamplingService);
    });
  });
});
