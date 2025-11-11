import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import * as revenueController from '../controllers/revenue.controller';

const router = Router();

// All revenue endpoints require authentication and publisher/admin role
router.use(authenticate);
router.use(authorize(['publisher', 'admin']));

// GET /api/v1/revenue/summary - Get revenue summary
router.get('/summary', revenueController.getSummary);

// GET /api/v1/revenue/timeseries - Get revenue time series data
router.get('/timeseries', revenueController.getTimeSeries);

export default router;
