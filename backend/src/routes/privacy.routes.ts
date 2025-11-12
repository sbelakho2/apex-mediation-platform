import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { queueManager, QueueName, PrivacyJob } from '../queues/queueManager';
import logger from '../utils/logger';

const router = Router();

/**
 * POST /api/v1/privacy/export
 * Enqueue a GDPR export job for the current user (tenant-scoped).
 * Body: { format?: 'json' | 'csv' }
 */
router.post('/export', authenticate, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user || {};
    const tenantId = user.tenantId || user.publisherId || user.orgId;
    const userId = user.id || user.userId;
    const format = (req.body?.format === 'csv' ? 'csv' : 'json') as PrivacyJob['format'];

    if (!tenantId || !userId) {
      return res.status(400).json({ error: 'Missing tenant or user context' });
    }

    const jobData: PrivacyJob = {
      kind: 'export',
      tenantId,
      userId,
      requestId: (req as any).requestId,
      format,
    };

    const job = await queueManager.addJob(QueueName.PRIVACY, 'privacy:export', jobData, {
      removeOnComplete: { age: 24 * 3600, count: 1000 },
      removeOnFail: { age: 7 * 24 * 3600 },
    });

    logger.info('Enqueued privacy export job', { jobId: job.id, tenantId, userId, format });
    return res.status(202).json({ status: 'queued', jobId: job.id });
  } catch (error: any) {
    logger.error('Failed to enqueue privacy export job', { error: error?.message });
    return res.status(500).json({ error: 'Failed to enqueue export' });
  }
});

/**
 * POST /api/v1/privacy/delete
 * Enqueue a GDPR delete (erasure) job for the current user (tenant-scoped).
 * Body: empty
 */
router.post('/delete', authenticate, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user || {};
    const tenantId = user.tenantId || user.publisherId || user.orgId;
    const userId = user.id || user.userId;

    if (!tenantId || !userId) {
      return res.status(400).json({ error: 'Missing tenant or user context' });
    }

    const jobData: PrivacyJob = {
      kind: 'delete',
      tenantId,
      userId,
      requestId: (req as any).requestId,
    };

    const job = await queueManager.addJob(QueueName.PRIVACY, 'privacy:delete', jobData, {
      removeOnComplete: { age: 24 * 3600, count: 1000 },
      removeOnFail: { age: 7 * 24 * 3600 },
    });

    logger.info('Enqueued privacy delete job', { jobId: job.id, tenantId, userId });
    return res.status(202).json({ status: 'queued', jobId: job.id });
  } catch (error: any) {
    logger.error('Failed to enqueue privacy delete job', { error: error?.message });
    return res.status(500).json({ error: 'Failed to enqueue delete' });
  }
});

export default router;
