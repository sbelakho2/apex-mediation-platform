/**
 * Analytics Aggregation Jobs
 * 
 * Background jobs for aggregating analytics data
 */

import { Job } from 'bullmq';
import logger from '../../utils/logger';
import { query } from '../../utils/postgres';
import { redis } from '../../utils/redis';
import { AnalyticsAggregationJob } from '../queueManager';

/**
 * Process analytics aggregation job
 */
export async function processAnalyticsAggregation(
  job: Job<AnalyticsAggregationJob>
): Promise<void> {
  const { publisherId, startDate, endDate, granularity } = job.data;
  const start = new Date(startDate);
  const end = new Date(endDate);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new Error('Invalid date range supplied to analytics aggregation job');
  }

  logger.info('Processing analytics aggregation', {
    jobId: job.id,
    publisherId,
    startDate,
    endDate,
    granularity,
  });

  try {
    // Update progress
    await job.updateProgress(10);

    // Aggregate impression data
    await aggregateImpressions(publisherId, start, end, granularity);
    await job.updateProgress(40);

    // Aggregate click data
    await aggregateClicks(publisherId, start, end, granularity);
    await job.updateProgress(60);

    // Aggregate revenue data
    await aggregateRevenue(publisherId, start, end, granularity);
    await job.updateProgress(80);

    // Calculate derived metrics
    await calculateMetrics(publisherId, start, end, granularity);
    await job.updateProgress(90);

    // Invalidate related caches
    await invalidateAnalyticsCache(publisherId, startDate, endDate);
    await job.updateProgress(100);

    logger.info('Analytics aggregation completed', {
      jobId: job.id,
      publisherId,
    });
  } catch (error) {
    logger.error('Analytics aggregation failed', {
      jobId: job.id,
      publisherId,
      error,
    });
    throw error;
  }
}

/**
 * Aggregate impression data
 */
async function aggregateImpressions(
  publisherId: string,
  startDate: Date,
  endDate: Date,
  _granularity: string
): Promise<void> {
  const sql = `
    WITH rollup AS (
      SELECT
        DATE_TRUNC('day', observed_at)::date AS bucket_date,
        publisher_id,
        COALESCE(app_id, '') AS app_id,
        COALESCE(ad_unit_id, '') AS ad_unit_id,
        COALESCE(adapter_id, '') AS adapter_id,
        COALESCE(country_code, 'ZZ') AS country_code,
        COUNT(*)::bigint AS impression_count,
        COUNT(*) FILTER (WHERE filled) AS filled_count
      FROM analytics_impressions
      WHERE publisher_id = $1
        AND observed_at >= $2
        AND observed_at < $3
      GROUP BY 1,2,3,4,5,6
    )
    INSERT INTO analytics_impression_rollups (
      bucket_date,
      publisher_id,
      app_id,
      ad_unit_id,
      adapter_id,
      country_code,
      impression_count,
      filled_count
    )
    SELECT
      bucket_date,
      publisher_id,
      app_id,
      ad_unit_id,
      adapter_id,
      country_code,
      impression_count,
      filled_count
    FROM rollup
    ON CONFLICT (bucket_date, publisher_id, app_id, ad_unit_id, adapter_id, country_code)
    DO UPDATE SET
      impression_count = EXCLUDED.impression_count,
      filled_count = EXCLUDED.filled_count,
      updated_at = NOW();
  `;

  await query(sql, [publisherId, startDate, endDate], { label: 'analytics_impression_rollup' });

  logger.debug('Impressions aggregated', {
    publisherId,
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
  });
}

/**
 * Aggregate click data
 */
async function aggregateClicks(
  publisherId: string,
  startDate: Date,
  endDate: Date,
  _granularity: string
): Promise<void> {
  const sql = `
    WITH rollup AS (
      SELECT
        DATE_TRUNC('day', observed_at)::date AS bucket_date,
        publisher_id,
        COALESCE(app_id, '') AS app_id,
        COALESCE(ad_unit_id, '') AS ad_unit_id,
        COALESCE(adapter_id, '') AS adapter_id,
        COALESCE(country_code, 'ZZ') AS country_code,
        COUNT(*)::bigint AS click_count
      FROM analytics_clicks
      WHERE publisher_id = $1
        AND observed_at >= $2
        AND observed_at < $3
      GROUP BY 1,2,3,4,5,6
    )
    INSERT INTO analytics_click_rollups (
      bucket_date,
      publisher_id,
      app_id,
      ad_unit_id,
      adapter_id,
      country_code,
      click_count
    )
    SELECT
      bucket_date,
      publisher_id,
      app_id,
      ad_unit_id,
      adapter_id,
      country_code,
      click_count
    FROM rollup
    ON CONFLICT (bucket_date, publisher_id, app_id, ad_unit_id, adapter_id, country_code)
    DO UPDATE SET
      click_count = EXCLUDED.click_count,
      updated_at = NOW();
  `;

  await query(sql, [publisherId, startDate, endDate], { label: 'analytics_click_rollup' });

  logger.debug('Clicks aggregated', {
    publisherId,
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
  });
}

/**
 * Aggregate revenue data
 */
async function aggregateRevenue(
  publisherId: string,
  startDate: Date,
  endDate: Date,
  _granularity: string
): Promise<void> {
  const sql = `
    WITH rollup AS (
      SELECT
        DATE_TRUNC('day', observed_at)::date AS bucket_date,
        publisher_id,
        COALESCE(app_id, '') AS app_id,
        COALESCE(ad_unit_id, '') AS ad_unit_id,
        COALESCE(adapter_id, '') AS adapter_id,
        COALESCE(country_code, 'ZZ') AS country_code,
        COALESCE(SUM(revenue_usd), 0)::numeric(24,8) AS total_revenue,
        COALESCE(AVG(revenue_usd), 0)::numeric(24,8) AS avg_revenue,
        COALESCE(MAX(revenue_usd), 0)::numeric(24,8) AS max_revenue,
        COUNT(*)::bigint AS revenue_event_count
      FROM analytics_revenue_events
      WHERE publisher_id = $1
        AND observed_at >= $2
        AND observed_at < $3
      GROUP BY 1,2,3,4,5,6
    )
    INSERT INTO analytics_revenue_rollups (
      bucket_date,
      publisher_id,
      app_id,
      ad_unit_id,
      adapter_id,
      country_code,
      total_revenue,
      avg_revenue,
      max_revenue,
      revenue_event_count
    )
    SELECT
      bucket_date,
      publisher_id,
      app_id,
      ad_unit_id,
      adapter_id,
      country_code,
      total_revenue,
      avg_revenue,
      max_revenue,
      revenue_event_count
    FROM rollup
    ON CONFLICT (bucket_date, publisher_id, app_id, ad_unit_id, adapter_id, country_code)
    DO UPDATE SET
      total_revenue = EXCLUDED.total_revenue,
      avg_revenue = EXCLUDED.avg_revenue,
      max_revenue = EXCLUDED.max_revenue,
      revenue_event_count = EXCLUDED.revenue_event_count,
      updated_at = NOW();
  `;

  await query(sql, [publisherId, startDate, endDate], { label: 'analytics_revenue_rollup' });

  logger.debug('Revenue aggregated', {
    publisherId,
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
  });
}

/**
 * Calculate derived metrics
 */
async function calculateMetrics(
  publisherId: string,
  startDate: Date,
  endDate: Date,
  _granularity: string
): Promise<void> {
  const sql = `
    WITH metrics AS (
      SELECT
        i.bucket_date,
        i.publisher_id,
        i.app_id,
        i.ad_unit_id,
        i.adapter_id,
        i.country_code,
        i.impression_count,
        i.filled_count,
        COALESCE(c.click_count, 0) AS click_count,
        COALESCE(r.total_revenue, 0)::numeric(24,8) AS total_revenue,
        CASE WHEN i.impression_count > 0
          THEN (COALESCE(c.click_count, 0)::numeric / i.impression_count) * 100
          ELSE 0
        END AS ctr,
        CASE WHEN i.impression_count > 0
          THEN (i.filled_count::numeric / i.impression_count) * 100
          ELSE 0
        END AS fill_rate,
        CASE WHEN i.impression_count > 0
          THEN (COALESCE(r.total_revenue, 0) / i.impression_count) * 1000
          ELSE 0
        END AS ecpm
      FROM analytics_impression_rollups i
      LEFT JOIN analytics_click_rollups c
        ON c.bucket_date = i.bucket_date
       AND c.publisher_id = i.publisher_id
       AND c.app_id = i.app_id
       AND c.ad_unit_id = i.ad_unit_id
       AND c.adapter_id = i.adapter_id
       AND c.country_code = i.country_code
      LEFT JOIN analytics_revenue_rollups r
        ON r.bucket_date = i.bucket_date
       AND r.publisher_id = i.publisher_id
       AND r.app_id = i.app_id
       AND r.ad_unit_id = i.ad_unit_id
       AND r.adapter_id = i.adapter_id
       AND r.country_code = i.country_code
      WHERE i.publisher_id = $1
        AND i.bucket_date >= $2::date
        AND i.bucket_date < $3::date
    )
    INSERT INTO analytics_metrics_rollups (
      bucket_date,
      publisher_id,
      app_id,
      ad_unit_id,
      adapter_id,
      country_code,
      impression_count,
      filled_count,
      click_count,
      total_revenue,
      ctr,
      fill_rate,
      ecpm
    )
    SELECT
      bucket_date,
      publisher_id,
      app_id,
      ad_unit_id,
      adapter_id,
      country_code,
      impression_count,
      filled_count,
      click_count,
      total_revenue,
      ctr,
      fill_rate,
      ecpm
    FROM metrics
    ON CONFLICT (bucket_date, publisher_id, app_id, ad_unit_id, adapter_id, country_code)
    DO UPDATE SET
      impression_count = EXCLUDED.impression_count,
      filled_count = EXCLUDED.filled_count,
      click_count = EXCLUDED.click_count,
      total_revenue = EXCLUDED.total_revenue,
      ctr = EXCLUDED.ctr,
      fill_rate = EXCLUDED.fill_rate,
      ecpm = EXCLUDED.ecpm,
      updated_at = NOW();
  `;

  await query(sql, [publisherId, startDate, endDate], { label: 'analytics_metrics_rollup' });

  logger.debug('Metrics calculated', {
    publisherId,
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
  });
}

/**
 * Invalidate analytics caches
 */
async function invalidateAnalyticsCache(
  publisherId: string,
  startDate: string,
  endDate: string
): Promise<void> {
  if (!redis.isReady()) {
    logger.warn('Redis not available, skipping cache invalidation');
    return;
  }

  try {
    // Invalidate all analytics caches for this publisher
    await redis.delPattern(`analytics:*:${publisherId}:*`);

    logger.debug('Analytics cache invalidated', {
      publisherId,
      startDate,
      endDate,
    });
  } catch (error) {
    logger.error('Failed to invalidate analytics cache', { error });
  }
}

/**
 * Schedule daily aggregation for all publishers
 */
export function scheduleDailyAggregation(): void {
  logger.info('Scheduling daily analytics aggregation');
  // This will be called from the queue initialization
  // Actual implementation in queueInitializer.ts
}
