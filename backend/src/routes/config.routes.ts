import { Router } from 'express';
import { validateConfigSchema, verifyConfigSignature, nextRolloutStep } from '../services/configValidationService';
import { getAppConfigHash, checkConfigParity } from '../services/sdkConfigParity';
import { cache } from '../middleware/cache';
import { cacheTTL } from '../utils/redis';
import { authRateLimiter } from '../middleware/redisRateLimiter';

const router = Router();

router.post('/validate', (req, res) => {
  const { config, publicKeyBase64 } = req.body ?? {};
  if (!config || typeof publicKeyBase64 !== 'string' || publicKeyBase64.length === 0) {
    return res.status(400).json({ success: false, errors: ['config and publicKeyBase64 are required'] });
  }

  const validated = validateConfigSchema(config);
  if (!validated.ok || !validated.config) {
    return res.status(400).json({ success: false, errors: validated.errors ?? ['invalid config'] });
  }

  const verified = verifyConfigSignature(validated.config, publicKeyBase64);
  if (!verified.ok) {
    return res.status(400).json({ success: false, errors: verified.errors ?? ['signature invalid'] });
  }

  return res.json({ success: true });
});

router.post('/rollout/next', (req, res) => {
  const { currentPercent, sloBreached } = req.body ?? {};
  if (typeof currentPercent !== 'number' && typeof currentPercent !== 'undefined') {
    return res.status(400).json({ success: false, errors: ['currentPercent must be a number'] });
  }
  const next = nextRolloutStep(Number(currentPercent || 0), Boolean(sloBreached));
  return res.json({ success: true, data: next });
});

// ========================================
// SDK Config Parity (SDK_CHECKS 8.1)
// ========================================

/**
 * GET /api/v1/config/sdk/:appId/hash
 * Get the config hash for an app (used by Console to display)
 */
router.get('/sdk/:appId/hash', cache({ ttl: cacheTTL.medium }), async (req, res) => {
  const { appId } = req.params;
  
  if (!appId) {
    return res.status(400).json({ success: false, error: 'appId is required' });
  }
  
  try {
    const hashResult = await getAppConfigHash(appId);
    
    if (!hashResult) {
      return res.status(404).json({ success: false, error: 'App not found' });
    }
    
    return res.json({
      success: true,
      data: hashResult,
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Failed to compute config hash' });
  }
});

/**
 * POST /api/v1/config/sdk/parity
 * Check SDK config parity (SDK reports its hash, server compares)
 * Used by SDK debug panel and Console drift detection
 */
router.post('/sdk/parity', authRateLimiter, async (req, res) => {
  const { appId, clientHash, sdkVersion, platform } = req.body ?? {};
  
  if (!appId || !clientHash) {
    return res.status(400).json({ 
      success: false, 
      error: 'appId and clientHash are required' 
    });
  }
  
  try {
    const result = await checkConfigParity(appId, clientHash);
    
    // Log drift for monitoring
    if (result.drift) {
      console.warn('[ConfigParity] Drift detected', {
        appId,
        serverHash: result.serverShortHash,
        clientHash: result.clientShortHash,
        sdkVersion,
        platform,
      });
    }
    
    return res.json({
      success: true,
      data: {
        match: result.match,
        serverHash: result.serverShortHash,
        clientHash: result.clientShortHash,
        drift: result.drift,
        driftDetails: result.driftDetails,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Failed to check config parity' });
  }
});

export default router;
