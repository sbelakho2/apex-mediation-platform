import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import * as payoutController from '../controllers/payout.controller';

const router = Router();

// All payout endpoints require authentication
router.use(authenticate);

// GET /api/v1/payouts/history - Get payout history
router.get('/history', payoutController.getHistory);

// GET /api/v1/payouts/upcoming - Get upcoming payouts
router.get('/upcoming', payoutController.getUpcoming);

// GET /api/v1/payouts/settings - Get payout settings
router.get('/settings', payoutController.getSettings);

// PUT /api/v1/payouts/settings - Update payout settings
router.put('/settings', payoutController.updateSettings);

export default router;
