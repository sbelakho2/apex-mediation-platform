import request from 'supertest';
import type { Application, NextFunction, Request, Response } from 'express';
import type { Experiment, SignificanceTest } from '../../services/abTestingService';

type AuthenticatedTestRequest = Request & {
  user?: {
    publisherId: string;
    userId: string;
  };
};

// Mock authentication middleware BEFORE importing routes
jest.mock('../../middleware/auth', () => ({
  authenticate: jest.fn((req: AuthenticatedTestRequest, _res: Response, next: NextFunction) => {
    req.user = { publisherId: 'pub-123', userId: 'user-123', email: 'test@example.com' };
    next();
  }),
  authorize: jest.fn(() => (_req: Request, _res: Response, next: NextFunction) => next()),
}));

jest.mock('../../services/abTestingService');

import { createTestApp } from '../../__tests__/helpers/testApp';
import { abTestingService } from '../../services/abTestingService';

const mockAbTestingService = abTestingService as jest.Mocked<typeof abTestingService>;

describe('A/B Testing Controller', () => {
  let app: Application;
  const mockToken = 'Bearer mock-jwt-token';
  const mockPublisherId = 'pub-123';

  const buildExperiment = (overrides: Partial<Experiment> = {}): Experiment => ({
    id: overrides.id ?? 'exp-123',
    name: overrides.name ?? 'Floor Price Test',
    description: overrides.description ?? 'Test floor price optimization',
    type: overrides.type ?? 'floor_price',
    status: overrides.status ?? 'draft',
    startDate: overrides.startDate,
    endDate: overrides.endDate,
    publisherId: overrides.publisherId ?? mockPublisherId,
    variants: overrides.variants ?? [],
    targetSampleSize: overrides.targetSampleSize ?? 1000,
    confidenceLevel: overrides.confidenceLevel ?? 0.95,
    createdAt: overrides.createdAt ?? new Date('2024-01-01T00:00:00Z'),
    updatedAt: overrides.updatedAt ?? new Date('2024-01-01T00:00:00Z'),
  });

  beforeAll(() => {
    app = createTestApp();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/v1/ab-testing/experiments', () => {
    it('should create a new experiment with valid input', async () => {
      const mockExperiment: Experiment = {
        id: 'exp-123',
        name: 'Floor Price Test',
        description: 'Test floor price optimization',
        type: 'floor_price',
        status: 'draft',
        publisherId: mockPublisherId,
        variants: [
          { 
            id: 'var-1', 
            experimentId: 'exp-123',
            name: 'Control', 
            trafficAllocation: 50, 
            configuration: { floor: 0.5 }, 
            metrics: { impressions: 0, revenue: 0, clicks: 0, conversions: 0, ecpm: 0, ctr: 0, conversionRate: 0 } 
          },
          { 
            id: 'var-2', 
            experimentId: 'exp-123',
            name: 'Test', 
            trafficAllocation: 50, 
            configuration: { floor: 0.7 }, 
            metrics: { impressions: 0, revenue: 0, clicks: 0, conversions: 0, ecpm: 0, ctr: 0, conversionRate: 0 } 
          },
        ],
        targetSampleSize: 1000,
        confidenceLevel: 0.95,
        startDate: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockAbTestingService.createExperiment.mockResolvedValue(mockExperiment);

      const response = await request(app)
        .post('/api/v1/ab-testing/experiments')
        .set('Authorization', mockToken)
        .send({
          name: 'Floor Price Test',
          description: 'Test floor price optimization',
          type: 'floor_price',
          variants: [
            { name: 'Control', trafficAllocation: 50, configuration: { floor: 0.5 } },
            { name: 'Test', trafficAllocation: 50, configuration: { floor: 0.7 } },
          ],
          targetSampleSize: 1000,
          confidenceLevel: 0.95,
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe('exp-123');
      expect(mockAbTestingService.createExperiment).toHaveBeenCalledWith(
        expect.objectContaining({
          publisherId: mockPublisherId,
          name: 'Floor Price Test',
        })
      );
    });

    it('should reject invalid traffic allocation', async () => {
      mockAbTestingService.createExperiment.mockRejectedValue(
        new Error('Traffic allocations must sum to 100% (got 110%)')
      );

      const response = await request(app)
        .post('/api/v1/ab-testing/experiments')
        .set('Authorization', mockToken)
        .send({
          name: 'Test',
          description: 'Test',
          type: 'floor_price',
          variants: [
            { name: 'Control', trafficAllocation: 60, configuration: {} },
            { name: 'Test', trafficAllocation: 50, configuration: {} },
          ],
          targetSampleSize: 1000,
          confidenceLevel: 0.95,
        })
        .expect(500);

      expect(response.body.error).toContain('Failed to create experiment');
    });
  });

  describe('GET /api/v1/ab-testing/experiments/:experimentId', () => {
    it('should return experiment details', async () => {
      const mockExperiment: Experiment = {
        id: 'exp-123',
        name: 'Test Experiment',
        description: 'Test',
        publisherId: mockPublisherId,
        variants: [],
        status: 'running',
        type: 'floor_price',
        targetSampleSize: 1000,
        confidenceLevel: 0.95,
        startDate: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockAbTestingService.getExperiment.mockResolvedValue(mockExperiment);

      const response = await request(app)
        .get('/api/v1/ab-testing/experiments/exp-123')
        .set('Authorization', mockToken)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe('exp-123');
    });

    it('should return 403 for experiment from different publisher', async () => {
      mockAbTestingService.getExperiment.mockResolvedValue(
        buildExperiment({ publisherId: 'different-pub', variants: [] })
      );

      await request(app)
        .get('/api/v1/ab-testing/experiments/exp-123')
        .set('Authorization', mockToken)
        .expect(403);
    });
  });

  describe('POST /api/v1/ab-testing/experiments/:experimentId/start', () => {
    it('should start an experiment', async () => {
      const mockExperiment = buildExperiment({ status: 'draft' });

      mockAbTestingService.getExperiment.mockResolvedValue(mockExperiment);
      mockAbTestingService.startExperiment.mockResolvedValue();

      const response = await request(app)
        .post('/api/v1/ab-testing/experiments/exp-123/start')
        .set('Authorization', mockToken)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(mockAbTestingService.startExperiment).toHaveBeenCalledWith('exp-123');
    });
  });

  describe('POST /api/v1/ab-testing/experiments/:experimentId/events', () => {
    it('should record an experiment event', async () => {
      mockAbTestingService.recordEvent.mockResolvedValue();

      const response = await request(app)
        .post('/api/v1/ab-testing/experiments/exp-123/events')
        .set('Authorization', mockToken)
        .send({
          variantId: 'var-1',
          eventType: 'impression',
          revenue: 0.5,
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(mockAbTestingService.recordEvent).toHaveBeenCalledWith({
        experimentId: 'exp-123',
        variantId: 'var-1',
        eventType: 'impression',
        revenue: 0.5,
      });
    });
  });

  describe('GET /api/v1/ab-testing/experiments/:experimentId/significance', () => {
    it('should return significance test results', async () => {
      const mockResult: SignificanceTest = {
        metric: 'ecpm',
        controlVariant: { variant: 'Control', mean: 1.5, standardError: 0.1, confidenceInterval: [1.3, 1.7], sampleSize: 500 },
        testVariant: { variant: 'Test', mean: 1.8, standardError: 0.12, confidenceInterval: [1.56, 2.04], sampleSize: 500 },
        pValue: 0.03,
        isSignificant: true,
        confidenceLevel: 0.95,
        relativeUplift: 20,
        absoluteDifference: 0.3,
        recommendation: 'winner',
      };

      mockAbTestingService.getExperiment.mockResolvedValue(
        buildExperiment({ publisherId: mockPublisherId })
      );
      mockAbTestingService.testSignificance.mockResolvedValue(mockResult);

      const response = await request(app)
        .get('/api/v1/ab-testing/experiments/exp-123/significance?metric=ecpm')
        .set('Authorization', mockToken)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.pValue).toBe(0.03);
      expect(response.body.data.isSignificant).toBe(true);
      expect(response.body.meta.interpretation).toContain('winner');
    });
  });

  describe('GET /api/v1/ab-testing/experiments/:experimentId/bandit', () => {
    it('should return bandit recommendation', async () => {
      const mockRecommendation = {
        variantId: 'var-2',
        variantName: 'Test',
        expectedValue: 1.8,
        probability: 0.65,
        explorationBonus: 0.1,
      };

      mockAbTestingService.getExperiment.mockResolvedValue(
        buildExperiment({ publisherId: mockPublisherId })
      );
      mockAbTestingService.getBanditRecommendation.mockResolvedValue(mockRecommendation);

      const response = await request(app)
        .get('/api/v1/ab-testing/experiments/exp-123/bandit')
        .set('Authorization', mockToken)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.variantId).toBe('var-2');
      expect(response.body.meta.algorithm).toContain('Thompson Sampling');
    });
  });
});
