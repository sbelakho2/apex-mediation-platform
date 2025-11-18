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
import config from '../config/index';
import { queueManager, QueueName } from '../queues/queueManager';
import { analyticsEventsEnqueuedTotal } from '../utils/prometheus';

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

// =============================
// Ingestion helpers (producer)
// =============================

async function enqueueIfEnabled(kind: 'impressions' | 'clicks' | 'revenue', events: unknown[], publisherId?: string) {
  // Only enqueue when flag enabled and queue is ready; otherwise let callers fall back to direct service path
  try {
    if (!config.useRedisStreamsForAnalytics || !queueManager || !queueManager.isReady()) return false;
    const queue = (queueManager as any).getQueue ? (queueManager as any).getQueue(QueueName.ANALYTICS_INGEST) : null;
    if (!queue) return false;
    await queue.add(kind, { kind, events, publisherId }, {
      removeOnComplete: true,
      removeOnFail: { age: 3600 },
    });
    try { analyticsEventsEnqueuedTotal.inc({ kind }); } catch { /* noop */ }
    return true;
  } catch (e) {
    // On any error, skip enqueue so API path can attempt synchronous processing
    logger.warn('[Analytics] enqueue failed, falling back to direct insert', { error: (e as Error).message });
    return false;
  }
}

/**
 * POST /api/v1/analytics/events/impressions
 */
export const recordImpressions = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const publisherId = req.user?.publisherId; // may be undefined for SDK calls
    const events = Array.isArray(req.body) ? req.body : (req.body?.events ?? []);
    if (!Array.isArray(events) || events.length === 0) {
      throw new AppError('No events provided', 400);
    }
    const enqueued = await enqueueIfEnabled('impressions', events, publisherId);
    if (enqueued) { res.status(202).json({ success: true, queued: events.length }); return; }
    await analyticsService.recordImpressions(events);
    res.status(201).json({ success: true, inserted: events.length });
  } catch (error) {
    logger.error('Failed to record impressions', { error });
    next(error);
  }
};

/**
 * POST /api/v1/analytics/events/clicks
 */
export const recordClicks = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const publisherId = req.user?.publisherId;
    const events = Array.isArray(req.body) ? req.body : (req.body?.events ?? []);
    if (!Array.isArray(events) || events.length === 0) {
      throw new AppError('No events provided', 400);
    }
    const enqueued = await enqueueIfEnabled('clicks', events, publisherId);
    if (enqueued) { res.status(202).json({ success: true, queued: events.length }); return; }
    await analyticsService.recordClicks(events);
    res.status(201).json({ success: true, inserted: events.length });
  } catch (error) {
    logger.error('Failed to record clicks', { error });
    next(error);
  }
};

/**
 * POST /api/v1/analytics/events/revenue
 */
export const recordRevenue = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const publisherId = req.user?.publisherId;
    const events = Array.isArray(req.body) ? req.body : (req.body?.events ?? []);
    if (!Array.isArray(events) || events.length === 0) {
      throw new AppError('No events provided', 400);
    }
    const enqueued = await enqueueIfEnabled('revenue', events, publisherId);
    if (enqueued) { res.status(202).json({ success: true, queued: events.length }); return; }
    await analyticsService.recordRevenue(events);
    res.status(201).json({ success: true, inserted: events.length });
  } catch (error) {
    logger.error('Failed to record revenue', { error });
    next(error);
  }
};

/**
 * GET /api/v1/analytics/buffer-stats
 * Include queue metrics when available
 */
export const getBufferStats = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const base = await analyticsService.getBufferStats?.();
    const stats: any = { ...(base || {}) };
    try {
      if (queueManager && queueManager.isReady()) {
        const q = (queueManager as any).getQueue ? (queueManager as any).getQueue(QueueName.ANALYTICS_INGEST) : null;
        if (q && typeof q.getWaitingCount === 'function') {
          const [waiting, active, delayed, failed] = await Promise.all([
            q.getWaitingCount?.() ?? 0,
            q.getActiveCount?.() ?? 0,
            q.getDelayedCount?.() ?? 0,
            q.getFailedCount?.() ?? 0,
          ]);
          stats.queue = { waiting, active, delayed, failed };
        }
      }
    } catch (e) {
      // Non-fatal
      stats.queue = { error: (e as Error).message };
    }
    res.json({ success: true, data: stats });
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
