/**
 * Queue Manager
 * 
 * Central management for BullMQ job queues
 * Handles queue creation, workers, and job scheduling
 */

import { Queue, Worker, QueueEvents, Job } from 'bullmq';
import logger from '../utils/logger';

// Queue configuration
const queueConfig = {
  connection: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
  },
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential' as const,
      delay: 2000,
    },
    removeOnComplete: {
      age: 24 * 3600, // Keep completed jobs for 24 hours
      count: 1000, // Keep max 1000 completed jobs
    },
    removeOnFail: {
      age: 7 * 24 * 3600, // Keep failed jobs for 7 days
    },
  },
};

// Queue names
export enum QueueName {
  ANALYTICS_AGGREGATION = 'analytics:aggregation',
  ANALYTICS_INGEST = 'analytics:ingest',
  DATA_EXPORT = 'data:export',
  REPORT_GENERATION = 'report:generation',
  METRICS_CALCULATION = 'metrics:calculation',
  CACHE_WARMING = 'cache:warming',
  CLEANUP = 'cleanup',
  PRIVACY = 'privacy:jobs',
}

// Job data types
export interface AnalyticsAggregationJob {
  publisherId: string;
  startDate: string;
  endDate: string;
  granularity: 'hour' | 'day' | 'week' | 'month';
}

export interface DataExportJob {
  jobId: string;
  publisherId: string;
  format: 'csv' | 'json';
  startDate: string;
  endDate: string;
  filters?: Record<string, unknown>;
}

export interface ReportGenerationJob {
  publisherId: string;
  reportType: 'daily' | 'weekly' | 'monthly';
  date: string;
  recipients?: string[];
}

export interface MetricsCalculationJob {
  publisherId: string;
  metricType: 'performance' | 'revenue' | 'quality';
  period: string;
}

export interface CacheWarmingJob {
  cacheKeys: string[];
  priority?: number;
}

export interface CleanupJob {
  type: 'old_logs' | 'expired_tokens' | 'temp_files';
  olderThan?: string;
}

export interface PrivacyJob {
  kind: 'export' | 'delete';
  tenantId: string;
  userId?: string;
  requestId?: string;
  format?: 'json' | 'csv';
}

/**
 * Queue Manager Class
 * Manages all job queues and workers
 */
class QueueManager {
  private queues: Map<QueueName, Queue> = new Map();
  private workers: Map<QueueName, Worker> = new Map();
  private queueEvents: Map<QueueName, QueueEvents> = new Map();
  private isInitialized: boolean = false;

  /**
   * Initialize all queues
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      logger.warn('Queue manager already initialized');
      return;
    }

    try {
      // Create all queues
      for (const queueName of Object.values(QueueName)) {
        const queue = new Queue(queueName, queueConfig);
        this.queues.set(queueName, queue);

        // Set up queue events
        const events = new QueueEvents(queueName, queueConfig);
        this.queueEvents.set(queueName, events);

        // Set up event listeners
        events.on('completed', ({ jobId }) => {
          logger.info('Job completed', { queue: queueName, jobId });
        });

        events.on('failed', ({ jobId, failedReason }) => {
          logger.error('Job failed', { queue: queueName, jobId, reason: failedReason });
        });

        events.on('progress', ({ jobId, data }) => {
          logger.debug('Job progress', { queue: queueName, jobId, progress: data });
        });

        logger.info('Queue initialized', { name: queueName });
      }

      this.isInitialized = true;
      logger.info('Queue manager initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize queue manager', { error });
      throw error;
    }
  }

  /**
   * Get a queue by name
   */
  getQueue(name: QueueName): Queue | undefined {
    return this.queues.get(name);
  }

  /**
   * Add a job to a queue
   */
  async addJob<T = unknown>(
    queueName: QueueName,
    jobName: string,
    data: T,
    options?: {
      delay?: number;
      priority?: number;
      repeat?: {
        pattern?: string; // Cron pattern
        every?: number; // Interval in milliseconds
      };
      removeOnComplete?: boolean | number | { age?: number; count?: number };
      removeOnFail?: boolean | number | { age?: number; count?: number };
    }
  ): Promise<Job<T> | null> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      logger.error('Queue not found', { name: queueName });
      return null;
    }

    try {
      const job = await queue.add(jobName, data, {
        ...queueConfig.defaultJobOptions,
        ...options,
      });

      logger.info('Job added to queue', {
        queue: queueName,
        jobName,
        jobId: job.id,
      });

      return job;
    } catch (error) {
      logger.error('Failed to add job to queue', {
        queue: queueName,
        jobName,
        error,
      });
      return null;
    }
  }

  /**
   * Register a worker for a queue
   */
  registerWorker<T = unknown>(
    queueName: QueueName,
    processor: (job: Job<T>) => Promise<unknown>,
    options?: {
      concurrency?: number;
      limiter?: {
        max: number;
        duration: number;
      };
    }
  ): void {
    if (this.workers.has(queueName)) {
      logger.warn('Worker already registered for queue', { name: queueName });
      return;
    }

    const worker = new Worker(queueName, processor, {
      connection: queueConfig.connection,
      concurrency: options?.concurrency || 5,
      limiter: options?.limiter,
    });

    worker.on('completed', (job) => {
      logger.info('Worker completed job', {
        queue: queueName,
        jobId: job.id,
      });
    });

    worker.on('failed', (job, err) => {
      logger.error('Worker failed to process job', {
        queue: queueName,
        jobId: job?.id,
        error: err,
      });
    });

    worker.on('error', (err) => {
      logger.error('Worker error', {
        queue: queueName,
        error: err,
      });
    });

    this.workers.set(queueName, worker);
    logger.info('Worker registered', { queue: queueName });
  }

  /**
   * Schedule a recurring job
   */
  async scheduleRecurringJob<T = unknown>(
    queueName: QueueName,
    jobName: string,
    data: T,
    cronPattern: string
  ): Promise<Job<T> | null> {
    return this.addJob(queueName, jobName, data, {
      repeat: {
        pattern: cronPattern,
      },
    });
  }

  /**
   * Get job by ID
   */
  async getJob(queueName: QueueName, jobId: string): Promise<Job | null> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      return null;
    }

    try {
      const job = await queue.getJob(jobId);
      return job || null;
    } catch (error) {
      logger.error('Failed to get job', { queue: queueName, jobId, error });
      return null;
    }
  }

  /**
   * Remove a job
   */
  async removeJob(queueName: QueueName, jobId: string): Promise<boolean> {
    const job = await this.getJob(queueName, jobId);
    if (!job) {
      return false;
    }

    try {
      await job.remove();
      logger.info('Job removed', { queue: queueName, jobId });
      return true;
    } catch (error) {
      logger.error('Failed to remove job', { queue: queueName, jobId, error });
      return false;
    }
  }

  /**
   * Get queue metrics
   */
  async getQueueMetrics(queueName: QueueName): Promise<{
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
  } | null> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      return null;
    }

    try {
      const [waiting, active, completed, failed, delayed] = await Promise.all([
        queue.getWaitingCount(),
        queue.getActiveCount(),
        queue.getCompletedCount(),
        queue.getFailedCount(),
        queue.getDelayedCount(),
      ]);

      return { waiting, active, completed, failed, delayed };
    } catch (error) {
      logger.error('Failed to get queue metrics', { queue: queueName, error });
      return null;
    }
  }

  /**
   * Pause a queue
   */
  async pauseQueue(queueName: QueueName): Promise<void> {
    const queue = this.queues.get(queueName);
    if (queue) {
      await queue.pause();
      logger.info('Queue paused', { name: queueName });
    }
  }

  /**
   * Resume a queue
   */
  async resumeQueue(queueName: QueueName): Promise<void> {
    const queue = this.queues.get(queueName);
    if (queue) {
      await queue.resume();
      logger.info('Queue resumed', { name: queueName });
    }
  }

  /**
   * Clean completed jobs from a queue
   */
  async cleanQueue(queueName: QueueName, gracePeriod: number = 3600): Promise<void> {
    const queue = this.queues.get(queueName);
    if (queue) {
      await queue.clean(gracePeriod * 1000, 1000, 'completed');
      await queue.clean(gracePeriod * 1000, 1000, 'failed');
      logger.info('Queue cleaned', { name: queueName });
    }
  }

  /**
   * Shutdown all queues and workers
   */
  async shutdown(): Promise<void> {
    logger.info('Shutting down queue manager...');

    // Close all workers
    for (const [name, worker] of this.workers.entries()) {
      try {
        await worker.close();
        logger.info('Worker closed', { name });
      } catch (error) {
        logger.error('Error closing worker', { name, error });
      }
    }

    // Close all queue events
    for (const [name, events] of this.queueEvents.entries()) {
      try {
        await events.close();
        logger.info('Queue events closed', { name });
      } catch (error) {
        logger.error('Error closing queue events', { name, error });
      }
    }

    // Close all queues
    for (const [name, queue] of this.queues.entries()) {
      try {
        await queue.close();
        logger.info('Queue closed', { name });
      } catch (error) {
        logger.error('Error closing queue', { name, error });
      }
    }

    this.queues.clear();
    this.workers.clear();
    this.queueEvents.clear();
    this.isInitialized = false;

    logger.info('Queue manager shut down');
  }

  /**
   * Check if queue manager is initialized
   */
  isReady(): boolean {
    return this.isInitialized;
  }
}

// Export singleton instance
export const queueManager = new QueueManager();
