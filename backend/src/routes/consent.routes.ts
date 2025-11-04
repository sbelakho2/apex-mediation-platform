/**
 * Consent Management Routes
 */

import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import {
  storeConsent,
  getConsent,
  validateConsent,
  deleteConsent,
  parseTCFString,
  parseGPPString,
} from '../controllers/consent.controller';

const router = Router();

// User consent management (requires authentication)
router.post('/consent', authenticate, storeConsent);
router.get('/consent', authenticate, getConsent);
router.post('/consent/validate', authenticate, validateConsent);
router.delete('/consent', authenticate, deleteConsent);

// Utility endpoints for parsing consent strings (public or authenticated based on requirements)
router.post('/consent/parse/tcf', parseTCFString);
router.post('/consent/parse/gpp', parseGPPString);

export default router;
