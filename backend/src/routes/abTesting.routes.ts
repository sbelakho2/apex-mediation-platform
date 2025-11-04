/**
 * A/B Testing Routes
 * 
 * REST API routes for A/B test experiment management
 */

import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { cache, invalidateCache } from '../middleware/cache';
import { cacheTTL } from '../utils/redis';
import * as abTestingController from '../controllers/abTesting.controller';

const router = Router();

// All routes require authentication
router.use(authenticate);

/**
 * POST /api/ab-testing/experiments
 * Create a new A/B test experiment
 * 
 * Body:
 * - name: string (required)
 * - description: string
 * - type: 'floor_price' | 'adapter_priority' | 'placement_optimization' | 'waterfall_order'
 * - variants: Array<{ name, trafficAllocation, configuration }>
 * - targetSampleSize: number
 * - confidenceLevel: number (0.8-0.99, default 0.95)
 */
router.post('/experiments', invalidateCache((req) => `ab:experiments:${req.user?.publisherId}:*`), abTestingController.createExperiment);

/**
 * GET /api/ab-testing/experiments/:experimentId
 * Get experiment details with variant metrics
 */
router.get('/experiments/:experimentId', cache({ 
  ttl: cacheTTL.short, // Cache for 1 minute - active experiments change frequently
  varyBy: ['params.experimentId']
}), abTestingController.getExperiment);

/**
 * POST /api/ab-testing/experiments/:experimentId/start
 * Start a draft experiment
 */
router.post('/experiments/:experimentId/start', invalidateCache((req) => `ab:experiment:${req.params.experimentId}:*`), abTestingController.startExperiment);

/**
 * POST /api/ab-testing/experiments/:experimentId/stop
 * Stop a running experiment
 */
router.post('/experiments/:experimentId/stop', invalidateCache((req) => `ab:experiment:${req.params.experimentId}:*`), abTestingController.stopExperiment);

/**
 * POST /api/ab-testing/experiments/:experimentId/events
 * Record an experiment event (impression, click, conversion)
 * 
 * Body:
 * - variantId: string (required)
 * - eventType: 'impression' | 'click' | 'conversion' (required)
 * - revenue: number (optional)
 * - metadata: object (optional)
 */
router.post('/experiments/:experimentId/events', invalidateCache((req) => `ab:*:${req.params.experimentId}*`), abTestingController.recordEvent);

/**
 * GET /api/ab-testing/experiments/:experimentId/significance
 * Test statistical significance between variants
 * 
 * Query params:
 * - metric: 'ecpm' | 'ctr' | 'conversionRate' (default: ecpm)
 */
router.get('/experiments/:experimentId/significance', cache({ 
  ttl: cacheTTL.medium, // Cache for 5 minutes - statistical calculations are expensive
  varyBy: ['params.experimentId', 'query.metric']
}), abTestingController.testSignificance);

/**
 * GET /api/ab-testing/experiments/:experimentId/bandit
 * Get multi-armed bandit recommendation (Thompson Sampling)
 */
router.get('/experiments/:experimentId/bandit', cache({ 
  ttl: cacheTTL.short, // Cache for 1 minute - recommendations should be relatively fresh
  varyBy: ['params.experimentId']
}), abTestingController.getBanditRecommendation);

export default router;
