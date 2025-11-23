import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requireFeature } from '../utils/featureFlags';
import { readOnlyRateLimit } from '../middleware/rateLimiting';
import { getReconOverview, getReconDeltas, createDispute, getMonthlyRevenueDigest } from '../controllers/vra.controller';

const router = Router();

// Guard entire VRA surface by feature flag and auth
router.use(requireFeature('vraEnabled'));
router.use(authenticate);
router.use(readOnlyRateLimit);

// GET /api/v1/recon/overview
router.get('/recon/overview', getReconOverview);

// GET /api/v1/recon/deltas
router.get('/recon/deltas', getReconDeltas);

// POST /api/v1/recon/disputes
router.post('/recon/disputes', createDispute);

// GET /api/v1/proofs/revenue_digest?month=YYYY-MM
router.get('/proofs/revenue_digest', getMonthlyRevenueDigest);

export default router;
