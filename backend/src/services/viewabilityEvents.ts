/**
 * Viewability Events Service
 * 
 * SDK_CHECKS Part 7.3: OMSDK/viewability events pass-through
 * 
 * Handles viewability events from SDKs where OMSDK is available.
 * Events are stored for analytics and Console display.
 */

import logger from '../utils/logger';
import { query } from '../utils/postgres';
import { Counter, Histogram, Gauge } from 'prom-client';

// -----------------------------------------------------
// Prometheus Metrics
// -----------------------------------------------------

export const viewabilityEventsTotal = new Counter({
  name: 'viewability_events_total',
  help: 'Total viewability events received',
  labelNames: ['platform', 'event_type', 'omsdk_available'],
});

export const viewabilityRateGauge = new Gauge({
  name: 'viewability_rate',
  help: 'Current viewability rate (0-1)',
  labelNames: ['publisher_id', 'placement_id'],
});

export const viewableTimeHistogram = new Histogram({
  name: 'viewable_time_ms',
  help: 'Distribution of viewable time in milliseconds',
  buckets: [100, 500, 1000, 2000, 5000, 10000, 30000],
  labelNames: ['ad_format'],
});

// -----------------------------------------------------
// Types
// -----------------------------------------------------

export interface ViewabilityEvent {
  requestId: string;
  impressionId: string;
  placementId: string;
  publisherId?: string;
  platform: 'ios' | 'android' | 'android_tv' | 'tvos' | 'unity' | 'web';
  adFormat: 'banner' | 'interstitial' | 'rewarded' | 'native' | 'video';
  
  // OMSDK data (if available)
  omsdkAvailable: boolean;
  omsdkSessionStarted?: boolean;
  omsdkVersion?: string;
  
  // Viewability metrics
  wasViewable: boolean;
  measurable: boolean;
  viewableTimeMs?: number;
  totalDurationMs?: number;
  viewablePercent?: number;
  
  // Video quartile events
  quartiles?: {
    start?: boolean;
    firstQuartile?: boolean;
    midpoint?: boolean;
    thirdQuartile?: boolean;
    complete?: boolean;
  };
  
  // Engagement
  engagementEvents?: string[]; // ['mute', 'unmute', 'pause', 'resume', 'click']
  
  // Geometry (if OMSDK)
  geometry?: {
    coveragePercent?: number;
    overlappingCreatives?: number;
    onScreenPercent?: number;
  };
  
  // Timestamp
  eventTimestamp: Date;
  receivedAt?: Date;
}

export interface ViewabilitySummary {
  placementId: string;
  publisherId?: string;
  totalImpressions: number;
  measurableImpressions: number;
  viewableImpressions: number;
  viewabilityRate: number;
  averageViewableTimeMs: number;
  quartileRates?: {
    start: number;
    firstQuartile: number;
    midpoint: number;
    thirdQuartile: number;
    complete: number;
  };
}

// -----------------------------------------------------
// Event Buffer (for batching)
// -----------------------------------------------------

const eventBuffer: ViewabilityEvent[] = [];
const MAX_BUFFER_SIZE = 100;
const FLUSH_INTERVAL_MS = 5000;

// Flush buffer periodically
let flushTimer: NodeJS.Timeout | null = null;

function startFlushTimer(): void {
  if (flushTimer) return;
  flushTimer = setInterval(() => {
    void flushBuffer().catch(err => logger.warn('Viewability buffer flush failed', { error: err }));
  }, FLUSH_INTERVAL_MS);
}

async function flushBuffer(): Promise<void> {
  if (eventBuffer.length === 0) return;
  
  const toFlush = eventBuffer.splice(0, eventBuffer.length);
  
  try {
    await batchInsertEvents(toFlush);
    logger.debug('Flushed viewability events', { count: toFlush.length });
  } catch (error) {
    logger.warn('Failed to flush viewability events, re-adding to buffer', { 
      error, 
      count: toFlush.length 
    });
    // Re-add events if flush failed (up to limit)
    eventBuffer.unshift(...toFlush.slice(0, Math.max(0, MAX_BUFFER_SIZE - eventBuffer.length)));
  }
}

// -----------------------------------------------------
// Main Functions
// -----------------------------------------------------

/**
 * Record a single viewability event
 */
export function recordViewabilityEvent(event: ViewabilityEvent): void {
  // Record metrics immediately
  viewabilityEventsTotal.inc({
    platform: event.platform,
    event_type: event.adFormat,
    omsdk_available: event.omsdkAvailable ? 'true' : 'false',
  });
  
  if (event.viewableTimeMs && event.viewableTimeMs > 0) {
    viewableTimeHistogram.observe({ ad_format: event.adFormat }, event.viewableTimeMs);
  }
  
  // Add to buffer
  event.receivedAt = new Date();
  eventBuffer.push(event);
  
  // Flush if buffer is full
  if (eventBuffer.length >= MAX_BUFFER_SIZE) {
    void flushBuffer().catch(() => {});
  }
  
  // Ensure timer is running
  startFlushTimer();
}

/**
 * Record multiple viewability events (batch)
 */
export function recordViewabilityEvents(events: ViewabilityEvent[]): void {
  for (const event of events) {
    recordViewabilityEvent(event);
  }
}

/**
 * Batch insert events to database
 */
async function batchInsertEvents(events: ViewabilityEvent[]): Promise<void> {
  if (events.length === 0) return;
  
  const values: unknown[] = [];
  const placeholders: string[] = [];
  
  let paramIndex = 1;
  for (const event of events) {
    placeholders.push(`($${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++})`);
    values.push(
      event.requestId,
      event.impressionId,
      event.placementId,
      event.publisherId || null,
      event.platform,
      event.adFormat,
      event.omsdkAvailable,
      event.wasViewable,
      event.measurable,
      event.viewableTimeMs || null,
      event.totalDurationMs || null,
      event.viewablePercent || null,
      JSON.stringify(event.quartiles || {}),
      JSON.stringify(event.geometry || {}),
      event.eventTimestamp,
    );
  }
  
  await query(
    `INSERT INTO viewability_events (
      request_id, impression_id, placement_id, publisher_id,
      platform, ad_format, omsdk_available, was_viewable, measurable,
      viewable_time_ms, total_duration_ms, viewable_percent,
      quartiles, geometry, event_timestamp
    ) VALUES ${placeholders.join(', ')}
    ON CONFLICT (impression_id) DO UPDATE SET
      was_viewable = EXCLUDED.was_viewable,
      viewable_time_ms = COALESCE(EXCLUDED.viewable_time_ms, viewability_events.viewable_time_ms),
      quartiles = EXCLUDED.quartiles,
      updated_at = NOW()`,
    values
  );
}

/**
 * Get viewability summary for a placement
 */
export async function getViewabilitySummary(
  placementId: string,
  startDate?: Date,
  endDate?: Date
): Promise<ViewabilitySummary | null> {
  const start = startDate || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // Last 7 days
  const end = endDate || new Date();
  
  try {
    const result = await query(
      `SELECT 
        placement_id,
        publisher_id,
        COUNT(*) as total_impressions,
        COUNT(*) FILTER (WHERE measurable = true) as measurable_impressions,
        COUNT(*) FILTER (WHERE was_viewable = true) as viewable_impressions,
        AVG(viewable_time_ms) FILTER (WHERE viewable_time_ms > 0) as avg_viewable_time_ms,
        COUNT(*) FILTER (WHERE (quartiles->>'start')::boolean = true) as quartile_start,
        COUNT(*) FILTER (WHERE (quartiles->>'firstQuartile')::boolean = true) as quartile_first,
        COUNT(*) FILTER (WHERE (quartiles->>'midpoint')::boolean = true) as quartile_mid,
        COUNT(*) FILTER (WHERE (quartiles->>'thirdQuartile')::boolean = true) as quartile_third,
        COUNT(*) FILTER (WHERE (quartiles->>'complete')::boolean = true) as quartile_complete
       FROM viewability_events
       WHERE placement_id = $1
         AND event_timestamp >= $2
         AND event_timestamp <= $3
       GROUP BY placement_id, publisher_id`,
      [placementId, start, end]
    );
    
    if (result.rows.length === 0) return null;
    
    const row = result.rows[0];
    const totalImpressions = parseInt(row.total_impressions) || 0;
    const measurableImpressions = parseInt(row.measurable_impressions) || 0;
    const viewableImpressions = parseInt(row.viewable_impressions) || 0;
    
    return {
      placementId,
      publisherId: row.publisher_id,
      totalImpressions,
      measurableImpressions,
      viewableImpressions,
      viewabilityRate: measurableImpressions > 0 ? viewableImpressions / measurableImpressions : 0,
      averageViewableTimeMs: parseFloat(row.avg_viewable_time_ms) || 0,
      quartileRates: {
        start: totalImpressions > 0 ? (parseInt(row.quartile_start) || 0) / totalImpressions : 0,
        firstQuartile: totalImpressions > 0 ? (parseInt(row.quartile_first) || 0) / totalImpressions : 0,
        midpoint: totalImpressions > 0 ? (parseInt(row.quartile_mid) || 0) / totalImpressions : 0,
        thirdQuartile: totalImpressions > 0 ? (parseInt(row.quartile_third) || 0) / totalImpressions : 0,
        complete: totalImpressions > 0 ? (parseInt(row.quartile_complete) || 0) / totalImpressions : 0,
      },
    };
  } catch (error) {
    logger.warn('Failed to get viewability summary', { error, placementId });
    return null;
  }
}

/**
 * Get OMSDK status for Console display
 */
export async function getOmsdkStatus(publisherId: string): Promise<{
  enabled: boolean;
  platforms: Record<string, { available: boolean; eventCount: number }>;
  overallViewabilityRate: number;
}> {
  try {
    const result = await query(
      `SELECT 
        platform,
        omsdk_available,
        COUNT(*) as event_count,
        COUNT(*) FILTER (WHERE was_viewable = true) as viewable_count,
        COUNT(*) FILTER (WHERE measurable = true) as measurable_count
       FROM viewability_events
       WHERE publisher_id = $1
         AND event_timestamp >= NOW() - INTERVAL '7 days'
       GROUP BY platform, omsdk_available`,
      [publisherId]
    );
    
    const platforms: Record<string, { available: boolean; eventCount: number }> = {};
    let totalMeasurable = 0;
    let totalViewable = 0;
    
    for (const row of result.rows) {
      const platform = row.platform as string;
      platforms[platform] = {
        available: row.omsdk_available === true,
        eventCount: parseInt(row.event_count) || 0,
      };
      totalMeasurable += parseInt(row.measurable_count) || 0;
      totalViewable += parseInt(row.viewable_count) || 0;
    }
    
    return {
      enabled: Object.values(platforms).some(p => p.available),
      platforms,
      overallViewabilityRate: totalMeasurable > 0 ? totalViewable / totalMeasurable : 0,
    };
  } catch (error) {
    logger.warn('Failed to get OMSDK status', { error, publisherId });
    return {
      enabled: false,
      platforms: {},
      overallViewabilityRate: 0,
    };
  }
}

// Cleanup on shutdown
export function shutdown(): void {
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
  // Final flush
  void flushBuffer().catch(() => {});
}
