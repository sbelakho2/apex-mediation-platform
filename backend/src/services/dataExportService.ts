/**
 * Data Export & Warehouse Integration Service
 * 
 * Handles data exports to S3/GCS, BigQuery synchronization,
 * and Parquet file generation for data warehousing
 */

import * as fs from 'fs';
import * as path from 'path';
import { gzipSync } from 'zlib';
// import { Readable } from 'stream';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { Storage } from '@google-cloud/storage';
import { BigQuery } from '@google-cloud/bigquery';
import logger from '../utils/logger';
import { executeQuery } from '../utils/clickhouse';
import * as dataExportRepository from '../repositories/dataExportRepository';

type ExportRowPrimitive = string | number | boolean | Date | null;
type ExportRow = Record<string, ExportRowPrimitive>;

type ImpressionsExportRow = ExportRow & {
  date: string;
  publisher_id: string;
  app_id: string;
  adapter_name: string;
  ad_format: string;
  country: string;
  impressions: number;
  revenue: number;
  avg_latency: number;
};

type RevenueExportRow = ExportRow & {
  date: string;
  publisher_id: string;
  app_id: string;
  adapter_name: string;
  ad_format: string;
  country: string;
  revenue: number;
  impressions: number;
  ecpm: number;
};

type FraudEventExportRow = ExportRow & {
  date: string;
  publisher_id: string;
  fraud_type: string;
  risk_level: string;
  events: number;
  blocked_revenue: number;
};

type TelemetryExportRow = ExportRow & {
  date: string;
  publisher_id: string;
  app_id: string;
  sdk_version: string;
  os: string;
  device_type: string;
  sessions: number;
  avg_session_duration: number;
  anr_count: number;
  crash_count: number;
};

export interface ExportJob {
  id: string;
  type: 'csv' | 'parquet' | 'json';
  destination: 's3' | 'gcs' | 'bigquery' | 'local';
  status: 'pending' | 'running' | 'completed' | 'failed';
  publisherId: string;
  dataType: 'impressions' | 'revenue' | 'fraud_events' | 'telemetry' | 'all';
  startDate: Date;
  endDate: Date;
  rowsExported: number;
  fileSize: number;
  location?: string;
  error?: string;
  createdAt: Date;
  completedAt?: Date;
}

export interface ExportConfig {
  format: 'csv' | 'parquet' | 'json';
  compression: 'none' | 'gzip' | 'snappy';
  partitionBy?: 'date' | 'hour' | 'adapter';
  destination: {
    type: 's3' | 'gcs' | 'bigquery' | 'local';
    bucket?: string;
    path?: string;
    dataset?: string; // For BigQuery
    table?: string; // For BigQuery
  };
}

export interface DataWarehouseSync {
  id: string;
  warehouseType: 'bigquery' | 'redshift' | 'snowflake';
  lastSyncTime: Date;
  nextSyncTime: Date;
  syncInterval: number; // hours
  rowsSynced: number;
  status: 'active' | 'paused' | 'error';
}

export interface ParquetSchema {
  name: string;
  type: 'string' | 'int' | 'float' | 'timestamp' | 'boolean';
  optional: boolean;
}

export class DataExportService {
  private exportDir: string;

  constructor() {
    this.exportDir = process.env.EXPORT_DIR || '/tmp/ad-exports';
    this.ensureExportDir();
  }

  /**
   * Ensure export directory exists
   */
  private ensureExportDir(): void {
    if (!fs.existsSync(this.exportDir)) {
      fs.mkdirSync(this.exportDir, { recursive: true });
    }
  }

  /**
   * Create export job
   */
  async createExportJob(params: {
    publisherId: string;
    dataType: ExportJob['dataType'];
    startDate: Date;
    endDate: Date;
    config: ExportConfig;
  }): Promise<ExportJob> {
    try {
      const jobId = this.generateJobId();

      const job: ExportJob = {
        id: jobId,
        type: params.config.format,
        destination: params.config.destination.type,
        status: 'pending',
        publisherId: params.publisherId,
        dataType: params.dataType,
        startDate: params.startDate,
        endDate: params.endDate,
        rowsExported: 0,
        fileSize: 0,
        createdAt: new Date(),
      };

      // Persist to database
      await dataExportRepository.createExportJob(job);

      // Start export asynchronously
      this.executeExport(job, params.config).catch((error) => {
        logger.error('Export job failed', { error, jobId });
      });

      return job;
    } catch (error) {
      logger.error('Failed to create export job', { error, params });
      throw error;
    }
  }

  /**
   * Execute export job
   */
  private async executeExport(job: ExportJob, config: ExportConfig): Promise<void> {
    try {
      job.status = 'running';
      await dataExportRepository.updateExportJob(job.id, { status: 'running' });

      // Get data from ClickHouse
      const data = await this.fetchDataForExport(job);

      // Generate export file
      const filePath = await this.generateExportFile(job, data, config);

      // Upload to destination
      if (config.destination.type !== 'local') {
        await this.uploadToDestination(filePath, config.destination);
        // After successful upload, remove local temp file to avoid disk bloat (FIX-11: 634)
        try {
          fs.unlinkSync(filePath);
        } catch (e) {
          logger.warn('Failed to delete local export file after upload', { filePath, error: e });
        }
      }

      job.status = 'completed';
      job.location = filePath;
      job.rowsExported = data.length;
      job.fileSize = fs.statSync(filePath).size;
      job.completedAt = new Date();

      await dataExportRepository.updateExportJob(job.id, {
        status: 'completed',
        rowsExported: job.rowsExported,
        fileSize: job.fileSize,
        location: filePath,
        completedAt: job.completedAt,
      });

      logger.info('Export job completed', { jobId: job.id, rowsExported: job.rowsExported });
    } catch (error) {
      job.status = 'failed';
      job.error = error instanceof Error ? error.message : 'Unknown error';
      
      await dataExportRepository.updateExportJob(job.id, {
        status: 'failed',
        error: job.error,
      });

      logger.error('Export job failed', { error, jobId: job.id });
      throw error;
    }
  }

  /**
   * Fetch data from ClickHouse for export
   */
  private async fetchDataForExport(job: ExportJob): Promise<ExportRow[]> {
    try {
      const startDate = job.startDate.toISOString().split('T')[0];
      const endDate = job.endDate.toISOString().split('T')[0];

      let query = '';

      switch (job.dataType) {
        case 'impressions':
          query = `
            SELECT
              toDate(timestamp) as date,
              publisher_id,
              app_id,
              adapter_name,
              ad_format,
              country,
              count() as impressions,
              sum(revenue) as revenue,
              avg(latency) as avg_latency
            FROM impressions
            WHERE publisher_id = {publisherId:String}
              AND toDate(timestamp) >= toDate(parseDateTimeBestEffort({start:String}))
              AND toDate(timestamp) <= toDate(parseDateTimeBestEffort({end:String}))
            GROUP BY date, publisher_id, app_id, adapter_name, ad_format, country
            ORDER BY date, impressions DESC
          `;
          break;

        case 'revenue':
          query = `
            SELECT
              toDate(timestamp) as date,
              publisher_id,
              app_id,
              adapter_name,
              ad_format,
              country,
              sum(revenue_usd) as revenue,
              countDistinct(impression_id) as impressions,
              if(countDistinct(impression_id) > 0, sum(revenue_usd) / countDistinct(impression_id) * 1000, 0) as ecpm
            FROM revenue_events
            WHERE publisher_id = {publisherId:String}
              AND toDate(timestamp) >= toDate(parseDateTimeBestEffort({start:String}))
              AND toDate(timestamp) <= toDate(parseDateTimeBestEffort({end:String}))
            GROUP BY date, publisher_id, app_id, adapter_name, ad_format, country
            ORDER BY date, revenue DESC
          `;
          break;

        case 'fraud_events':
          query = `
            SELECT
              toDate(detected_at) as date,
              publisher_id,
              fraud_type,
              risk_level,
              count() as events,
              sum(blocked_revenue) as blocked_revenue
            FROM fraud_events
            WHERE publisher_id = {publisherId:String}
              AND toDate(detected_at) >= toDate(parseDateTimeBestEffort({start:String}))
              AND toDate(detected_at) <= toDate(parseDateTimeBestEffort({end:String}))
            GROUP BY date, publisher_id, fraud_type, risk_level
            ORDER BY date, events DESC
          `;
          break;

        case 'telemetry':
          query = `
            SELECT
              toDate(timestamp) as date,
              publisher_id,
              app_id,
              sdk_version,
              os,
              device_type,
              count() as sessions,
              avg(session_duration) as avg_session_duration,
              sum(if(anr_detected = 1, 1, 0)) as anr_count,
              sum(if(crash_detected = 1, 1, 0)) as crash_count
            FROM sdk_telemetry
            WHERE publisher_id = {publisherId:String}
              AND toDate(timestamp) >= toDate(parseDateTimeBestEffort({start:String}))
              AND toDate(timestamp) <= toDate(parseDateTimeBestEffort({end:String}))
            GROUP BY date, publisher_id, app_id, sdk_version, os, device_type
            ORDER BY date, sessions DESC
          `;
          break;

        case 'all':
          // Export all tables - caution with size
          query = `
            SELECT * FROM impressions
            WHERE publisher_id = {publisherId:String}
              AND toDate(timestamp) >= toDate(parseDateTimeBestEffort({start:String}))
              AND toDate(timestamp) <= toDate(parseDateTimeBestEffort({end:String}))
            LIMIT 1000000
          `;
          break;

        default:
          throw new Error(`Unknown data type: ${job.dataType}`);
      }

      const params = { publisherId: job.publisherId, start: startDate, end: endDate };
      switch (job.dataType) {
        case 'impressions':
          return executeQuery<ImpressionsExportRow>(query, params);
        case 'revenue':
          return executeQuery<RevenueExportRow>(query, params);
        case 'fraud_events':
          return executeQuery<FraudEventExportRow>(query, params);
        case 'telemetry':
          return executeQuery<TelemetryExportRow>(query, params);
        case 'all':
          return executeQuery<ExportRow>(query, params);
      }

      throw new Error(`Unhandled export data type: ${job.dataType}`);
    } catch (error) {
      logger.error('Failed to fetch export data', { error, jobId: job.id });
      throw error;
    }
  }

  /**
   * Generate export file (CSV, JSON, or Parquet)
   */
  private async generateExportFile(
    job: ExportJob,
  data: ExportRow[],
    config: ExportConfig
  ): Promise<string> {
    try {
      const fileName = `${job.dataType}_${job.publisherId}_${Date.now()}.${config.format}${config.compression === 'gzip' ? '.gz' : ''}`;
      const filePath = path.join(this.exportDir, fileName);

      switch (config.format) {
        case 'csv':
          await this.generateCSV(filePath, data, config.compression === 'gzip');
          break;

        case 'json':
          await this.generateJSON(filePath, data, config.compression === 'gzip');
          break;

        case 'parquet':
          await this.generateParquet(filePath, data);
          break;

        default:
          throw new Error(`Unsupported format: ${config.format}`);
      }

      return filePath;
    } catch (error) {
      logger.error('Failed to generate export file', { error, jobId: job.id });
      throw error;
    }
  }

  /**
   * Generate CSV file
   */
  private async generateCSV(filePath: string, data: ExportRow[], compress: boolean): Promise<void> {
    try {
      if (data.length === 0) {
        throw new Error('No data to export');
      }

      // Get headers from first row
      const headers = Object.keys(data[0]);

      // Create CSV content
      let csv = headers.join(',') + '\n';

      for (const row of data) {
        const values = headers.map((header) => {
          const value = row[header];
          if (value === null || value === undefined) {
            return '';
          }

          if (value instanceof Date) {
            return value.toISOString();
          }

          if (typeof value === 'string') {
            return `"${value.replace(/"/g, '""')}"`;
          }

          return value;
        });
        csv += values.join(',') + '\n';
      }

      // Write to file
      if (compress) {
        const compressed = gzipSync(csv);
        fs.writeFileSync(filePath, compressed);
      } else {
        fs.writeFileSync(filePath, csv);
      }

      logger.info('Generated CSV export', { filePath, rows: data.length });
    } catch (error) {
      logger.error('Failed to generate CSV', { error, filePath });
      throw error;
    }
  }

  /**
   * Generate JSON file
   */
  private async generateJSON(filePath: string, data: ExportRow[], compress: boolean): Promise<void> {
    try {
      const json = JSON.stringify(data, null, 2);

      if (compress) {
        const compressed = gzipSync(json);
        fs.writeFileSync(filePath, compressed);
      } else {
        fs.writeFileSync(filePath, json);
      }

      logger.info('Generated JSON export', { filePath, rows: data.length });
    } catch (error) {
      logger.error('Failed to generate JSON', { error, filePath });
      throw error;
    }
  }

  /**
   * Generate Parquet file
   */
  private async generateParquet(filePath: string, data: ExportRow[]): Promise<void> {
    try {
      if (data.length === 0) {
        throw new Error('No data to export');
      }

      // Dynamically infer schema from first row
      const { ParquetSchema, ParquetWriter } = await import('parquetjs-lite');

      const first = data[0];
  const schemaDef: Record<string, { type: string; optional: boolean }> = {};
      Object.keys(first).forEach((key) => {
        const val = first[key];
        if (typeof val === 'number') {
          schemaDef[key] = { type: 'DOUBLE', optional: true };
        } else if (typeof val === 'boolean') {
          schemaDef[key] = { type: 'BOOLEAN', optional: true };
        } else if (val instanceof Date) {
          schemaDef[key] = { type: 'TIMESTAMP_MILLIS', optional: true };
        } else {
          schemaDef[key] = { type: 'UTF8', optional: true };
        }
      });

      const schema = new ParquetSchema(schemaDef);
      const writer = await ParquetWriter.openFile(schema, filePath);

      for (const row of data) {
        await writer.appendRow(row);
      }

      await writer.close();
      logger.info('Generated Parquet export', { filePath, rows: data.length });
    } catch (error) {
      logger.error('Failed to generate Parquet', { error, filePath });
      throw error;
    }
  }

  /**
   * Upload to cloud destination (S3, GCS, BigQuery)
   */
  private async uploadToDestination(
    filePath: string,
    destination: ExportConfig['destination']
  ): Promise<void> {
    try {
      switch (destination.type) {
        case 's3':
          await this.uploadToS3(filePath, destination.bucket!, destination.path!);
          break;

        case 'gcs':
          await this.uploadToGCS(filePath, destination.bucket!, destination.path!);
          break;

        case 'bigquery':
          await this.uploadToBigQuery(filePath, destination.dataset!, destination.table!);
          break;

        default:
          logger.warn('Unknown destination type', { destination });
      }
    } catch (error) {
      logger.error('Failed to upload to destination', { error, destination });
      throw error;
    }
  }

  /**
   * Upload to AWS S3
   */
  private async uploadToS3(filePath: string, bucket: string, key: string): Promise<void> {
    try {
      const client = new S3Client({
        region: process.env.AWS_REGION || 'us-east-1',
      });
      const body = fs.createReadStream(filePath);
      await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body }));
      logger.info('Uploaded to S3', { bucket, key });
    } catch (error) {
      logger.error('Failed to upload to S3', { error, filePath });
      throw error;
    }
  }

  /**
   * Upload to Google Cloud Storage
   */
  private async uploadToGCS(filePath: string, bucket: string, key: string): Promise<void> {
    try {
      const storage = new Storage();
      await storage.bucket(bucket).upload(filePath, { destination: key });
      logger.info('Uploaded to GCS', { bucket, key });
    } catch (error) {
      logger.error('Failed to upload to GCS', { error, filePath });
      throw error;
    }
  }

  /**
   * Upload to BigQuery
   */
  private async uploadToBigQuery(
    filePath: string,
    dataset: string,
    table: string
  ): Promise<void> {
    try {
      const bq = new BigQuery();
  const metadata: Record<string, unknown> = {};
      if (filePath.endsWith('.csv') || filePath.endsWith('.csv.gz')) {
        metadata.sourceFormat = 'CSV';
        metadata.autodetect = true;
      } else if (filePath.endsWith('.json') || filePath.endsWith('.json.gz')) {
        metadata.sourceFormat = 'NEWLINE_DELIMITED_JSON';
        metadata.autodetect = true;
      } else if (filePath.endsWith('.parquet')) {
        metadata.sourceFormat = 'PARQUET';
      }
      await bq.dataset(dataset).table(table).load(filePath, metadata);
      logger.info('Uploaded to BigQuery', { dataset, table });
    } catch (error) {
      logger.error('Failed to upload to BigQuery', { error, filePath });
      throw error;
    }
  }

  /**
   * Schedule warehouse sync
   */
  async scheduleWarehouseSync(params: {
    publisherId: string;
    warehouseType: DataWarehouseSync['warehouseType'];
    syncInterval: number;
  }): Promise<DataWarehouseSync> {
    try {
      const sync: DataWarehouseSync = {
        id: this.generateJobId(),
        warehouseType: params.warehouseType,
        lastSyncTime: new Date(),
        nextSyncTime: new Date(Date.now() + params.syncInterval * 60 * 60 * 1000),
        syncInterval: params.syncInterval,
        rowsSynced: 0,
        status: 'active',
      };

      await dataExportRepository.createWarehouseSync({ ...sync, publisherId: params.publisherId });

      logger.info('Scheduled warehouse sync', { sync });

      return sync;
    } catch (error) {
      logger.error('Failed to schedule warehouse sync', { error, params });
      throw error;
    }
  }

  /**
   * Execute warehouse sync
   */
  async executeWarehouseSync(syncId: string): Promise<void> {
    try {
      const sync = await dataExportRepository.getWarehouseSyncById(syncId);
      
      if (!sync) {
        throw new Error(`Warehouse sync ${syncId} not found`);
      }

      logger.info('Executing warehouse sync', { syncId });

      // This would integrate with the warehouse-specific APIs
      // For BigQuery, Redshift, Snowflake, etc.

      // Update sync record
      await dataExportRepository.updateWarehouseSync(syncId, {
        lastSyncTime: new Date(),
        nextSyncTime: new Date(Date.now() + sync.syncInterval * 60 * 60 * 1000),
        rowsSynced: 0, // Would be actual count from sync operation
      });

      logger.info('Warehouse sync completed', { syncId });
    } catch (error) {
      logger.error('Failed to execute warehouse sync', { error, syncId });
      throw error;
    }
  }

  /**
   * Get export job status
   */
  async getExportJob(jobId: string): Promise<ExportJob | null> {
    try {
      return await dataExportRepository.getExportJobById(jobId);
    } catch (error) {
      logger.error('Failed to get export job', { error, jobId });
      throw error;
    }
  }

  /**
   * List export jobs for publisher
   */
  async listExportJobs(publisherId: string, limit: number = 50): Promise<ExportJob[]> {
    try {
      return await dataExportRepository.listExportJobsByPublisher(publisherId, limit);
    } catch (error) {
      logger.error('Failed to list export jobs', { error, publisherId });
      throw error;
    }
  }

  /**
   * Generate unique job ID
   */
  private generateJobId(): string {
    return `job-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

export const dataExportService = new DataExportService();

export default dataExportService;
