/**
 * Queue Routes
 * 
 * API endpoints for monitoring and managing job queues
 */

import { Router, Request, Response } from 'express';
import { queueManager, QueueName } from '../queues/queueManager';
import { authenticate } from '../middleware/auth';
import logger from '../utils/logger';

const router = Router();

/**
 * Get metrics for all queues
 * GET /api/v1/queues/metrics
 */
router.get('/metrics', authenticate, async (req: Request, res: Response) => {
  try {
  const metrics: Record<string, unknown> = {};

    for (const queueName of Object.values(QueueName)) {
      const queueMetrics = await queueManager.getQueueMetrics(queueName);
      if (queueMetrics) {
        metrics[queueName] = queueMetrics;
      }
    }

    res.json({
      success: true,
      data: metrics,
    });
  } catch (error) {
    logger.error('Failed to get queue metrics', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to get queue metrics',
    });
  }
});

/**
 * Get metrics for a specific queue
 * GET /api/v1/queues/:queueName/metrics
 */
router.get('/:queueName/metrics', authenticate, async (req: Request, res: Response) => {
  try {
    const { queueName } = req.params;

    if (!Object.values(QueueName).includes(queueName as QueueName)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid queue name',
      });
    }

    const metrics = await queueManager.getQueueMetrics(queueName as QueueName);

    if (!metrics) {
      return res.status(404).json({
        success: false,
        error: 'Queue not found',
      });
    }

    res.json({
      success: true,
      data: metrics,
    });
  } catch (error) {
    logger.error('Failed to get queue metrics', { error, queueName: req.params.queueName });
    res.status(500).json({
      success: false,
      error: 'Failed to get queue metrics',
    });
  }
});

/**
 * Add a job to a queue
 * POST /api/v1/queues/:queueName/jobs
 */
router.post('/:queueName/jobs', authenticate, async (req: Request, res: Response) => {
  try {
    const { queueName } = req.params;
    const { jobName, data, options } = req.body;

    if (!Object.values(QueueName).includes(queueName as QueueName)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid queue name',
      });
    }

    if (!jobName || !data) {
      return res.status(400).json({
        success: false,
        error: 'Job name and data are required',
      });
    }

    const job = await queueManager.addJob(
      queueName as QueueName,
      jobName,
      data,
      options
    );

    if (!job) {
      return res.status(500).json({
        success: false,
        error: 'Failed to add job to queue',
      });
    }

    res.status(201).json({
      success: true,
      data: {
        jobId: job.id,
        queueName,
        jobName,
      },
    });
  } catch (error) {
    logger.error('Failed to add job to queue', { error, queueName: req.params.queueName });
    res.status(500).json({
      success: false,
      error: 'Failed to add job to queue',
    });
  }
});

/**
 * Get a specific job
 * GET /api/v1/queues/:queueName/jobs/:jobId
 */
router.get('/:queueName/jobs/:jobId', authenticate, async (req: Request, res: Response) => {
  try {
    const { queueName, jobId } = req.params;

    if (!Object.values(QueueName).includes(queueName as QueueName)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid queue name',
      });
    }

    const job = await queueManager.getJob(queueName as QueueName, jobId);

    if (!job) {
      return res.status(404).json({
        success: false,
        error: 'Job not found',
      });
    }

    res.json({
      success: true,
      data: {
        id: job.id,
        name: job.name,
        data: job.data,
        progress: job.progress,
        returnvalue: job.returnvalue,
        finishedOn: job.finishedOn,
        processedOn: job.processedOn,
        failedReason: job.failedReason,
        attemptsMade: job.attemptsMade,
      },
    });
  } catch (error) {
    logger.error('Failed to get job', {
      error,
      queueName: req.params.queueName,
      jobId: req.params.jobId,
    });
    res.status(500).json({
      success: false,
      error: 'Failed to get job',
    });
  }
});

/**
 * Remove a job
 * DELETE /api/v1/queues/:queueName/jobs/:jobId
 */
router.delete('/:queueName/jobs/:jobId', authenticate, async (req: Request, res: Response) => {
  try {
    const { queueName, jobId } = req.params;

    if (!Object.values(QueueName).includes(queueName as QueueName)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid queue name',
      });
    }

    const removed = await queueManager.removeJob(queueName as QueueName, jobId);

    if (!removed) {
      return res.status(404).json({
        success: false,
        error: 'Job not found',
      });
    }

    res.json({
      success: true,
      message: 'Job removed successfully',
    });
  } catch (error) {
    logger.error('Failed to remove job', {
      error,
      queueName: req.params.queueName,
      jobId: req.params.jobId,
    });
    res.status(500).json({
      success: false,
      error: 'Failed to remove job',
    });
  }
});

/**
 * Pause a queue
 * POST /api/v1/queues/:queueName/pause
 */
router.post('/:queueName/pause', authenticate, async (req: Request, res: Response) => {
  try {
    const { queueName } = req.params;

    if (!Object.values(QueueName).includes(queueName as QueueName)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid queue name',
      });
    }

    await queueManager.pauseQueue(queueName as QueueName);

    res.json({
      success: true,
      message: 'Queue paused successfully',
    });
  } catch (error) {
    logger.error('Failed to pause queue', { error, queueName: req.params.queueName });
    res.status(500).json({
      success: false,
      error: 'Failed to pause queue',
    });
  }
});

/**
 * Resume a queue
 * POST /api/v1/queues/:queueName/resume
 */
router.post('/:queueName/resume', authenticate, async (req: Request, res: Response) => {
  try {
    const { queueName } = req.params;

    if (!Object.values(QueueName).includes(queueName as QueueName)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid queue name',
      });
    }

    await queueManager.resumeQueue(queueName as QueueName);

    res.json({
      success: true,
      message: 'Queue resumed successfully',
    });
  } catch (error) {
    logger.error('Failed to resume queue', { error, queueName: req.params.queueName });
    res.status(500).json({
      success: false,
      error: 'Failed to resume queue',
    });
  }
});

/**
 * Clean a queue (remove old completed/failed jobs)
 * POST /api/v1/queues/:queueName/clean
 */
router.post('/:queueName/clean', authenticate, async (req: Request, res: Response) => {
  try {
    const { queueName } = req.params;
    const { gracePeriod } = req.body; // Grace period in seconds

    if (!Object.values(QueueName).includes(queueName as QueueName)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid queue name',
      });
    }

    await queueManager.cleanQueue(
      queueName as QueueName,
      gracePeriod || 3600 // Default 1 hour
    );

    res.json({
      success: true,
      message: 'Queue cleaned successfully',
    });
  } catch (error) {
    logger.error('Failed to clean queue', { error, queueName: req.params.queueName });
    res.status(500).json({
      success: false,
      error: 'Failed to clean queue',
    });
  }
});

export default router;
