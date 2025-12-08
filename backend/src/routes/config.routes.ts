import { Router } from 'express';
import { validateConfigSchema, verifyConfigSignature, nextRolloutStep } from '../services/configValidationService';

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

export default router;
