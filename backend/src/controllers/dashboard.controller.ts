import { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger';

function toInt(val: unknown, def: number, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  const n = typeof val === 'string' ? parseInt(val, 10) : typeof val === 'number' ? Math.floor(val) : def;
  if (Number.isNaN(n)) return def;
  return Math.min(Math.max(n, min), max);
}

/**
 * GET /api/dashboard/overview
 * Provides a paged overview for dashboard tiles with safe defaults and guards
 */
export async function getOverview(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const page = toInt(req.query.page, 1, 1, 10_000);
    const pageSize = toInt(req.query.pageSize, 20, 1, 500);
    const startDate = req.query.startDate ? new Date(String(req.query.startDate)) : undefined;
    const endDate = req.query.endDate ? new Date(String(req.query.endDate)) : undefined;

    if ((startDate && isNaN(startDate.getTime())) || (endDate && isNaN(endDate.getTime()))) {
      res.status(400).json({ success: false, error: 'Invalid date format' });
      return;
    }
    if (startDate && endDate && startDate > endDate) {
      res.status(400).json({ success: false, error: 'startDate must be <= endDate' });
      return;
    }

    // TODO: Replace with real DB-backed aggregations
    const totalRevenue = 0; // guarded against divide-by-zero below
    const totalImpressions = 0;
    const totalClicks = 0;

    const ctr = totalImpressions > 0 ? totalClicks / totalImpressions : 0;
    const rpm = totalImpressions > 0 ? (totalRevenue / totalImpressions) * 1000 : 0;

    res.json({
      success: true,
      data: {
        tiles: {
          revenue: totalRevenue,
          impressions: totalImpressions,
          clicks: totalClicks,
          ctr,
          rpm,
        },
        page,
        pageSize,
        items: [],
      },
      meta: {
        startDate: startDate?.toISOString(),
        endDate: endDate?.toISOString(),
      },
    });
  } catch (error) {
    logger.error('[Dashboard] Failed to get overview', { error });
    next(error);
  }
}

/**
 * GET /api/dashboard/kpis
 * Returns KPI time-series with divide-by-zero guards and empty-series handling
 */
export async function getKpis(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const days = toInt(req.query.days, 30, 1, 365);
    const granularity = String(req.query.granularity || 'day');
    const validGranularities = new Set(['hour', 'day', 'week']);
    if (!validGranularities.has(granularity)) {
      res.status(400).json({ success: false, error: 'Invalid granularity. Use hour|day|week.' });
      return;
    }

    // TODO: Replace with ClickHouse-backed aggregation
    const series: Array<{ ts: string; revenue: number; impressions: number; clicks: number; ctr: number; rpm: number }>
      = [];

    // Example empty-series guard: always return array (possibly empty), never null
    res.json({
      success: true,
      data: series,
      meta: { days, granularity },
    });
  } catch (error) {
    logger.error('[Dashboard] Failed to get KPIs', { error });
    next(error);
  }
}

export default { getOverview, getKpis };
