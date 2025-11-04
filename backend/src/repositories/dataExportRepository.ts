/**
 * Data Export Repository
 * 
 * Database persistence layer for export jobs and warehouse syncs
 */

import { query } from '../utils/postgres';
import logger from '../utils/logger';
import type { ExportJob, DataWarehouseSync } from '../services/dataExportService';

export interface ExportJobRow {
  id: string;
  publisher_id: string;
  data_type: string;
  status: string;
  format: string;
  destination: string;
  start_date: Date;
  end_date: Date;
  rows_exported: number;
  file_size: number;
  location: string | null;
  error: string | null;
  config: object;
  created_at: Date;
  completed_at: Date | null;
}

export interface WarehouseSyncRow {
  id: string;
  publisher_id: string;
  warehouse_type: string;
  status: string;
  sync_interval: number;
  last_sync_time: Date;
  next_sync_time: Date;
  rows_synced: number;
  config: object;
  created_at: Date;
  updated_at: Date;
}

/**
 * Create export job
 */
export async function createExportJob(job: ExportJob): Promise<void> {
  try {
    await query(
      `INSERT INTO export_jobs 
       (id, publisher_id, data_type, status, format, destination, start_date, end_date, 
        rows_exported, file_size, location, error, config, created_at, completed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
      [
        job.id,
        job.publisherId,
        job.dataType,
        job.status,
        job.type,
        job.destination,
        job.startDate,
        job.endDate,
        job.rowsExported,
        job.fileSize,
        job.location || null,
        job.error || null,
        JSON.stringify({}),
        job.createdAt,
        job.completedAt || null,
      ]
    );
  } catch (error) {
    logger.error('Failed to create export job in DB', { error, jobId: job.id });
    throw error;
  }
}

/**
 * Update export job
 */
export async function updateExportJob(
  jobId: string,
  updates: Partial<Pick<ExportJob, 'status' | 'rowsExported' | 'fileSize' | 'location' | 'error' | 'completedAt'>>
): Promise<void> {
  try {
    const setClauses: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (updates.status !== undefined) {
      setClauses.push(`status = $${paramIndex++}`);
      values.push(updates.status);
    }
    if (updates.rowsExported !== undefined) {
      setClauses.push(`rows_exported = $${paramIndex++}`);
      values.push(updates.rowsExported);
    }
    if (updates.fileSize !== undefined) {
      setClauses.push(`file_size = $${paramIndex++}`);
      values.push(updates.fileSize);
    }
    if (updates.location !== undefined) {
      setClauses.push(`location = $${paramIndex++}`);
      values.push(updates.location);
    }
    if (updates.error !== undefined) {
      setClauses.push(`error = $${paramIndex++}`);
      values.push(updates.error);
    }
    if (updates.completedAt !== undefined) {
      setClauses.push(`completed_at = $${paramIndex++}`);
      values.push(updates.completedAt);
    }

    if (setClauses.length === 0) {
      return;
    }

    values.push(jobId);
    const sql = `UPDATE export_jobs SET ${setClauses.join(', ')} WHERE id = $${paramIndex}`;

    await query(sql, values);
  } catch (error) {
    logger.error('Failed to update export job in DB', { error, jobId });
    throw error;
  }
}

/**
 * Get export job by ID
 */
export async function getExportJobById(jobId: string): Promise<ExportJob | null> {
  try {
    const result = await query<ExportJobRow>(
      'SELECT * FROM export_jobs WHERE id = $1',
      [jobId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      id: row.id,
      publisherId: row.publisher_id,
      dataType: row.data_type as ExportJob['dataType'],
      status: row.status as ExportJob['status'],
      type: row.format as ExportJob['type'],
      destination: row.destination as ExportJob['destination'],
      startDate: new Date(row.start_date),
      endDate: new Date(row.end_date),
      rowsExported: row.rows_exported,
      fileSize: Number(row.file_size),
      location: row.location || undefined,
      error: row.error || undefined,
      createdAt: new Date(row.created_at),
      completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
    };
  } catch (error) {
    logger.error('Failed to get export job from DB', { error, jobId });
    throw error;
  }
}

/**
 * List export jobs for publisher
 */
export async function listExportJobsByPublisher(
  publisherId: string,
  limit: number = 50
): Promise<ExportJob[]> {
  try {
    const result = await query<ExportJobRow>(
      `SELECT * FROM export_jobs 
       WHERE publisher_id = $1 
       ORDER BY created_at DESC 
       LIMIT $2`,
      [publisherId, limit]
    );

    return result.rows.map((row) => ({
      id: row.id,
      publisherId: row.publisher_id,
      dataType: row.data_type as ExportJob['dataType'],
      status: row.status as ExportJob['status'],
      type: row.format as ExportJob['type'],
      destination: row.destination as ExportJob['destination'],
      startDate: new Date(row.start_date),
      endDate: new Date(row.end_date),
      rowsExported: row.rows_exported,
      fileSize: Number(row.file_size),
      location: row.location || undefined,
      error: row.error || undefined,
      createdAt: new Date(row.created_at),
      completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
    }));
  } catch (error) {
    logger.error('Failed to list export jobs from DB', { error, publisherId });
    throw error;
  }
}

/**
 * Create warehouse sync
 */
export async function createWarehouseSync(sync: DataWarehouseSync & { publisherId: string }): Promise<void> {
  try {
    await query(
      `INSERT INTO warehouse_syncs 
       (id, publisher_id, warehouse_type, status, sync_interval, last_sync_time, 
        next_sync_time, rows_synced, config, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())`,
      [
        sync.id,
        sync.publisherId,
        sync.warehouseType,
        sync.status,
        sync.syncInterval,
        sync.lastSyncTime,
        sync.nextSyncTime,
        sync.rowsSynced,
        JSON.stringify({}),
      ]
    );
  } catch (error) {
    logger.error('Failed to create warehouse sync in DB', { error, syncId: sync.id });
    throw error;
  }
}

/**
 * Update warehouse sync
 */
export async function updateWarehouseSync(
  syncId: string,
  updates: Partial<Pick<DataWarehouseSync, 'status' | 'lastSyncTime' | 'nextSyncTime' | 'rowsSynced'>>
): Promise<void> {
  try {
    const setClauses: string[] = ['updated_at = NOW()'];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (updates.status !== undefined) {
      setClauses.push(`status = $${paramIndex++}`);
      values.push(updates.status);
    }
    if (updates.lastSyncTime !== undefined) {
      setClauses.push(`last_sync_time = $${paramIndex++}`);
      values.push(updates.lastSyncTime);
    }
    if (updates.nextSyncTime !== undefined) {
      setClauses.push(`next_sync_time = $${paramIndex++}`);
      values.push(updates.nextSyncTime);
    }
    if (updates.rowsSynced !== undefined) {
      setClauses.push(`rows_synced = $${paramIndex++}`);
      values.push(updates.rowsSynced);
    }

    values.push(syncId);
    const sql = `UPDATE warehouse_syncs SET ${setClauses.join(', ')} WHERE id = $${paramIndex}`;

    await query(sql, values);
  } catch (error) {
    logger.error('Failed to update warehouse sync in DB', { error, syncId });
    throw error;
  }
}

/**
 * Get warehouse sync by ID
 */
export async function getWarehouseSyncById(syncId: string): Promise<(DataWarehouseSync & { publisherId: string }) | null> {
  try {
    const result = await query<WarehouseSyncRow>(
      'SELECT * FROM warehouse_syncs WHERE id = $1',
      [syncId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      id: row.id,
      publisherId: row.publisher_id,
      warehouseType: row.warehouse_type as DataWarehouseSync['warehouseType'],
      status: row.status as DataWarehouseSync['status'],
      syncInterval: row.sync_interval,
      lastSyncTime: new Date(row.last_sync_time),
      nextSyncTime: new Date(row.next_sync_time),
      rowsSynced: Number(row.rows_synced),
    };
  } catch (error) {
    logger.error('Failed to get warehouse sync from DB', { error, syncId });
    throw error;
  }
}

export default {
  createExportJob,
  updateExportJob,
  getExportJobById,
  listExportJobsByPublisher,
  createWarehouseSync,
  updateWarehouseSync,
  getWarehouseSyncById,
};
