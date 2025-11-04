import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import * as fraudController from '../controllers/fraud.controller';

const router = Router();

// All fraud endpoints require authentication
router.use(authenticate);

// GET /api/v1/fraud/stats - Get fraud detection statistics
router.get('/stats', fraudController.getStats);

// GET /api/v1/fraud/alerts - Get fraud alerts
router.get('/alerts', fraudController.getAlerts);

// GET /api/v1/fraud/types - Get fraud by type breakdown
router.get('/types', fraudController.getByType);

export default router;
