/**
 * Analytics Aggregation Jobs
 * 
 * Background jobs for aggregating analytics data
 */

import { Job } from 'bullmq';
import logger from '../../utils/logger';
import clickhouse from '../../utils/clickhouse';
import { redis } from '../../utils/redis';
import { AnalyticsAggregationJob } from '../queueManager';

/**
 * Process analytics aggregation job
 */
export async function processAnalyticsAggregation(
  job: Job<AnalyticsAggregationJob>
): Promise<void> {
  const { publisherId, startDate, endDate, granularity } = job.data;

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
    await aggregateImpressions(publisherId, startDate, endDate, granularity);
    await job.updateProgress(40);

    // Aggregate click data
    await aggregateClicks(publisherId, startDate, endDate, granularity);
    await job.updateProgress(60);

    // Aggregate revenue data
    await aggregateRevenue(publisherId, startDate, endDate, granularity);
    await job.updateProgress(80);

    // Calculate derived metrics
    await calculateMetrics(publisherId, startDate, endDate, granularity);
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
  startDate: string,
  endDate: string,
  _granularity: string
): Promise<void> {
  const query = `
    INSERT INTO analytics.impressions_aggregated
    SELECT
      toDate(timestamp) as date,
      publisher_id,
      app_id,
      ad_unit_id,
      adapter_id,
      country,
      count(*) as impression_count,
      countIf(is_filled = 1) as filled_count,
      now() as created_at
    FROM analytics.impressions
    WHERE publisher_id = {publisherId:String}
      AND timestamp >= {startDate:String}
      AND timestamp < {endDate:String}
    GROUP BY date, publisher_id, app_id, ad_unit_id, adapter_id, country
  `;

  await clickhouse.executeQuery(query, {
    publisherId,
    startDate,
    endDate,
  });

  logger.debug('Impressions aggregated', { publisherId, startDate, endDate });
}

/**
 * Aggregate click data
 */
async function aggregateClicks(
  publisherId: string,
  startDate: string,
  endDate: string,
  _granularity: string
): Promise<void> {
  const query = `
    INSERT INTO analytics.clicks_aggregated
    SELECT
      toDate(timestamp) as date,
      publisher_id,
      app_id,
      ad_unit_id,
      adapter_id,
      country,
      count(*) as click_count,
      now() as created_at
    FROM analytics.clicks
    WHERE publisher_id = {publisherId:String}
      AND timestamp >= {startDate:String}
      AND timestamp < {endDate:String}
    GROUP BY date, publisher_id, app_id, ad_unit_id, adapter_id, country
  `;

  await clickhouse.executeQuery(query, {
    publisherId,
    startDate,
    endDate,
  });

  logger.debug('Clicks aggregated', { publisherId, startDate, endDate });
}

/**
 * Aggregate revenue data
 */
async function aggregateRevenue(
  publisherId: string,
  startDate: string,
  endDate: string,
  _granularity: string
): Promise<void> {
  const query = `
    INSERT INTO analytics.revenue_aggregated
    SELECT
      toDate(timestamp) as date,
      publisher_id,
      app_id,
      ad_unit_id,
      adapter_id,
      country,
      sum(revenue) as total_revenue,
      avg(revenue) as avg_revenue,
      max(revenue) as max_revenue,
      count(*) as revenue_event_count,
      now() as created_at
    FROM analytics.revenue
    WHERE publisher_id = {publisherId:String}
      AND timestamp >= {startDate:String}
      AND timestamp < {endDate:String}
    GROUP BY date, publisher_id, app_id, ad_unit_id, adapter_id, country
  `;

  await clickhouse.executeQuery(query, {
    publisherId,
    startDate,
    endDate,
  });

  logger.debug('Revenue aggregated', { publisherId, startDate, endDate });
}

/**
 * Calculate derived metrics
 */
async function calculateMetrics(
  publisherId: string,
  startDate: string,
  endDate: string,
  _granularity: string
): Promise<void> {
  // Calculate CTR, fill rate, eCPM, etc.
  const query = `
    INSERT INTO analytics.metrics_aggregated
    SELECT
      date,
      publisher_id,
      app_id,
      ad_unit_id,
      adapter_id,
      country,
      impressions.impression_count,
      impressions.filled_count,
      clicks.click_count,
      revenue.total_revenue,
      if(impressions.impression_count > 0, 
         clicks.click_count / impressions.impression_count * 100, 0) as ctr,
      if(impressions.impression_count > 0,
         impressions.filled_count / impressions.impression_count * 100, 0) as fill_rate,
      if(impressions.impression_count > 0,
         revenue.total_revenue / impressions.impression_count * 1000, 0) as ecpm,
      now() as created_at
    FROM analytics.impressions_aggregated impressions
    LEFT JOIN analytics.clicks_aggregated clicks USING (date, publisher_id, app_id, ad_unit_id, adapter_id, country)
    LEFT JOIN analytics.revenue_aggregated revenue USING (date, publisher_id, app_id, ad_unit_id, adapter_id, country)
    WHERE impressions.publisher_id = {publisherId:String}
      AND impressions.date >= {startDate:String}
      AND impressions.date < {endDate:String}
  `;

  await clickhouse.executeQuery(query, {
    publisherId,
    startDate,
    endDate,
  });

  logger.debug('Metrics calculated', { publisherId, startDate, endDate });
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
