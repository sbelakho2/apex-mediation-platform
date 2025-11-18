/**
 * A/B Testing Controller
 * 
 * REST API endpoints for A/B test experiment management,
 * statistical significance testing, and bandit recommendations
 */

import { Request, Response } from 'express';
import { z } from 'zod';
import { abTestingService, type SignificanceTest } from '../services/abTestingService';
import logger from '../utils/logger';

// Validation schemas
const createExperimentSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(1000),
  type: z.enum(['floor_price', 'adapter_priority', 'placement_optimization', 'waterfall_order']),
  variants: z.array(z.object({
    name: z.string().min(1).max(100),
    trafficAllocation: z.number().min(0).max(100),
    configuration: z.record(z.any()),
  })).min(2),
  targetSampleSize: z.number().int().positive(),
  confidenceLevel: z.number().min(0.8).max(0.99).default(0.95),
});

const recordEventSchema = z.object({
  variantId: z.string(),
  eventType: z.enum(['impression', 'click', 'conversion']),
  revenue: z.number().optional(),
  metadata: z.record(z.any()).optional(),
});

const significanceTestSchema = z.object({
  metric: z.enum(['ecpm', 'ctr', 'conversionRate']).default('ecpm'),
});

/**
 * Create new A/B test experiment
 */
export async function createExperiment(req: Request, res: Response): Promise<void> {
  try {
    const publisherId = req.user?.publisherId;
    if (!publisherId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

  const body: z.infer<typeof createExperimentSchema> = createExperimentSchema.parse(req.body);

    const experiment = await abTestingService.createExperiment({
      publisherId,
      ...body,
    });

    res.status(201).json({
      success: true,
      data: experiment,
    });
  } catch (error) {
    logger.error('Failed to create experiment', { error, body: req.body });
    
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid request', details: error.errors });
      return;
    }

    res.status(500).json({ error: 'Failed to create experiment' });
  }
}

/**
 * Get experiment by ID
 */
export async function getExperiment(req: Request, res: Response): Promise<void> {
  try {
    const { experimentId } = req.params;
    const publisherId = req.user?.publisherId;

    if (!publisherId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const experiment = await abTestingService.getExperiment(experimentId);

    // Check if experiment belongs to publisher
    if (experiment.publisherId !== publisherId) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    res.json({
      success: true,
      data: experiment,
    });
  } catch (error) {
    logger.error('Failed to get experiment', { error, experimentId: req.params.experimentId });
    res.status(500).json({ error: 'Failed to get experiment' });
  }
}

/**
 * Start an experiment
 */
export async function startExperiment(req: Request, res: Response): Promise<void> {
  try {
    const { experimentId } = req.params;
    const publisherId = req.user?.publisherId;

    if (!publisherId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    // Verify ownership
    const experiment = await abTestingService.getExperiment(experimentId);
    if (experiment.publisherId !== publisherId) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    await abTestingService.startExperiment(experimentId);

    res.json({
      success: true,
      message: 'Experiment started',
    });
  } catch (error) {
    logger.error('Failed to start experiment', { error, experimentId: req.params.experimentId });
    res.status(500).json({ error: 'Failed to start experiment' });
  }
}

/**
 * Stop an experiment
 */
export async function stopExperiment(req: Request, res: Response): Promise<void> {
  try {
    const { experimentId } = req.params;
    const publisherId = req.user?.publisherId;

    if (!publisherId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    // Verify ownership
    const experiment = await abTestingService.getExperiment(experimentId);
    if (experiment.publisherId !== publisherId) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    await abTestingService.stopExperiment(experimentId);

    res.json({
      success: true,
      message: 'Experiment stopped',
    });
  } catch (error) {
    logger.error('Failed to stop experiment', { error, experimentId: req.params.experimentId });
    res.status(500).json({ error: 'Failed to stop experiment' });
  }
}

/**
 * Record experiment event
 */
export async function recordEvent(req: Request, res: Response): Promise<void> {
  try {
    const { experimentId } = req.params;
    const publisherId = req.user?.publisherId;
    if (!publisherId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    // Verify experiment ownership
    const experiment = await abTestingService.getExperiment(experimentId);
    if (experiment.publisherId !== publisherId) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    const body = recordEventSchema.parse(req.body);

    // Enforce a small metadata payload limit to prevent abuse
    if (body.metadata && JSON.stringify(body.metadata).length > 4_096) {
      res.status(413).json({ error: 'Metadata too large' });
      return;
    }

    await abTestingService.recordEvent({ experimentId, ...body });

    res.status(201).json({
      success: true,
      message: 'Event recorded',
    });
  } catch (error) {
    logger.error('Failed to record event', { error, experimentId: req.params.experimentId });
    
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid request', details: error.errors });
      return;
    }

    res.status(500).json({ error: 'Failed to record event' });
  }
}

/**
 * Test statistical significance
 */
export async function testSignificance(req: Request, res: Response): Promise<void> {
  try {
    const { experimentId } = req.params;
    const publisherId = req.user?.publisherId;

    if (!publisherId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    // Verify ownership
    const experiment = await abTestingService.getExperiment(experimentId);
    if (experiment.publisherId !== publisherId) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

  const query: z.infer<typeof significanceTestSchema> = significanceTestSchema.parse(req.query);

    const result = await abTestingService.testSignificance(experimentId, query.metric);

    res.json({
      success: true,
      data: result,
      meta: {
        interpretation: interpretSignificanceResult(result),
      },
    });
  } catch (error) {
    logger.error('Failed to test significance', { error, experimentId: req.params.experimentId });
    
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid request', details: error.errors });
      return;
    }

    res.status(500).json({ error: 'Failed to test significance' });
  }
}

/**
 * Get multi-armed bandit recommendation
 */
export async function getBanditRecommendation(req: Request, res: Response): Promise<void> {
  try {
    const { experimentId } = req.params;
    const publisherId = req.user?.publisherId;

    if (!publisherId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    // Verify ownership
    const experiment = await abTestingService.getExperiment(experimentId);
    if (experiment.publisherId !== publisherId) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    const recommendation = await abTestingService.getBanditRecommendation(experimentId);

    res.json({
      success: true,
      data: recommendation,
      meta: {
        algorithm: 'Thompson Sampling (Beta-Bernoulli)',
        description: 'Recommended variant balances exploitation and exploration',
      },
    });
  } catch (error) {
    logger.error('Failed to get bandit recommendation', { error, experimentId: req.params.experimentId });
    res.status(500).json({ error: 'Failed to get bandit recommendation' });
  }
}

/**
 * Interpret significance test result for user
 */
function interpretSignificanceResult(result: SignificanceTest): string {
  if (result.recommendation === 'insufficient_data') {
    return 'Not enough data collected yet. Continue running the experiment.';
  }

  if (result.recommendation === 'winner') {
    const winner = result.relativeUplift > 0 ? 'test variant' : 'control variant';
    return `Clear winner detected: ${winner} with ${Math.abs(result.relativeUplift).toFixed(1)}% ${result.relativeUplift > 0 ? 'improvement' : 'degradation'} (p=${result.pValue.toFixed(4)})`;
  }

  if (result.recommendation === 'no_difference') {
    return 'No statistically significant difference detected. Both variants perform similarly.';
  }

  return 'Continue collecting data to reach statistical significance.';
}

export default {
  createExperiment,
  getExperiment,
  startExperiment,
  stopExperiment,
  recordEvent,
  testSignificance,
  getBanditRecommendation,
};
