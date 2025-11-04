import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { AppError } from '../middleware/errorHandler';
import {
  getAnalyticsOverview,
  getAnalyticsTimeSeries,
  getPerformanceBreakdown,
} from '../services/analyticsPipeline';
import analyticsService from '../services/analyticsService';
import logger from '../utils/logger';

const parseQueryParam = (value: unknown): string | undefined => {
  if (typeof value === 'string') {
    return value;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      if (typeof item === 'string') {
        return item;
      }
    }
  }

  return undefined;
};

/**
 * Get analytics overview
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

    const overview = await getAnalyticsOverview(publisherId);

    res.json({
      success: true,
      data: overview,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get analytics time series data
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

    const metricParam = parseQueryParam(req.query.metric);
    const metric = metricParam === 'impressions' || metricParam === 'clicks' ? metricParam : 'revenue';

    const startDateParam = parseQueryParam(req.query.startDate);
    const endDateParam = parseQueryParam(req.query.endDate);

    const timeSeries = await getAnalyticsTimeSeries(
      publisherId,
      metric,
      startDateParam,
      endDateParam
    );

    res.json({
      success: true,
      data: timeSeries,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get performance metrics by placement/adapter
 */
export const getPerformance = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const publisherId = req.user?.publisherId;

    if (!publisherId) {
      throw new AppError('Missing publisher context', 401);
    }

    const groupByParam = parseQueryParam(req.query.groupBy);
    const groupBy = groupByParam === 'adapter' ? 'adapter' : 'placement';

    const performance = await getPerformanceBreakdown(publisherId, groupBy);

    res.json({
      success: true,
      data: performance,
    });
  } catch (error) {
    next(error);
  }
};

// ========================================
// Event Ingestion Endpoints
// ========================================

// Validation schemas for event ingestion
const impressionEventSchema = z.object({
  event_id: z.string().uuid(),
  timestamp: z.string().datetime(),
  publisher_id: z.string().uuid(),
  app_id: z.string().uuid(),
  placement_id: z.string().uuid(),
  adapter_id: z.string().uuid(),
  adapter_name: z.string(),
  ad_unit_id: z.string(),
  ad_format: z.enum(['banner', 'interstitial', 'rewarded', 'native']),
  country_code: z.string().length(2),
  device_type: z.enum(['phone', 'tablet', 'tv']),
  os: z.enum(['ios', 'android']),
  os_version: z.string(),
  app_version: z.string(),
  sdk_version: z.string(),
  session_id: z.string().uuid(),
  user_id: z.string(),
  request_id: z.string().uuid(),
  bid_price_usd: z.number().nonnegative(),
  ecpm_usd: z.number().nonnegative(),
  latency_ms: z.number().int().nonnegative(),
  is_test_mode: z.boolean(),
});

const clickEventSchema = z.object({
  event_id: z.string().uuid(),
  timestamp: z.string().datetime(),
  impression_id: z.string().uuid(),
  publisher_id: z.string().uuid(),
  app_id: z.string().uuid(),
  placement_id: z.string().uuid(),
  adapter_id: z.string().uuid(),
  adapter_name: z.string(),
  click_url: z.string().url(),
  country_code: z.string().length(2),
  device_type: z.enum(['phone', 'tablet', 'tv']),
  os: z.enum(['ios', 'android']),
  session_id: z.string().uuid(),
  user_id: z.string(),
  request_id: z.string().uuid(),
  time_to_click_ms: z.number().int().nonnegative(),
  is_verified: z.boolean(),
  is_test_mode: z.boolean(),
});

const revenueEventSchema = z.object({
  event_id: z.string().uuid(),
  timestamp: z.string().datetime(),
  publisher_id: z.string().uuid(),
  app_id: z.string().uuid(),
  placement_id: z.string().uuid(),
  adapter_id: z.string().uuid(),
  adapter_name: z.string(),
  impression_id: z.string().uuid(),
  revenue_type: z.enum(['impression', 'click', 'install', 'iap']),
  revenue_usd: z.number().nonnegative(),
  revenue_currency: z.string().length(3),
  revenue_original: z.number().nonnegative(),
  exchange_rate: z.number().positive(),
  ecpm_usd: z.number().nonnegative(),
  country_code: z.string().length(2),
  ad_format: z.enum(['banner', 'interstitial', 'rewarded', 'native']),
  os: z.enum(['ios', 'android']),
  is_test_mode: z.boolean(),
  reconciliation_status: z.enum(['pending', 'matched', 'discrepancy']),
});

/**
 * POST /api/v1/analytics/events/impressions
 * Record impression events
 */
export const recordImpressions = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { events } = req.body as { events?: unknown };

    if (!Array.isArray(events)) {
      res.status(400).json({
        success: false,
        error: 'events must be an array',
      });
      return;
    }

    // Validate all events
    const validatedEvents = events.map((event: unknown) =>
      impressionEventSchema.parse(event)
    );

    // Record events
    await analyticsService.recordImpressions(validatedEvents);

    res.status(202).json({
      success: true,
      message: `Queued ${validatedEvents.length} impression events`,
      count: validatedEvents.length,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        success: false,
        error: 'Invalid event data',
        details: error.errors,
      });
      return;
    }

    logger.error('Failed to record impressions', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to record impression events',
    });
  }
};

/**
 * POST /api/v1/analytics/events/clicks
 * Record click events
 */
export const recordClicks = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { events } = req.body as { events?: unknown };

    if (!Array.isArray(events)) {
      res.status(400).json({
        success: false,
        error: 'events must be an array',
      });
      return;
    }

    const validatedEvents = events.map((event: unknown) =>
      clickEventSchema.parse(event)
    );

    await analyticsService.recordClicks(validatedEvents);

    res.status(202).json({
      success: true,
      message: `Queued ${validatedEvents.length} click events`,
      count: validatedEvents.length,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        success: false,
        error: 'Invalid event data',
        details: error.errors,
      });
      return;
    }

    logger.error('Failed to record clicks', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to record click events',
    });
  }
};

/**
 * POST /api/v1/analytics/events/revenue
 * Record revenue events
 */
export const recordRevenue = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { events } = req.body as { events?: unknown };

    if (!Array.isArray(events)) {
      res.status(400).json({
        success: false,
        error: 'events must be an array',
      });
      return;
    }

    const validatedEvents = events.map((event: unknown) =>
      revenueEventSchema.parse(event)
    );

    await analyticsService.recordRevenueEvents(validatedEvents);

    res.status(202).json({
      success: true,
      message: `Queued ${validatedEvents.length} revenue events`,
      count: validatedEvents.length,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        success: false,
        error: 'Invalid event data',
        details: error.errors,
      });
      return;
    }

    logger.error('Failed to record revenue', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to record revenue events',
    });
  }
};

/**
 * GET /api/v1/analytics/buffer-stats
 * Get current buffer statistics (for monitoring)
 */
export const getBufferStats = (req: Request, res: Response): void => {
  const stats = analyticsService.getBufferStats();
  
  res.json({
    success: true,
    data: stats,
  });
};
