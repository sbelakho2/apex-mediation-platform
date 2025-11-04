import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { cache, invalidatePublisherCache } from '../middleware/cache';
import { cacheTTL } from '../utils/redis';
import * as analyticsController from '../controllers/analytics.controller';

const router = Router();

// ========================================
// Dashboard/Reporting Endpoints (require auth)
// ========================================
// GET /api/v1/analytics/overview - Get analytics overview
router.get('/overview', authenticate, cache({ 
  ttl: cacheTTL.medium, // Cache for 5 minutes
  varyBy: ['query.startDate', 'query.endDate']
}), analyticsController.getOverview);

// GET /api/v1/analytics/timeseries - Get time series analytics data
router.get('/timeseries', authenticate, cache({ 
  ttl: cacheTTL.medium,
  varyBy: ['query.startDate', 'query.endDate', 'query.granularity']
}), analyticsController.getTimeSeries);

// GET /api/v1/analytics/performance - Get performance metrics
router.get('/performance', authenticate, cache({ 
  ttl: cacheTTL.long, // Cache for 30 minutes - more stable data
  varyBy: ['query.startDate', 'query.endDate', 'query.groupBy']
}), analyticsController.getPerformance);

// GET /api/v1/analytics/buffer-stats - Get event buffer stats (monitoring)
router.get('/buffer-stats', authenticate, cache({ 
  ttl: cacheTTL.short // Cache for 1 minute - near real-time
}), analyticsController.getBufferStats);

// ========================================
// Event Ingestion Endpoints (no auth for SDK)
// ========================================
// POST /api/v1/analytics/events/impressions - Record impression events
router.post('/events/impressions', invalidatePublisherCache(), analyticsController.recordImpressions);

// POST /api/v1/analytics/events/clicks - Record click events
router.post('/events/clicks', invalidatePublisherCache(), analyticsController.recordClicks);

// POST /api/v1/analytics/events/revenue - Record revenue events
router.post('/events/revenue', invalidatePublisherCache(), analyticsController.recordRevenue);

export default router;
