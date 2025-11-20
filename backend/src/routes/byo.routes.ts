/**
 * BYO (Bring Your Own) Routes
 * 
 * API routes for BYO model services:
 * - Network credential vault (credential management)
 * - Transparency receipts (cryptographic audit trail)
 * - Network report ingestion (AdMob, Unity)
 */

import { Router } from 'express';
import multer from 'multer';
import { authenticate } from '../middleware/auth';
import {
  storeCredentials,
  getCredentials,
  generateToken,
  rotateCredentials,
  deleteCredentials,
  listCredentials,
} from '../controllers/credentials.controller';
import { ingestAdmobCsv, ingestAdmobApi, ingestUnityApi } from '../controllers/byoIngestion.controller';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

// All BYO routes require authentication
router.use(authenticate);

// Network Credential Vault endpoints
router.get('/credentials', listCredentials);
router.post('/credentials', storeCredentials);
router.get('/credentials/:network', getCredentials);
router.post('/credentials/:network/token', generateToken);
router.post('/credentials/:network/rotate', rotateCredentials);
router.delete('/credentials/:network', deleteCredentials);

// Transparency Receipts endpoints (reuse existing transparency routes)
// GET /api/v1/transparency/receipts/:placementId - already exists
// POST /api/v1/transparency/receipts/verify - already exists

// Network Report Ingestion endpoints
router.post('/ingestion/admob/csv', upload.single('report'), ingestAdmobCsv);
router.post('/ingestion/admob/api', ingestAdmobApi);
router.post('/ingestion/unity', ingestUnityApi);

export default router;
