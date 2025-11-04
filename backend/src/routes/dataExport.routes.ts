/**
 * Data Export Routes
 * 
 * REST API routes for data export and warehouse integration
 */

import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { cache, invalidateCache } from '../middleware/cache';
import { cacheTTL } from '../utils/redis';
import * as dataExportController from '../controllers/dataExport.controller';

const router = Router();

// All routes require authentication
router.use(authenticate);

/**
 * POST /api/data-export/jobs
 * Create a new data export job
 * 
 * Body:
 * - dataType: 'impressions' | 'revenue' | 'fraud_events' | 'telemetry' | 'all' (required)
 * - startDate: string (ISO 8601 date) (required)
 * - endDate: string (ISO 8601 date) (required)
 * - config: {
 *     format: 'csv' | 'parquet' | 'json' (required)
 *     compression: 'none' | 'gzip' | 'snappy' (default: none)
 *     partitionBy: 'date' | 'hour' | 'adapter' (optional)
 *     destination: {
 *       type: 's3' | 'gcs' | 'bigquery' | 'local' (required)
 *       bucket: string (for s3/gcs)
 *       path: string (for s3/gcs)
 *       dataset: string (for bigquery)
 *       table: string (for bigquery)
 *     }
 *   }
 */
router.post('/jobs', invalidateCache((req) => `export:jobs:${req.user?.publisherId}`), dataExportController.createExportJob);

/**
 * GET /api/data-export/jobs/:jobId
 * Get export job status and details
 */
router.get('/jobs/:jobId', cache({ 
  ttl: cacheTTL.short, // Cache for 1 minute - job status changes frequently
  varyBy: ['params.jobId']
}), dataExportController.getExportJob);

/**
 * GET /api/data-export/jobs
 * List export jobs for the authenticated publisher
 * 
 * Query params:
 * - limit: number (default: 50, max: 100)
 */
router.get('/jobs', cache({ 
  ttl: cacheTTL.medium, // Cache for 5 minutes
  varyBy: ['query.limit']
}), dataExportController.listExportJobs);

/**
 * GET /api/data-export/jobs/:jobId/download
 * Download export file (for local exports only)
 */
router.get('/jobs/:jobId/download', dataExportController.downloadExportFile);

/**
 * POST /api/data-export/warehouse/sync
 * Schedule automated warehouse synchronization
 * 
 * Body:
 * - warehouseType: 'bigquery' | 'redshift' | 'snowflake' (required)
 * - syncInterval: number (hours, 1-168) (required)
 */
router.post('/warehouse/sync', dataExportController.scheduleWarehouseSync);

/**
 * POST /api/data-export/warehouse/sync/:syncId/execute
 * Manually trigger a warehouse sync
 */
router.post('/warehouse/sync/:syncId/execute', dataExportController.executeWarehouseSync);

export default router;
