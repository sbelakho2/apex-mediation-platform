/**
 * Data Export Jobs
 * 
 * Background jobs for exporting analytics data
 */

import { Job } from 'bullmq';
import { createWriteStream } from 'fs';
import { join } from 'path';
import { format as formatCsv } from '@fast-csv/format';
import logger from '../../utils/logger';
import pool, { query } from '../../utils/postgres';
import { DataExportJob } from '../queueManager';

type AnalyticsExportRow = {
  date: string;
  publisher_id: string;
  app_id: string;
  ad_unit_id: string;
  adapter_id: string;
  country: string;
  impressions: number;
  filled_impressions: number;
  clicks: number;
  revenue: number;
  ctr: number;
  fill_rate: number;
  ecpm: number;
};

/**
 * Process data export job
 */
export async function processDataExport(job: Job<DataExportJob>): Promise<void> {
  const { jobId, publisherId, format, startDate, endDate, filters } = job.data;

  logger.info('Processing data export', {
    jobId: job.id,
    exportJobId: jobId,
    publisherId,
    format,
    startDate,
    endDate,
  });

  try {
    // Update job status to processing
    await updateJobStatus(jobId, 'processing');
    await job.updateProgress(10);

    // Fetch data from Postgres rollups
    const data = await fetchExportData(publisherId, startDate, endDate, filters);
    await job.updateProgress(50);

    // Generate file
    const filePath = await generateExportFile(jobId, data, format);
    await job.updateProgress(80);

    // Update job with file info
    await updateJobWithFile(jobId, filePath);
    await job.updateProgress(100);

    logger.info('Data export completed', {
      jobId: job.id,
      exportJobId: jobId,
      filePath,
    });
  } catch (error) {
    logger.error('Data export failed', {
      jobId: job.id,
      exportJobId: jobId,
      error,
    });

    await updateJobStatus(jobId, 'failed', error instanceof Error ? error.message : 'Unknown error');
    throw error;
  }
}

/**
 * Fetch data for export
 */
async function fetchExportData(
  publisherId: string,
  startDate: string,
  endDate: string,
  _filters?: Record<string, unknown>
): Promise<AnalyticsExportRow[]> {
  const sql = `
    SELECT
      bucket_date::text AS date,
      publisher_id,
      NULLIF(app_id, '') AS app_id,
      NULLIF(ad_unit_id, '') AS ad_unit_id,
      NULLIF(adapter_id, '') AS adapter_id,
      country_code AS country,
      impression_count::double precision AS impressions,
      filled_count::double precision AS filled_impressions,
      click_count::double precision AS clicks,
      total_revenue::double precision AS revenue,
      ctr::double precision AS ctr,
      fill_rate::double precision AS fill_rate,
      ecpm::double precision AS ecpm
    FROM analytics_metrics_rollups
    WHERE publisher_id = $1
      AND bucket_date >= $2::date
      AND bucket_date < $3::date
    ORDER BY bucket_date DESC, impression_count DESC
  `;

  const { rows } = await query<AnalyticsExportRow>(sql, [publisherId, startDate, endDate], {
    label: 'analytics_export_rollup',
    replica: true,
  });

  logger.debug('Export data fetched', {
    publisherId,
    rowCount: rows.length,
  });

  return rows;
}

/**
 * Generate export file
 */
async function generateExportFile(
  jobId: string,
  data: AnalyticsExportRow[],
  format: 'csv' | 'json'
): Promise<string> {
  const exportDir = process.env.EXPORT_DIR || join(process.cwd(), 'exports');
  const fileName = `export_${jobId}.${format}`;
  const filePath = join(exportDir, fileName);

  if (format === 'csv') {
    await generateCsvFile(filePath, data);
  } else {
    await generateJsonFile(filePath, data);
  }

  logger.debug('Export file generated', { filePath });
  return filePath;
}

/**
 * Generate CSV file
 */
async function generateCsvFile(filePath: string, data: AnalyticsExportRow[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const writeStream = createWriteStream(filePath);
    const csvStream = formatCsv({ headers: true });

    csvStream.pipe(writeStream);

    data.forEach((row) => csvStream.write(row));
    csvStream.end();

    writeStream.on('finish', resolve);
    writeStream.on('error', reject);
  });
}

/**
 * Generate JSON file
 */
async function generateJsonFile(filePath: string, data: AnalyticsExportRow[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const writeStream = createWriteStream(filePath);

    writeStream.write(JSON.stringify(data, null, 2));
    writeStream.end();

    writeStream.on('finish', resolve);
    writeStream.on('error', reject);
  });
}

/**
 * Update job status in database
 */
async function updateJobStatus(
  jobId: string,
  status: string,
  error?: string
): Promise<void> {
  const query = `
    UPDATE data_export_jobs
    SET status = $1, error = $2, updated_at = NOW()
    WHERE id = $3
  `;

  await pool.query(query, [status, error || null, jobId]);

  logger.debug('Job status updated', { jobId, status });
}

/**
 * Update job with file information
 */
async function updateJobWithFile(jobId: string, filePath: string): Promise<void> {
  const query = `
    UPDATE data_export_jobs
    SET 
      status = 'completed',
      file_path = $1,
      completed_at = NOW(),
      updated_at = NOW()
    WHERE id = $2
  `;

  await pool.query(query, [filePath, jobId]);

  logger.debug('Job completed with file', { jobId, filePath });
}
