/**
 * SKAdNetwork Routes
 */

import { Router } from 'express';
import {
  receivePostback,
  createCampaign,
  getCampaignStats,
  calculateConversionValue,
  updateConversionValue,
  generateSignature,
  getSupportedVersions,
} from '../controllers/skadnetwork.controller';
import { authenticate } from '../middleware/auth';

const router = Router();

// Public endpoint for Apple postbacks (no auth required)
router.post('/postback', receivePostback);

// Protected endpoints (require authentication)
router.post('/campaigns', authenticate, createCampaign);
router.get('/campaigns/:campaignId/stats', authenticate, getCampaignStats);
router.post('/conversion-value', authenticate, calculateConversionValue);
router.put('/conversion-value', authenticate, updateConversionValue);
router.post('/signature', authenticate, generateSignature);
router.get('/versions', getSupportedVersions);

export default router;
