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
import clickhouse from '../../utils/clickhouse';
import pool from '../../utils/postgres';
import { DataExportJob } from '../queueManager';

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

    // Fetch data from ClickHouse
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
  filters?: Record<string, any>
): Promise<any[]> {
  const query = `
    SELECT
      toDate(i.timestamp) as date,
      i.publisher_id,
      i.app_id,
      i.ad_unit_id,
      i.adapter_id,
      i.country,
      count(*) as impressions,
      countIf(i.is_filled = 1) as filled_impressions,
      c.clicks,
      r.revenue,
      if(count(*) > 0, c.clicks / count(*) * 100, 0) as ctr,
      if(count(*) > 0, countIf(i.is_filled = 1) / count(*) * 100, 0) as fill_rate,
      if(count(*) > 0, r.revenue / count(*) * 1000, 0) as ecpm
    FROM analytics.impressions i
    LEFT JOIN (
      SELECT
        toDate(timestamp) as date,
        publisher_id,
        app_id,
        ad_unit_id,
        adapter_id,
        country,
        count(*) as clicks
      FROM analytics.clicks
      WHERE publisher_id = {publisherId:String}
        AND timestamp >= {startDate:String}
        AND timestamp < {endDate:String}
      GROUP BY date, publisher_id, app_id, ad_unit_id, adapter_id, country
    ) c ON i.date = c.date 
      AND i.publisher_id = c.publisher_id
      AND i.app_id = c.app_id
      AND i.ad_unit_id = c.ad_unit_id
      AND i.adapter_id = c.adapter_id
      AND i.country = c.country
    LEFT JOIN (
      SELECT
        toDate(timestamp) as date,
        publisher_id,
        app_id,
        ad_unit_id,
        adapter_id,
        country,
        sum(revenue) as revenue
      FROM analytics.revenue
      WHERE publisher_id = {publisherId:String}
        AND timestamp >= {startDate:String}
        AND timestamp < {endDate:String}
      GROUP BY date, publisher_id, app_id, ad_unit_id, adapter_id, country
    ) r ON i.date = r.date
      AND i.publisher_id = r.publisher_id
      AND i.app_id = r.app_id
      AND i.ad_unit_id = r.ad_unit_id
      AND i.adapter_id = r.adapter_id
      AND i.country = r.country
    WHERE i.publisher_id = {publisherId:String}
      AND i.timestamp >= {startDate:String}
      AND i.timestamp < {endDate:String}
    GROUP BY date, i.publisher_id, i.app_id, i.ad_unit_id, i.adapter_id, i.country, c.clicks, r.revenue
    ORDER BY date DESC, impressions DESC
  `;

  const result = await clickhouse.executeQuery<any>(query, {
    publisherId,
    startDate,
    endDate,
  });

  logger.debug('Export data fetched', {
    publisherId,
    rowCount: result.length,
  });

  return result;
}

/**
 * Generate export file
 */
async function generateExportFile(
  jobId: string,
  data: any[],
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
async function generateCsvFile(filePath: string, data: any[]): Promise<void> {
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
async function generateJsonFile(filePath: string, data: any[]): Promise<void> {
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
