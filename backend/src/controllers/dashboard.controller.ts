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

    // Fetch real aggregations from revenue_events table
    const publisherId = req.user?.publisherId;
    if (!publisherId) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const pool = (await import('../utils/postgres')).default;
    const { rows } = await pool.query(
      `SELECT 
        COALESCE(SUM(revenue), 0) as total_revenue,
        COALESCE(SUM(impressions), 0) as total_impressions,
        COALESCE(SUM(clicks), 0) as total_clicks
       FROM revenue_events
       WHERE publisher_id = $1
         AND ($2::timestamptz IS NULL OR event_date >= $2::date)
         AND ($3::timestamptz IS NULL OR event_date <= $3::date)`,
      [publisherId, startDate || null, endDate || null]
    );

    const totalRevenue = Number(rows[0]?.total_revenue || 0);
    const totalImpressions = Number(rows[0]?.total_impressions || 0);
    const totalClicks = Number(rows[0]?.total_clicks || 0);

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

    // Fetch time-series from revenue_events table
    const publisherId = req.user?.publisherId;
    if (!publisherId) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const pool = (await import('../utils/postgres')).default;
    const dateFunc = granularity === 'hour' 
      ? `date_trunc('hour', event_date)` 
      : granularity === 'week'
      ? `date_trunc('week', event_date)`
      : `event_date`;

    const { rows } = await pool.query(
      `SELECT 
        ${dateFunc} as ts,
        COALESCE(SUM(revenue), 0) as revenue,
        COALESCE(SUM(impressions), 0) as impressions,
        COALESCE(SUM(clicks), 0) as clicks
       FROM revenue_events
       WHERE publisher_id = $1
         AND event_date >= CURRENT_DATE - $2::integer * INTERVAL '1 day'
       GROUP BY ts
       ORDER BY ts DESC`,
      [publisherId, days]
    );

    const series = rows.map((row: any) => ({
      ts: row.ts.toISOString(),
      revenue: Number(row.revenue),
      impressions: Number(row.impressions),
      clicks: Number(row.clicks),
      ctr: Number(row.impressions) > 0 ? Number(row.clicks) / Number(row.impressions) : 0,
      rpm: Number(row.impressions) > 0 ? (Number(row.revenue) / Number(row.impressions)) * 1000 : 0,
    }));

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
