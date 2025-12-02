/**
 * Reporting Controller
 * 
 * Provides reporting and analytics endpoints for dashboard
 */

import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { AppError } from '../middleware/errorHandler';
import reportingService from '../services/reportingService';
import qualityMonitoringService from '../services/qualityMonitoringService';
import logger from '../utils/logger';

// Validation schemas
const dateRangeSchema = z.object({
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

const timeSeriesQuerySchema = dateRangeSchema.extend({
  granularity: z.enum(['hour', 'day']).optional(),
});

const countryQuerySchema = dateRangeSchema.extend({
  limit: z.coerce.number().int().positive().max(50).optional(),
});

/**
 * Helper to parse date range from query
 */
const parseDateRange = (query: unknown): { startDate: Date; endDate: Date } => {
  const validated = dateRangeSchema.parse(query);

  const now = new Date();
  const endDateRaw = validated.endDate ? new Date(validated.endDate) : now;
  const endDate = Number.isNaN(endDateRaw.getTime()) ? now : endDateRaw;

  const startRaw = validated.startDate ? new Date(validated.startDate) : new Date(endDate.getTime() - 7 * 24 * 60 * 60 * 1000);
  const startDate = Number.isNaN(startRaw.getTime()) ? new Date(endDate.getTime() - 7 * 24 * 60 * 60 * 1000) : startRaw;

  // Enforce maximum window of 31 days to avoid heavy queries (FIX-11: 668)
  const maxWindowMs = 31 * 24 * 60 * 60 * 1000;
  const windowMs = endDate.getTime() - startDate.getTime();
  if (windowMs > maxWindowMs) {
    const cappedStart = new Date(endDate.getTime() - maxWindowMs);
    return { startDate: cappedStart, endDate };
  }

  return { startDate, endDate };
};

/**
 * GET /api/v1/reporting/overview
 * Get revenue overview statistics
 */
export const getOverview = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const publisherId = req.user?.publisherId;

    if (!publisherId) {
      throw new AppError('Missing publisher context', 401);
    }

    const { startDate, endDate } = parseDateRange(req.query);

    const stats = await reportingService.getRevenueStats(
      publisherId,
      startDate,
      endDate
    );

    res.json({
      success: true,
      data: {
        ...stats,
        period: {
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
        },
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new AppError('Invalid query parameters', 400));
      return;
    }
    next(error);
  }
};

/**
 * GET /api/v1/reporting/timeseries
 * Get time series data for charts
 */
export const getTimeSeries = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const publisherId = req.user?.publisherId;

    if (!publisherId) {
      throw new AppError('Missing publisher context', 401);
    }

    const validated = timeSeriesQuerySchema.parse(req.query);
    const { startDate, endDate } = parseDateRange(req.query);
    const granularity = validated.granularity || 'day';

    const data = await reportingService.getTimeSeriesData(
      publisherId,
      startDate,
      endDate,
      granularity
    );

    res.json({
      success: true,
      data: {
        series: data,
        granularity,
        period: {
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
        },
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new AppError('Invalid query parameters', 400));
      return;
    }
    next(error);
  }
};

/**
 * GET /api/v1/reporting/adapters
 * Get performance breakdown by adapter
 */
export const getAdapterPerformance = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const publisherId = req.user?.publisherId;

    if (!publisherId) {
      throw new AppError('Missing publisher context', 401);
    }

    const { startDate, endDate } = parseDateRange(req.query);

    const data = await reportingService.getAdapterPerformance(
      publisherId,
      startDate,
      endDate
    );

    res.json({
      success: true,
      data: {
        adapters: data,
        period: {
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
        },
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new AppError('Invalid query parameters', 400));
      return;
    }
    next(error);
  }
};

/**
 * GET /api/v1/reporting/countries
 * Get revenue breakdown by country
 */
export const getCountryBreakdown = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const publisherId = req.user?.publisherId;

    if (!publisherId) {
      throw new AppError('Missing publisher context', 401);
    }

    const validated = countryQuerySchema.parse(req.query);
    const { startDate, endDate } = parseDateRange(req.query);
    const limit = validated.limit || 10;

    const data = await reportingService.getCountryBreakdown(
      publisherId,
      startDate,
      endDate,
      limit
    );

    res.json({
      success: true,
      data: {
        countries: data,
        period: {
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
        },
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new AppError('Invalid query parameters', 400));
      return;
    }
    next(error);
  }
};

/**
 * GET /api/v1/reporting/top-apps
 * Get top performing apps
 */
export const getTopApps = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const publisherId = req.user?.publisherId;

    if (!publisherId) {
      throw new AppError('Missing publisher context', 401);
    }

    const validated = countryQuerySchema.parse(req.query);
    const { startDate, endDate } = parseDateRange(req.query);
    const limit = validated.limit || 10;

    const data = await reportingService.getTopApps(
      publisherId,
      startDate,
      endDate,
      limit
    );

    res.json({
      success: true,
      data: {
        apps: data,
        period: {
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
        },
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new AppError('Invalid query parameters', 400));
      return;
    }
    next(error);
  }
};

/**
 * GET /api/v1/reporting/realtime
 * Get real-time statistics (last hour)
 */
export const getRealtimeStats = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const publisherId = req.user?.publisherId;

    if (!publisherId) {
      throw new AppError('Missing publisher context', 401);
    }

    const data = await reportingService.getRealtimeStats(publisherId);

    res.json({
      success: true,
      data: {
        ...data,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    logger.error('Failed to get realtime stats', { error });
    next(error);
  }
};

/**
 * GET /api/v1/reporting/adapters/health
 * Get real-time adapter health scores
 */
export const getAdapterHealthScores = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const publisherId = req.user?.publisherId;

    if (!publisherId) {
      throw new AppError('Missing publisher context', 401);
    }

    const healthScores = await reportingService.getAdapterHealthScores(publisherId);

    res.json({
      success: true,
      data: healthScores,
      meta: {
        timestamp: new Date().toISOString(),
        count: healthScores.length,
      },
    });
  } catch (error) {
    logger.error('Failed to get adapter health scores', { error });
    next(error);
  }
};

/**
 * GET /api/v1/reporting/fraud/metrics
 * Get fraud detection metrics
 */
export const getFraudMetrics = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const publisherId = req.user?.publisherId;

    if (!publisherId) {
      throw new AppError('Missing publisher context', 401);
    }

    const { startDate, endDate } = parseDateRange(req.query);

    const metrics = await reportingService.getFraudMetrics(publisherId, startDate, endDate);

    res.json({
      success: true,
      data: metrics,
      meta: {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new AppError('Invalid query parameters', 400));
      return;
    }
    next(error);
  }
};

/**
 * GET /api/v1/reporting/quality/metrics
 * Get quality metrics (viewability, completion, brand safety)
 */
export const getQualityMetrics = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const publisherId = req.user?.publisherId;

    if (!publisherId) {
      throw new AppError('Missing publisher context', 401);
    }

    const { startDate, endDate } = parseDateRange(req.query);

    const metrics = await reportingService.getQualityMetrics(publisherId, startDate, endDate);

    res.json({
      success: true,
      data: metrics,
      meta: {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new AppError('Invalid query parameters', 400));
      return;
    }
    next(error);
  }
};

/**
 * GET /api/v1/reporting/quality/viewability
 * Get detailed viewability metrics
 */
export const getViewabilityMetrics = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const publisherId = req.user?.publisherId;

    if (!publisherId) {
      throw new AppError('Missing publisher context', 401);
    }

    const { startDate, endDate } = parseDateRange(req.query);

    const metrics = await qualityMonitoringService.getViewabilityMetrics(publisherId, startDate, endDate);

    res.json({
      success: true,
      data: metrics,
      meta: {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new AppError('Invalid query parameters', 400));
      return;
    }
    next(error);
  }
};

/**
 * GET /api/v1/reporting/quality/brand-safety
 * Get brand safety report
 */
export const getBrandSafetyReport = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const publisherId = req.user?.publisherId;

    if (!publisherId) {
      throw new AppError('Missing publisher context', 401);
    }

    const { startDate, endDate } = parseDateRange(req.query);

    const report = await qualityMonitoringService.getBrandSafetyReport(publisherId, startDate, endDate);

    res.json({
      success: true,
      data: report,
      meta: {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new AppError('Invalid query parameters', 400));
      return;
    }
    next(error);
  }
};

/**
 * GET /api/v1/reporting/quality/anr
 * Get ANR (Application Not Responding) report
 */
export const getANRReport = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const publisherId = req.user?.publisherId;

    if (!publisherId) {
      throw new AppError('Missing publisher context', 401);
    }

    const { startDate, endDate } = parseDateRange(req.query);

    const report = await qualityMonitoringService.getANRReport(publisherId, startDate, endDate);

    res.json({
      success: true,
      data: report,
      meta: {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new AppError('Invalid query parameters', 400));
      return;
    }
    next(error);
  }
};

/**
 * GET /api/v1/reporting/quality/slo
 * Get SLO (Service Level Objective) status
 */
export const getPerformanceSLOs = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const publisherId = req.user?.publisherId;

    if (!publisherId) {
      throw new AppError('Missing publisher context', 401);
    }

    const hours = parseInt(req.query.hours as string) || 24;

    const slos = await qualityMonitoringService.getPerformanceSLOs(publisherId, hours);

    res.json({
      success: true,
      data: slos,
      meta: {
        timeWindow: `${hours} hours`,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    logger.error('Failed to get performance SLOs', { error });
    next(error);
  }
};

/**
 * GET /api/v1/reporting/quality/alerts
 * Get quality alerts
 */
export const getQualityAlerts = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const publisherId = req.user?.publisherId;

    if (!publisherId) {
      throw new AppError('Missing publisher context', 401);
    }

    const hours = parseInt(req.query.hours as string) || 24;

    const alerts = await qualityMonitoringService.getQualityAlerts(publisherId, hours);

    res.json({
      success: true,
      data: alerts,
      meta: {
        timeWindow: `${hours} hours`,
        timestamp: new Date().toISOString(),
        count: alerts.length,
      },
    });
  } catch (error) {
    logger.error('Failed to get quality alerts', { error });
    next(error);
  }
};

/**
 * GET /api/v1/reporting/projections/revenue
 * Get revenue projections
 */
export const getRevenueProjections = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const publisherId = req.user?.publisherId;

    if (!publisherId) {
      throw new AppError('Missing publisher context', 401);
    }

    const days = parseInt(req.query.days as string) || 7;

    const projections = await reportingService.getRevenueProjections(publisherId, days);

    res.json({
      success: true,
      data: projections,
      meta: {
        forecastDays: days,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    logger.error('Failed to get revenue projections', { error });
    next(error);
  }
};

/**
 * GET /api/v1/reporting/cohorts
 * Get cohort analysis
 */
export const getCohortAnalysis = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const publisherId = req.user?.publisherId;

    if (!publisherId) {
      throw new AppError('Missing publisher context', 401);
    }

    const { startDate, endDate } = parseDateRange(req.query);

    const cohorts = await reportingService.getCohortAnalysis(publisherId, startDate, endDate);

    res.json({
      success: true,
      data: cohorts,
      meta: {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        count: cohorts.length,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new AppError('Invalid query parameters', 400));
      return;
    }
    next(error);
  }
};

/**
 * GET /api/v1/reporting/anomalies
 * Get detected anomalies
 */
export const getAnomalies = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const publisherId = req.user?.publisherId;

    if (!publisherId) {
      throw new AppError('Missing publisher context', 401);
    }

    const hours = parseInt(req.query.hours as string) || 24;

    const anomalies = await reportingService.getAnomalies(publisherId, hours);

    res.json({
      success: true,
      data: anomalies,
      meta: {
        timeWindow: `${hours} hours`,
        timestamp: new Date().toISOString(),
        count: anomalies.length,
      },
    });
  } catch (error) {
    logger.error('Failed to get anomalies', { error });
    next(error);
  }
};

/**
 * GET /api/v1/reporting/dashboard
 * Get comprehensive dashboard data (all metrics combined)
 */
export const getDashboardData = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const publisherId = req.user?.publisherId;

    if (!publisherId) {
      throw new AppError('Missing publisher context', 401);
    }

    const last7Days = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const now = new Date();

    // Fetch all metrics in parallel
    const [
      revenueStats,
      adapterHealth,
      fraudMetrics,
      qualityMetrics,
      slos,
      alerts,
      anomalies,
    ] = await Promise.all([
      reportingService.getRevenueStats(publisherId, last7Days, now),
      reportingService.getAdapterHealthScores(publisherId),
      reportingService.getFraudMetrics(publisherId, last7Days, now),
      reportingService.getQualityMetrics(publisherId, last7Days, now),
      qualityMonitoringService.getPerformanceSLOs(publisherId, 24),
      qualityMonitoringService.getQualityAlerts(publisherId, 24),
      reportingService.getAnomalies(publisherId, 24),
    ]);

    const sloValues = Object.values(slos);

    res.json({
      success: true,
      data: {
        revenue: revenueStats,
        adapters: {
          health: adapterHealth.slice(0, 5), // Top 5 adapters
          totalActive: adapterHealth.filter(a => a.status !== 'offline').length,
        },
        fraud: {
          rate: fraudMetrics.fraudRate,
          blockedRevenue: fraudMetrics.blockedRevenue,
        },
        quality: {
          viewabilityRate: qualityMetrics.viewabilityRate,
          anrRate: qualityMetrics.anrRate,
          crashRate: qualityMetrics.crashRate,
        },
        slos: {
          breached: sloValues.filter(slo => slo.status === 'breached').length,
          atRisk: sloValues.filter(slo => slo.status === 'at-risk').length,
        },
        alerts: {
          critical: alerts.filter(a => a.severity === 'critical').length,
          high: alerts.filter(a => a.severity === 'high').length,
          total: alerts.length,
        },
        anomalies: {
          count: anomalies.length,
          types: anomalies.reduce((acc, a) => {
            acc[a.type] = (acc[a.type] || 0) + 1;
            return acc;
          }, {} as Record<string, number>),
        },
      },
      meta: {
        timestamp: new Date().toISOString(),
        timeRange: '7 days',
      },
    });
  } catch (error) {
    logger.error('Failed to get dashboard data', { error });
    next(error);
  }
};
