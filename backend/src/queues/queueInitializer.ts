/**
 * Queue Initializer
 * 
 * Initializes all job queues and registers workers
 */

import { queueManager, QueueName } from './queueManager';
import { processAnalyticsAggregation } from './processors/analyticsAggregation';
import { processAnalyticsIngest } from './processors/analyticsIngest';
import { processDataExport } from './processors/dataExport';
import { processPrivacyJob } from './processors/privacy';
import logger from '../utils/logger';

/**
 * Initialize all queues and workers
 */
export async function initializeQueues(): Promise<void> {
  try {
    logger.info('Initializing job queues...');

    // Initialize queue manager
    await queueManager.initialize();

    // Register workers
    registerWorkers();

    // Schedule recurring jobs
    scheduleRecurringJobs();

    logger.info('Job queues initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize job queues', { error });
    throw error;
  }
}

/**
 * Register all workers
 */
function registerWorkers(): void {
  // Analytics Ingest Worker (batch writes to ClickHouse)
  queueManager.registerWorker(
    QueueName.ANALYTICS_INGEST,
    processAnalyticsIngest,
    {
      concurrency: 10,
      limiter: { max: 1000, duration: 1000 }, // up to 1000 jobs/sec across workers
    }
  );

  // Analytics Aggregation Worker
  queueManager.registerWorker(
    QueueName.ANALYTICS_AGGREGATION,
    processAnalyticsAggregation,
    {
      concurrency: 3, // Process up to 3 aggregation jobs concurrently
      limiter: {
        max: 10, // Max 10 jobs
        duration: 60000, // per minute
      },
    }
  );

  // Data Export Worker
  queueManager.registerWorker(
    QueueName.DATA_EXPORT,
    processDataExport,
    {
      concurrency: 2, // Process up to 2 export jobs concurrently
      limiter: {
        max: 20, // Max 20 jobs
        duration: 60000, // per minute
      },
    }
  );

  // Privacy (GDPR/CCPA) Worker
  queueManager.registerWorker(
    QueueName.PRIVACY,
    processPrivacyJob,
    {
      concurrency: 2,
      limiter: {
        max: 10,
        duration: 60000,
      },
    }
  );

  // Report Generation Worker
  queueManager.registerWorker(
    QueueName.REPORT_GENERATION,
    async (job) => {
      logger.info('Processing report generation', { jobId: job.id });
      // TODO: Implement report generation
      await job.updateProgress(100);
    },
    {
      concurrency: 2,
    }
  );

  // Metrics Calculation Worker
  queueManager.registerWorker(
    QueueName.METRICS_CALCULATION,
    async (job) => {
      logger.info('Processing metrics calculation', { jobId: job.id });
      // TODO: Implement metrics calculation
      await job.updateProgress(100);
    },
    {
      concurrency: 5,
    }
  );

  // Cache Warming Worker
  queueManager.registerWorker(
    QueueName.CACHE_WARMING,
    async (job) => {
      logger.info('Processing cache warming', { jobId: job.id });
      // TODO: Implement cache warming
      await job.updateProgress(100);
    },
    {
      concurrency: 3,
    }
  );

  // Cleanup Worker
  queueManager.registerWorker(
    QueueName.CLEANUP,
    async (job) => {
      logger.info('Processing cleanup', { jobId: job.id });
      // TODO: Implement cleanup tasks
      await job.updateProgress(100);
    },
    {
      concurrency: 1, // Run cleanup jobs sequentially
    }
  );

  logger.info('All workers registered');
}

/**
 * Schedule recurring jobs
 */
function scheduleRecurringJobs(): void {
  // Daily analytics aggregation at 1 AM
  queueManager.scheduleRecurringJob(
    QueueName.ANALYTICS_AGGREGATION,
    'daily-aggregation',
    {
      publisherId: 'all', // Special value to aggregate all publishers
      startDate: 'yesterday',
      endDate: 'today',
      granularity: 'day',
    },
    '0 1 * * *' // Every day at 1 AM
  );

  // Hourly metrics calculation
  queueManager.scheduleRecurringJob(
    QueueName.METRICS_CALCULATION,
    'hourly-metrics',
    {
      publisherId: 'all',
      metricType: 'performance',
      period: 'last_hour',
    },
    '0 * * * *' // Every hour at minute 0
  );

  // Daily cleanup at 2 AM
  queueManager.scheduleRecurringJob(
    QueueName.CLEANUP,
    'daily-cleanup',
    {
      type: 'old_logs',
      olderThan: '30d',
    },
    '0 2 * * *' // Every day at 2 AM
  );

  // Weekly report generation on Mondays at 8 AM
  queueManager.scheduleRecurringJob(
    QueueName.REPORT_GENERATION,
    'weekly-reports',
    {
      publisherId: 'all',
      reportType: 'weekly',
      date: 'last_week',
    },
    '0 8 * * 1' // Every Monday at 8 AM
  );

  // Cache warming every 5 minutes for popular queries
  queueManager.scheduleRecurringJob(
    QueueName.CACHE_WARMING,
    'popular-cache-warming',
    {
      cacheKeys: ['analytics:popular', 'dashboard:stats'],
      priority: 10,
    },
    '*/5 * * * *' // Every 5 minutes
  );

  logger.info('Recurring jobs scheduled');
}

/**
 * Shutdown all queues
 */
export async function shutdownQueues(): Promise<void> {
  logger.info('Shutting down job queues...');
  await queueManager.shutdown();
  logger.info('Job queues shut down');
}

/**
 * Export queue manager instance
 */
export { queueManager };
