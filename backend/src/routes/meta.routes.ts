import { Router, Request, Response } from 'express';
import { getFeatureFlags } from '../utils/featureFlags';

const router = Router();

/**
 * GET /api/v1/meta/features
 * Returns current feature flag configuration
 * Public endpoint (no auth required) so console can check availability
 */
router.get('/features', (_req: Request, res: Response) => {
  const flags = getFeatureFlags();
  
  res.json({
    success: true,
    data: {
      transparency: flags.transparencyEnabled,
      billing: flags.billingEnabled,
      fraudDetection: flags.fraudDetectionEnabled,
      abTesting: flags.abTestingEnabled,
      migrationStudio: flags.migrationStudioEnabled,
    },
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /api/v1/meta/info
 * Returns API metadata
 */
router.get('/info', (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      name: 'ApexMediation API',
      version: process.env.API_VERSION || 'v1',
      environment: process.env.NODE_ENV || 'development',
    },
  });
});

export default router;
