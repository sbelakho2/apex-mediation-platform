import { Router } from 'express';
import { getFeatureFlags, setFeatureFlags, resetFeatureFlags } from '../config/featureFlags';

const router = Router();

// GET /api/v1/flags → current flag values
router.get('/', (_req, res) => {
  return res.json({ data: getFeatureFlags() });
});

// POST /api/v1/flags → set one or more flags (staging only; in-memory overrides)
// body: { killSwitch?: boolean, enforce2fa?: boolean, disableNewAdapters?: boolean }
router.post('/', (req, res) => {
  const body = req.body || {};
  const allowedKeys = ['killSwitch', 'enforce2fa', 'disableNewAdapters'] as const;
  const partial: Record<string, boolean> = {};
  for (const k of allowedKeys) {
    if (k in body && typeof body[k] === 'boolean') {
      partial[k] = body[k];
    }
  }
  const updated = setFeatureFlags(partial as any);
  return res.json({ data: updated });
});

// POST /api/v1/flags/reset → revert to env defaults
router.post('/reset', (_req, res) => {
  resetFeatureFlags();
  return res.json({ data: getFeatureFlags() });
});

export default router;
