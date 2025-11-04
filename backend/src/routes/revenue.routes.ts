import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import * as revenueController from '../controllers/revenue.controller';

const router = Router();

// All revenue endpoints require authentication
router.use(authenticate);

// GET /api/v1/revenue/summary - Get revenue summary
router.get('/summary', revenueController.getSummary);

// GET /api/v1/revenue/timeseries - Get revenue time series data
router.get('/timeseries', revenueController.getTimeSeries);

export default router;
