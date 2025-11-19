import { redis } from '../utils/redis';
import logger from '../utils/logger';

export enum QueueName {
  ANALYTICS_INGEST = 'analytics_ingest',
  PRIVACY = 'privacy',
  REPORT_GENERATION = 'report_generation',
  METRICS_CALCULATION = 'metrics_calculation',
  CACHE_WARMING = 'cache_warming',
  CLEANUP_TASKS = 'cleanup_tasks',
}

export type PrivacyJob = {
  kind: 'export' | 'delete';
  tenantId: string;
  userId: string;
  requestId?: string;
  format?: 'json' | 'csv';
};

type SimpleQueue = {
  add: (name: string, data: Record<string, unknown>, _opts?: Record<string, unknown>) => Promise<void>;
  getWaitingCount?: () => Promise<number>;
  getActiveCount?: () => Promise<number>;
  getDelayedCount?: () => Promise<number>;
  getFailedCount?: () => Promise<number>;
};

class QueueManagerImpl {
  /**
   * Ready when Redis is connected. We use a minimal Redis list-backed queue
   * to avoid a hard dependency on BullMQ/Kafka in this codebase.
   */
  isReady(): boolean {
    try {
      return redis.isReady();
    } catch {
      return false;
    }
  }

  getQueue(name: QueueName): SimpleQueue | null {
    if (!this.isReady()) return null;
    switch (name) {
      case QueueName.ANALYTICS_INGEST:
        return this.createListQueue('q:analytics', 'q:analytics:dlq');
      case QueueName.PRIVACY:
        return this.createListQueue('q:privacy', 'q:privacy:dlq');
      case QueueName.REPORT_GENERATION:
        return this.createListQueue('q:reports', 'q:reports:dlq');
      case QueueName.METRICS_CALCULATION:
        return this.createListQueue('q:metrics', 'q:metrics:dlq');
      case QueueName.CACHE_WARMING:
        return this.createListQueue('q:cache', 'q:cache:dlq');
      case QueueName.CLEANUP_TASKS:
        return this.createListQueue('q:cleanup', 'q:cleanup:dlq');
      default:
        return null;
    }
  }

  private createListQueue(listKey: string, dlqKey: string): SimpleQueue {
    return {
      add: async (_name: string, data: Record<string, unknown>) => {
        try {
          const payload = JSON.stringify({ ...data, ts: Date.now() });
          await (redis as any).lPush(listKey, payload);
        } catch (e) {
          // If push fails, attempt to write to DLQ as a last resort
          try {
            await (redis as any).lPush(dlqKey, JSON.stringify({ error: (e as Error).message, data }));
          } catch {
            // swallow
          }
          throw e;
        }
      },
      getWaitingCount: async () => {
        try { return await (redis as any).lLen(listKey); } catch { return 0; }
      },
      getActiveCount: async () => 0,
      getDelayedCount: async () => 0,
      getFailedCount: async () => { try { return await (redis as any).lLen(dlqKey); } catch { return 0; } },
    };
  }

  private getQueueKey(queueName: QueueName): string {
    return `queue:${queueName}`;
  }

  private getJobKey(queueName: QueueName, jobId: string): string {
    return `job:${queueName}:${jobId}`;
  }

  private getPauseKey(queueName: QueueName): string {
    return `queue:${queueName}:paused`;
  }

  /**
   * Get comprehensive queue metrics
   */
  async getQueueMetrics(queueName: QueueName): Promise<any> {
    const queue = this.getQueue(queueName);
    if (!queue) return null;
    
    const [waiting, active, delayed, failed] = await Promise.all([
      queue.getWaitingCount?.() ?? Promise.resolve(0),
      queue.getActiveCount?.() ?? Promise.resolve(0),
      queue.getDelayedCount?.() ?? Promise.resolve(0),
      queue.getFailedCount?.() ?? Promise.resolve(0),
    ]);

    const isPaused = await this.isQueuePaused(queueName);
    
    return { 
      waiting, 
      active, 
      delayed, 
      failed, 
      name: queueName,
      paused: isPaused,
    };
  }

  /**
   * Add a job to the queue with full metadata tracking
   */
  async addJob(
    queueName: QueueName, 
    jobName: string, 
    data: Record<string, unknown>,
    options?: Record<string, unknown>
  ): Promise<any> {
    if (!this.isReady()) {
      throw new Error('Queue manager not ready');
    }

    const jobId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const queueKey = this.getQueueKey(queueName);
    const jobKey = this.getJobKey(queueName, jobId);
    
    const job = {
      id: jobId,
      name: jobName,
      data,
      options: options || {},
      state: 'waiting',
      timestamp: Date.now(),
      processedOn: null,
      finishedOn: null,
      progress: 0,
      attemptsMade: 0,
      returnvalue: null,
      failedReason: null,
    };

    try {
      // Store job metadata
      await (redis as any).set(jobKey, JSON.stringify(job), 'EX', 86400); // 24h TTL
      
      // Add job ID to queue
      await (redis as any).lPush(`${queueKey}:waiting`, jobId);
      
      logger.debug('Job added to queue', { queueName, jobId, jobName });
      
      return job;
    } catch (error) {
      logger.error('Failed to add job', { error, queueName, jobName });
      throw error;
    }
  }

  /**
   * Get job details by ID
   */
  async getJob(queueName: QueueName, jobId: string): Promise<any> {
    if (!this.isReady()) {
      return null;
    }

    const jobKey = this.getJobKey(queueName, jobId);
    
    try {
      const jobData = await (redis as any).get(jobKey);
      if (!jobData) {
        return null;
      }
      
      return JSON.parse(jobData);
    } catch (error) {
      logger.error('Failed to get job', { error, queueName, jobId });
      return null;
    }
  }

  /**
   * Remove a job from the queue
   */
  async removeJob(queueName: QueueName, jobId: string): Promise<boolean> {
    if (!this.isReady()) {
      return false;
    }

    const queueKey = this.getQueueKey(queueName);
    const jobKey = this.getJobKey(queueName, jobId);
    
    try {
      // Remove from all possible lists
      const removed = await Promise.all([
        (redis as any).lRem(`${queueKey}:waiting`, 0, jobId),
        (redis as any).lRem(`${queueKey}:active`, 0, jobId),
        (redis as any).lRem(`${queueKey}:completed`, 0, jobId),
        (redis as any).lRem(`${queueKey}:failed`, 0, jobId),
        (redis as any).del(jobKey),
      ]);

      const totalRemoved = removed.slice(0, 4).reduce((sum: number, val: number) => sum + val, 0);
      
      if (totalRemoved > 0) {
        logger.debug('Job removed from queue', { queueName, jobId });
        return true;
      }
      
      return false;
    } catch (error) {
      logger.error('Failed to remove job', { error, queueName, jobId });
      return false;
    }
  }

  /**
   * Pause queue - prevents new jobs from being processed
   */
  async pauseQueue(queueName: QueueName): Promise<void> {
    if (!this.isReady()) {
      throw new Error('Queue manager not ready');
    }

    const pauseKey = this.getPauseKey(queueName);
    
    try {
      await (redis as any).set(pauseKey, '1', 'EX', 86400); // Pause for up to 24h
      logger.info('Queue paused', { queueName });
    } catch (error) {
      logger.error('Failed to pause queue', { error, queueName });
      throw error;
    }
  }

  /**
   * Resume queue - allows jobs to be processed again
   */
  async resumeQueue(queueName: QueueName): Promise<void> {
    if (!this.isReady()) {
      throw new Error('Queue manager not ready');
    }

    const pauseKey = this.getPauseKey(queueName);
    
    try {
      await (redis as any).del(pauseKey);
      logger.info('Queue resumed', { queueName });
    } catch (error) {
      logger.error('Failed to resume queue', { error, queueName });
      throw error;
    }
  }

  /**
   * Check if queue is paused
   */
  async isQueuePaused(queueName: QueueName): Promise<boolean> {
    if (!this.isReady()) {
      return false;
    }

    const pauseKey = this.getPauseKey(queueName);
    
    try {
      const isPaused = await (redis as any).exists(pauseKey);
      return isPaused === 1;
    } catch {
      return false;
    }
  }

  /**
   * Clean old jobs from the queue based on grace period
   */
  async cleanQueue(
    queueName: QueueName, 
    gracePeriodSeconds: number = 3600,
    limit: number = 1000,
    type: string = 'completed'
  ): Promise<number> {
    if (!this.isReady()) {
      return 0;
    }

    const queueKey = this.getQueueKey(queueName);
    const listKey = `${queueKey}:${type}`;
    const cutoffTime = Date.now() - (gracePeriodSeconds * 1000);
    
    try {
      // Get all jobs from the specified list
      const jobIds = await (redis as any).lRange(listKey, 0, limit - 1);
      let cleanedCount = 0;

      for (const jobId of jobIds) {
        const jobKey = this.getJobKey(queueName, jobId);
        const jobData = await (redis as any).get(jobKey);
        
        if (!jobData) {
          // Job data doesn't exist, remove from list
          await (redis as any).lRem(listKey, 0, jobId);
          cleanedCount++;
          continue;
        }

        try {
          const job = JSON.parse(jobData);
          const finishedTime = job.finishedOn || job.timestamp;
          
          if (finishedTime < cutoffTime) {
            // Job is old enough to clean
            await Promise.all([
              (redis as any).lRem(listKey, 0, jobId),
              (redis as any).del(jobKey),
            ]);
            cleanedCount++;
          }
        } catch {
          // Invalid job data, remove it
          await (redis as any).lRem(listKey, 0, jobId);
          await (redis as any).del(jobKey);
          cleanedCount++;
        }
      }

      logger.info('Queue cleaned', { queueName, type, cleanedCount, gracePeriodSeconds });
      return cleanedCount;
    } catch (error) {
      logger.error('Failed to clean queue', { error, queueName, type });
      return 0;
    }
  }
}

export const queueManager = new QueueManagerImpl();
export type QueueManager = typeof queueManager;

// Simple worker helper (blocking pop one item) for consumers to use if needed
export async function popQueueItem(queue: QueueName, timeoutSec = 5): Promise<Record<string, unknown> | null> {
  try {
    if (!redis.isReady()) return null;
    let key = '';
    switch (queue) {
      case QueueName.ANALYTICS_INGEST:
        key = 'q:analytics';
        break;
      case QueueName.PRIVACY:
        key = 'q:privacy';
        break;
      case QueueName.REPORT_GENERATION:
        key = 'q:reports';
        break;
      case QueueName.METRICS_CALCULATION:
        key = 'q:metrics';
        break;
      case QueueName.CACHE_WARMING:
        key = 'q:cache';
        break;
      case QueueName.CLEANUP_TASKS:
        key = 'q:cleanup';
        break;
      default:
        return null;
    }
    // BRPOP returns [key, value] or null on timeout
    const result = await (redis as any).brPop?.(key, timeoutSec);
    const value = Array.isArray(result) ? result[1] : (result?.element ?? null);
    if (!value) return null;
    try {
      return JSON.parse(String(value));
    } catch (e) {
      logger.warn('[Queue] Failed to parse queue item', { error: (e as Error).message });
      return null;
    }
  } catch {
    return null;
  }
}
