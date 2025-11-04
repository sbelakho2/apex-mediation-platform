/**
 * Analytics Service
 * 
 * Handles ingestion of ad events into ClickHouse for real-time analytics
 */

import { insertBatch } from '../utils/clickhouse';
import logger from '../utils/logger';
import {
  ImpressionEventDTO,
  ClickEventDTO,
  RevenueEventDTO,
} from '../types/analytics.types';

class AnalyticsService {
  private impressionBuffer: ImpressionEventDTO[] = [];
  private clickBuffer: ClickEventDTO[] = [];
  private revenueBuffer: RevenueEventDTO[] = [];
  
  private readonly BATCH_SIZE = 100;
  private readonly FLUSH_INTERVAL_MS = 5000; // 5 seconds
  private flushInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Set up periodic flushing
    const interval = setInterval(() => {
      void this.flushAll();
    }, this.FLUSH_INTERVAL_MS);

    // Allow Node.js process to exit even if interval is still scheduled
    interval.unref();
    this.flushInterval = interval;
  }

  /**
   * Record an impression event
   */
  async recordImpression(event: ImpressionEventDTO): Promise<void> {
    this.impressionBuffer.push(event);
    
    if (this.impressionBuffer.length >= this.BATCH_SIZE) {
      await this.flushImpressions();
    }
  }

  /**
   * Record impression events in batch
   */
  async recordImpressions(events: ImpressionEventDTO[]): Promise<void> {
    this.impressionBuffer.push(...events);
    
    if (this.impressionBuffer.length >= this.BATCH_SIZE) {
      await this.flushImpressions();
    }
  }

  /**
   * Record a click event
   */
  async recordClick(event: ClickEventDTO): Promise<void> {
    this.clickBuffer.push(event);
    
    if (this.clickBuffer.length >= this.BATCH_SIZE) {
      await this.flushClicks();
    }
  }

  /**
   * Record click events in batch
   */
  async recordClicks(events: ClickEventDTO[]): Promise<void> {
    this.clickBuffer.push(...events);
    
    if (this.clickBuffer.length >= this.BATCH_SIZE) {
      await this.flushClicks();
    }
  }

  /**
   * Record a revenue event
   */
  async recordRevenue(event: RevenueEventDTO): Promise<void> {
    this.revenueBuffer.push(event);
    
    if (this.revenueBuffer.length >= this.BATCH_SIZE) {
      await this.flushRevenue();
    }
  }

  /**
   * Record revenue events in batch
   */
  async recordRevenueEvents(events: RevenueEventDTO[]): Promise<void> {
    this.revenueBuffer.push(...events);
    
    if (this.revenueBuffer.length >= this.BATCH_SIZE) {
      await this.flushRevenue();
    }
  }

  /**
   * Flush impression buffer to ClickHouse
   */
  private async flushImpressions(): Promise<void> {
    if (this.impressionBuffer.length === 0) {
      return;
    }

    const eventsToFlush = [...this.impressionBuffer];
    this.impressionBuffer = [];

    try {
      await insertBatch('impressions', eventsToFlush);
      logger.debug('Flushed impressions', { count: eventsToFlush.length });
    } catch (error) {
      logger.error('Failed to flush impressions', { 
        count: eventsToFlush.length,
        error 
      });
      // Re-add to buffer for retry
      this.impressionBuffer.unshift(...eventsToFlush);
    }
  }

  /**
   * Flush click buffer to ClickHouse
   */
  private async flushClicks(): Promise<void> {
    if (this.clickBuffer.length === 0) {
      return;
    }

    const eventsToFlush = [...this.clickBuffer];
    this.clickBuffer = [];

    try {
      await insertBatch('clicks', eventsToFlush);
      logger.debug('Flushed clicks', { count: eventsToFlush.length });
    } catch (error) {
      logger.error('Failed to flush clicks', { 
        count: eventsToFlush.length,
        error 
      });
      this.clickBuffer.unshift(...eventsToFlush);
    }
  }

  /**
   * Flush revenue buffer to ClickHouse
   */
  private async flushRevenue(): Promise<void> {
    if (this.revenueBuffer.length === 0) {
      return;
    }

    const eventsToFlush = [...this.revenueBuffer];
    this.revenueBuffer = [];

    try {
      await insertBatch('revenue_events', eventsToFlush);
      logger.debug('Flushed revenue events', { count: eventsToFlush.length });
    } catch (error) {
      logger.error('Failed to flush revenue events', { 
        count: eventsToFlush.length,
        error 
      });
      this.revenueBuffer.unshift(...eventsToFlush);
    }
  }

  /**
   * Flush all buffers
   */
  async flushAll(): Promise<void> {
    await Promise.all([
      this.flushImpressions(),
      this.flushClicks(),
      this.flushRevenue(),
    ]);
  }

  /**
   * Cleanup interval for graceful shutdown (primarily for tests)
   */
  shutdown(): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }
  }

  /**
   * Get buffer stats (for monitoring)
   */
  getBufferStats() {
    return {
      impressions: this.impressionBuffer.length,
      clicks: this.clickBuffer.length,
      revenue: this.revenueBuffer.length,
      total: this.impressionBuffer.length + this.clickBuffer.length + this.revenueBuffer.length,
    };
  }
}

// Singleton instance
export const analyticsService = new AnalyticsService();

export default analyticsService;
