import { redis } from '../utils/redis';
import logger from '../utils/logger';

export enum QueueName {
  ANALYTICS_INGEST = 'analytics_ingest',
}

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
      default:
        return null;
    }
  }

  private createListQueue(listKey: string, dlqKey: string): SimpleQueue {
    return {
      add: async (_name: string, data: Record<string, unknown>) => {
        try {
          const payload = JSON.stringify({ ...data, ts: Date.now() });
          await redis.lPush(listKey, payload);
        } catch (e) {
          // If push fails, attempt to write to DLQ as a last resort
          try {
            await redis.lPush(dlqKey, JSON.stringify({ error: (e as Error).message, data }));
          } catch {
            // swallow
          }
          throw e;
        }
      },
      getWaitingCount: async () => {
        try { return await redis.lLen(listKey); } catch { return 0; }
      },
      getActiveCount: async () => 0,
      getDelayedCount: async () => 0,
      getFailedCount: async () => { try { return await redis.lLen(dlqKey); } catch { return 0; } },
    };
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
