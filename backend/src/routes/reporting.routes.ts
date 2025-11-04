/**
 * Reporting Routes
 * 
 * Routes for analytics reporting and dashboard data
 */

import { Router } from 'express';
import * as reportingController from '../controllers/reporting.controller';
import { authenticate } from '../middleware/auth';

const router = Router();

/**
 * All reporting endpoints require authentication
 * Publisher context is required for data isolation
 */

/**
 * GET /api/v1/reporting/overview
 * Get revenue overview statistics
 * Query params: ?startDate=ISO8601&endDate=ISO8601
 */
router.get('/overview', authenticate, reportingController.getOverview);

/**
 * GET /api/v1/reporting/timeseries
 * Get time series data for charts
 * Query params: ?startDate=ISO8601&endDate=ISO8601&granularity=hour|day
 */
router.get('/timeseries', authenticate, reportingController.getTimeSeries);

/**
 * GET /api/v1/reporting/adapters
 * Get adapter performance breakdown
 * Query params: ?startDate=ISO8601&endDate=ISO8601
 */
router.get('/adapters', authenticate, reportingController.getAdapterPerformance);

/**
 * GET /api/v1/reporting/countries
 * Get country revenue breakdown
 * Query params: ?startDate=ISO8601&endDate=ISO8601&limit=10
 */
router.get('/countries', authenticate, reportingController.getCountryBreakdown);

/**
 * GET /api/v1/reporting/top-apps
 * Get top performing apps
 * Query params: ?startDate=ISO8601&endDate=ISO8601&limit=10
 */
router.get('/top-apps', authenticate, reportingController.getTopApps);

/**
 * GET /api/v1/reporting/realtime
 * Get real-time statistics (last hour)
 * No query params required
 */
router.get('/realtime', authenticate, reportingController.getRealtimeStats);

/**
 * GET /api/v1/reporting/adapters/health
 * Get real-time adapter health scores
 */
router.get('/adapters/health', authenticate, reportingController.getAdapterHealthScores);

/**
 * GET /api/v1/reporting/fraud/metrics
 * Get fraud detection metrics
 * Query params: ?startDate=ISO8601&endDate=ISO8601
 */
router.get('/fraud/metrics', authenticate, reportingController.getFraudMetrics);

/**
 * GET /api/v1/reporting/quality/metrics
 * Get quality metrics (viewability, completion, brand safety)
 * Query params: ?startDate=ISO8601&endDate=ISO8601
 */
router.get('/quality/metrics', authenticate, reportingController.getQualityMetrics);

/**
 * GET /api/v1/reporting/quality/viewability
 * Get detailed viewability metrics
 * Query params: ?startDate=ISO8601&endDate=ISO8601
 */
router.get('/quality/viewability', authenticate, reportingController.getViewabilityMetrics);

/**
 * GET /api/v1/reporting/quality/brand-safety
 * Get brand safety report
 * Query params: ?startDate=ISO8601&endDate=ISO8601
 */
router.get('/quality/brand-safety', authenticate, reportingController.getBrandSafetyReport);

/**
 * GET /api/v1/reporting/quality/anr
 * Get ANR (Application Not Responding) report
 * Query params: ?startDate=ISO8601&endDate=ISO8601
 */
router.get('/quality/anr', authenticate, reportingController.getANRReport);

/**
 * GET /api/v1/reporting/quality/slo
 * Get SLO (Service Level Objective) status
 * Query params: ?hours=24
 */
router.get('/quality/slo', authenticate, reportingController.getPerformanceSLOs);

/**
 * GET /api/v1/reporting/quality/alerts
 * Get quality alerts
 * Query params: ?hours=24
 */
router.get('/quality/alerts', authenticate, reportingController.getQualityAlerts);

/**
 * GET /api/v1/reporting/projections/revenue
 * Get revenue projections
 * Query params: ?days=7
 */
router.get('/projections/revenue', authenticate, reportingController.getRevenueProjections);

/**
 * GET /api/v1/reporting/cohorts
 * Get cohort analysis
 * Query params: ?startDate=ISO8601&endDate=ISO8601
 */
router.get('/cohorts', authenticate, reportingController.getCohortAnalysis);

/**
 * GET /api/v1/reporting/anomalies
 * Get detected anomalies
 * Query params: ?hours=24
 */
router.get('/anomalies', authenticate, reportingController.getAnomalies);

/**
 * GET /api/v1/reporting/dashboard
 * Get comprehensive dashboard data (all metrics combined)
 * No query params required - returns 7-day summary
 */
router.get('/dashboard', authenticate, reportingController.getDashboardData);

export default router;
