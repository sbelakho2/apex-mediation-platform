/**
 * Data Export Controller
 * 
 * REST API endpoints for data export and warehouse integration
 */

import { Request, Response } from 'express';
import fs from 'fs';
import { z } from 'zod';
import { dataExportService } from '../services/dataExportService';
import logger from '../utils/logger';

// Validation schemas
const createExportJobSchema = z.object({
  dataType: z.enum(['impressions', 'revenue', 'fraud_events', 'telemetry', 'all']),
  startDate: z.string().refine((date) => !isNaN(Date.parse(date)), {
    message: 'Invalid date format',
  }),
  endDate: z.string().refine((date) => !isNaN(Date.parse(date)), {
    message: 'Invalid date format',
  }),
  config: z.object({
    format: z.enum(['csv', 'parquet', 'json']),
    compression: z.enum(['none', 'gzip', 'snappy']).default('none'),
    partitionBy: z.enum(['date', 'hour', 'adapter']).optional(),
    destination: z.object({
      type: z.enum(['s3', 'gcs', 'bigquery', 'local']),
      bucket: z.string().optional(),
      path: z.string().optional(),
      dataset: z.string().optional(),
      table: z.string().optional(),
    }),
  }),
});

const scheduleWarehouseSyncSchema = z.object({
  warehouseType: z.enum(['bigquery', 'redshift', 'snowflake']),
  syncInterval: z.number().int().min(1).max(168), // 1-168 hours (1 week max)
});

/**
 * Create data export job
 */
export async function createExportJob(req: Request, res: Response): Promise<void> {
  try {
    const publisherId = req.user?.publisherId;
    if (!publisherId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

  const body: z.infer<typeof createExportJobSchema> = createExportJobSchema.parse(req.body);

    const job = await dataExportService.createExportJob({
      publisherId,
      dataType: body.dataType,
      startDate: new Date(body.startDate),
      endDate: new Date(body.endDate),
      config: body.config,
    });

    res.status(201).json({
      success: true,
      data: job,
      meta: {
        message: 'Export job created and started asynchronously',
        statusEndpoint: `/api/data-export/jobs/${job.id}`,
      },
    });
  } catch (error) {
    logger.error('Failed to create export job', { error, body: req.body });
    
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid request', details: error.errors });
      return;
    }

    res.status(500).json({ error: 'Failed to create export job' });
  }
}

/**
 * Get export job status
 */
export async function getExportJob(req: Request, res: Response): Promise<void> {
  try {
    const { jobId } = req.params;
    const publisherId = req.user?.publisherId;

    if (!publisherId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const job = await dataExportService.getExportJob(jobId);

    if (!job) {
      res.status(404).json({ error: 'Export job not found' });
      return;
    }

    // Check if job belongs to publisher
    if (job.publisherId !== publisherId) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    res.json({
      success: true,
      data: job,
      meta: {
        progress: job.status === 'completed' ? 100 : job.status === 'running' ? 50 : 0,
        downloadUrl: job.status === 'completed' && job.destination === 'local' 
          ? `/api/data-export/jobs/${job.id}/download` 
          : undefined,
      },
    });
  } catch (error) {
    logger.error('Failed to get export job', { error, jobId: req.params.jobId });
    res.status(500).json({ error: 'Failed to get export job' });
  }
}

/**
 * List export jobs for publisher
 */
export async function listExportJobs(req: Request, res: Response): Promise<void> {
  try {
    const publisherId = req.user?.publisherId;
    if (!publisherId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;

    const jobs = await dataExportService.listExportJobs(publisherId, limit);

    res.json({
      success: true,
      data: jobs,
      meta: {
        count: jobs.length,
        limit,
      },
    });
  } catch (error) {
    logger.error('Failed to list export jobs', { error });
    res.status(500).json({ error: 'Failed to list export jobs' });
  }
}

/**
 * Schedule warehouse sync
 */
export async function scheduleWarehouseSync(req: Request, res: Response): Promise<void> {
  try {
    const publisherId = req.user?.publisherId;
    if (!publisherId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

  const body: z.infer<typeof scheduleWarehouseSyncSchema> = scheduleWarehouseSyncSchema.parse(req.body);

    const sync = await dataExportService.scheduleWarehouseSync({
      publisherId,
      ...body,
    });

    res.status(201).json({
      success: true,
      data: sync,
      meta: {
        message: `Warehouse sync scheduled to run every ${sync.syncInterval} hour(s)`,
        nextSync: sync.nextSyncTime,
      },
    });
  } catch (error) {
    logger.error('Failed to schedule warehouse sync', { error, body: req.body });
    
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid request', details: error.errors });
      return;
    }

    res.status(500).json({ error: 'Failed to schedule warehouse sync' });
  }
}

/**
 * Execute warehouse sync manually
 */
export async function executeWarehouseSync(req: Request, res: Response): Promise<void> {
  try {
    const { syncId } = req.params;
    const publisherId = req.user?.publisherId;

    if (!publisherId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    await dataExportService.executeWarehouseSync(syncId);

    res.json({
      success: true,
      message: 'Warehouse sync executed successfully',
    });
  } catch (error) {
    logger.error('Failed to execute warehouse sync', { error, syncId: req.params.syncId });
    res.status(500).json({ error: 'Failed to execute warehouse sync' });
  }
}

/**
 * Download export file (for local exports only)
 */
export async function downloadExportFile(req: Request, res: Response): Promise<void> {
  try {
    const { jobId } = req.params;
    const publisherId = req.user?.publisherId;

    if (!publisherId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const job = await dataExportService.getExportJob(jobId);

    if (!job) {
      res.status(404).json({ error: 'Export job not found' });
      return;
    }

    if (job.publisherId !== publisherId) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    if (job.status !== 'completed') {
      res.status(400).json({ error: 'Export job not completed' });
      return;
    }

    if (job.destination !== 'local' || !job.location) {
      res.status(400).json({ error: 'Export file not available for download' });
      return;
    }

    // Set appropriate headers for file download
    const fileName = job.location.split('/').pop() || 'export.csv';
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Type', 'application/octet-stream');

  // Stream file to response
  const fileStream = fs.createReadStream(job.location);
    fileStream.pipe(res);

    fileStream.on('error', (error: Error) => {
      logger.error('Failed to stream export file', { error, jobId });
      res.status(500).json({ error: 'Failed to download export file' });
    });
  } catch (error) {
    logger.error('Failed to download export file', { error, jobId: req.params.jobId });
    res.status(500).json({ error: 'Failed to download export file' });
  }
}

export default {
  createExportJob,
  getExportJob,
  listExportJobs,
  scheduleWarehouseSync,
  executeWarehouseSync,
  downloadExportFile,
};
