/**
 * Data Export & Warehouse Integration Service
 * 
 * Handles data exports to S3/GCS, BigQuery synchronization,
 * and Parquet file generation for data warehousing
 */

import * as fs from 'fs';
import * as path from 'path';
import { createGzip } from 'zlib';
import { finished } from 'stream/promises';
import type { QueryResultRow } from 'pg';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { Storage } from '@google-cloud/storage';
import { BigQuery } from '@google-cloud/bigquery';
import logger from '../utils/logger';
import { streamQuery as pgStreamQuery } from '../utils/postgres';
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

const DATA_EXPORT_MAX_ROWS = parseInt(process.env.DATA_EXPORT_MAX_ROWS || '1000000', 10);
const DATA_EXPORT_STREAM_BATCH_SIZE = parseInt(process.env.DATA_EXPORT_STREAM_BATCH_SIZE || '5000', 10);

export class DataExportService {
  private exportDir: string;
  private readonly maxRawExportRows = DATA_EXPORT_MAX_ROWS;
  private readonly streamBatchSize = DATA_EXPORT_STREAM_BATCH_SIZE;

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

      const dataStream = this.fetchDataStream(job);
      const { filePath, rowsWritten } = await this.generateExportFile(job, dataStream, config);
      const fileSize = fs.statSync(filePath).size;

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
      job.location = this.describeExportLocation(config.destination, filePath);
      job.rowsExported = rowsWritten;
      job.fileSize = fileSize;
      job.completedAt = new Date();

      await dataExportRepository.updateExportJob(job.id, {
        status: 'completed',
        rowsExported: job.rowsExported,
        fileSize: job.fileSize,
        location: job.location,
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
   * Fetch data for export by querying Postgres read replicas
   */
  private fetchDataStream(job: ExportJob): AsyncGenerator<ExportRow> {
    const { from, to } = this.getDateBounds(job.startDate, job.endDate);
    switch (job.dataType) {
      case 'impressions':
        return this.fetchImpressionExportStream(job.publisherId, from, to);
      case 'revenue':
        return this.fetchRevenueExportStream(job.publisherId, from, to);
      case 'fraud_events':
        return this.fetchFraudExportStream(job.publisherId, from, to);
      case 'telemetry':
        return this.fetchTelemetryExportStream(job.publisherId, from, to);
      case 'all':
        return this.fetchRawImpressionExportStream(job.publisherId, from, to);
      default:
        throw new Error(`Unknown data type: ${job.dataType}`);
    }
  }

  private fetchImpressionExportStream(
    publisherId: string,
    from: Date,
    to: Date
  ): AsyncGenerator<ImpressionsExportRow> {
    type Row = {
      date: string;
      publisher_id: string;
      app_id: string | null;
      adapter_name: string | null;
      ad_format: string | null;
      country: string | null;
      impressions: string | number;
      revenue: string | number;
      avg_latency: string | number | null;
    };

    const sql = `
      SELECT
        date_trunc('day', observed_at)::date AS date,
        publisher_id,
        COALESCE(app_id, '') AS app_id,
        COALESCE(adapter_name, '') AS adapter_name,
        COALESCE(ad_format, '') AS ad_format,
        COALESCE(country_code, 'ZZ') AS country,
        COUNT(*) AS impressions,
        COALESCE(SUM(revenue_usd)::numeric, 0) AS revenue,
        COALESCE(AVG(latency_ms)::numeric, 0) AS avg_latency
      FROM analytics_impressions
      WHERE publisher_id = $1
        AND observed_at >= $2
        AND observed_at < $3
      GROUP BY 1,2,3,4,5,6
      ORDER BY date ASC, impressions DESC
    `;

    const iterator = this.streamReplicaQuery<Row>(sql, [publisherId, from, to], 'EXPORT_IMPRESSIONS');
    const self = this;
    return (async function* () {
      for await (const row of iterator) {
        yield {
          date: row.date,
          publisher_id: row.publisher_id,
          app_id: row.app_id ?? '',
          adapter_name: row.adapter_name ?? '',
          ad_format: row.ad_format ?? '',
          country: row.country ?? 'ZZ',
          impressions: self.toSafeNumber(row.impressions),
          revenue: self.toSafeNumber(row.revenue),
          avg_latency: self.toSafeNumber(row.avg_latency),
        };
      }
    })();
  }

  private fetchRevenueExportStream(
    publisherId: string,
    from: Date,
    to: Date
  ): AsyncGenerator<RevenueExportRow> {
    type Row = {
      date: string;
      publisher_id: string;
      app_id: string | null;
      adapter_name: string | null;
      ad_format: string | null;
      country: string | null;
      revenue: string | number;
      impressions: string | number;
      ecpm: string | number;
    };

    const sql = `
      SELECT
        date_trunc('day', observed_at)::date AS date,
        publisher_id,
        COALESCE(app_id, '') AS app_id,
        COALESCE(adapter_name, '') AS adapter_name,
        COALESCE(ad_format, '') AS ad_format,
        COALESCE(country_code, 'ZZ') AS country,
        COALESCE(SUM(revenue_usd)::numeric, 0) AS revenue,
        COUNT(DISTINCT impression_id) AS impressions,
        CASE
          WHEN COUNT(DISTINCT impression_id) > 0 THEN (COALESCE(SUM(revenue_usd)::numeric, 0) / COUNT(DISTINCT impression_id)) * 1000
          ELSE 0
        END AS ecpm
      FROM analytics_revenue_events
      WHERE publisher_id = $1
        AND observed_at >= $2
        AND observed_at < $3
      GROUP BY 1,2,3,4,5,6
      ORDER BY date ASC, revenue DESC
    `;

    const iterator = this.streamReplicaQuery<Row>(sql, [publisherId, from, to], 'EXPORT_REVENUE');
    const self = this;
    return (async function* () {
      for await (const row of iterator) {
        yield {
          date: row.date,
          publisher_id: row.publisher_id,
          app_id: row.app_id ?? '',
          adapter_name: row.adapter_name ?? '',
          ad_format: row.ad_format ?? '',
          country: row.country ?? 'ZZ',
          revenue: self.toSafeNumber(row.revenue),
          impressions: self.toSafeNumber(row.impressions),
          ecpm: self.toSafeNumber(row.ecpm),
        };
      }
    })();
  }

  private fetchFraudExportStream(
    publisherId: string,
    from: Date,
    to: Date
  ): AsyncGenerator<FraudEventExportRow> {
    type Row = {
      date: string;
      publisher_id: string;
      fraud_type: string | null;
      risk_level: string | null;
      events: string | number;
      blocked_revenue: string | number;
    };

    const sql = `
      SELECT
        date_trunc('day', observed_at)::date AS date,
        publisher_id,
        COALESCE(fraud_type, 'unknown') AS fraud_type,
        COALESCE(details->>'risk_level', CASE WHEN blocked THEN 'blocked' ELSE 'info' END) AS risk_level,
        COUNT(*) AS events,
        COALESCE(SUM(revenue_blocked_cents)::numeric, 0) AS blocked_revenue
      FROM analytics_fraud_events
      WHERE publisher_id = $1
        AND observed_at >= $2
        AND observed_at < $3
      GROUP BY 1,2,3,4
      ORDER BY date ASC, events DESC
    `;

    const iterator = this.streamReplicaQuery<Row>(sql, [publisherId, from, to], 'EXPORT_FRAUD');
    const self = this;
    return (async function* () {
      for await (const row of iterator) {
        yield {
          date: row.date,
          publisher_id: row.publisher_id,
          fraud_type: row.fraud_type ?? 'unknown',
          risk_level: row.risk_level ?? 'info',
          events: self.toSafeNumber(row.events),
          blocked_revenue: self.toSafeNumber(row.blocked_revenue) / 100,
        };
      }
    })();
  }

  private fetchTelemetryExportStream(
    publisherId: string,
    from: Date,
    to: Date
  ): AsyncGenerator<TelemetryExportRow> {
    type Row = {
      date: string;
      publisher_id: string;
      app_id: string | null;
      sdk_version: string | null;
      os: string | null;
      device_type: string | null;
      sessions: string | number;
      avg_session_duration: string | number | null;
      anr_count: string | number;
      crash_count: string | number;
    };

    const sql = `
      SELECT
        date_trunc('day', observed_at)::date AS date,
        publisher_id,
        COALESCE(payload->>'app_id', payload->>'application_id', '') AS app_id,
        COALESCE(payload->>'sdk_version', payload->>'sdkVersion', '') AS sdk_version,
        COALESCE(payload->>'os', payload->>'platform', '') AS os,
        COALESCE(payload->>'device_type', payload->>'deviceType', 'unknown') AS device_type,
        COUNT(DISTINCT NULLIF(payload->>'session_id', '')) AS sessions,
        COALESCE(
          AVG(
            CASE
              WHEN (payload->>'session_duration_ms') ~ '^[0-9]+$' THEN (payload->>'session_duration_ms')::numeric / 1000
              WHEN (payload->>'session_duration_sec') ~ '^[0-9]+(\\.[0-9]+)?$' THEN (payload->>'session_duration_sec')::numeric
              ELSE NULL
            END
          ),
          0
        ) AS avg_session_duration,
        SUM(CASE WHEN event_type = 'anr' THEN 1 ELSE 0 END) AS anr_count,
        SUM(CASE WHEN event_type = 'crash' THEN 1 ELSE 0 END) AS crash_count
      FROM analytics_sdk_telemetry
      WHERE publisher_id = $1
        AND observed_at >= $2
        AND observed_at < $3
      GROUP BY 1,2,3,4,5,6
      ORDER BY date ASC, sessions DESC
    `;

    const iterator = this.streamReplicaQuery<Row>(sql, [publisherId, from, to], 'EXPORT_TELEMETRY');
    const self = this;
    return (async function* () {
      for await (const row of iterator) {
        yield {
          date: row.date,
          publisher_id: row.publisher_id,
          app_id: row.app_id ?? '',
          sdk_version: row.sdk_version ?? '',
          os: row.os ?? '',
          device_type: row.device_type ?? 'unknown',
          sessions: self.toSafeNumber(row.sessions),
          avg_session_duration: self.toSafeNumber(row.avg_session_duration),
          anr_count: self.toSafeNumber(row.anr_count),
          crash_count: self.toSafeNumber(row.crash_count),
        };
      }
    })();
  }

  private fetchRawImpressionExportStream(
    publisherId: string,
    from: Date,
    to: Date
  ): AsyncGenerator<ExportRow> {
    type Row = {
      id: string;
      event_id: string;
      observed_at: Date;
      publisher_id: string;
      app_id: string | null;
      placement_id: string | null;
      adapter_id: string | null;
      adapter_name: string | null;
      ad_unit_id: string | null;
      ad_format: string | null;
      country_code: string | null;
      device_type: string | null;
      os: string | null;
      os_version: string | null;
      session_id: string | null;
      user_id: string | null;
      request_id: string | null;
      status: string | null;
      filled: boolean;
      viewable: boolean;
      measurable: boolean;
      view_duration_ms: number | string | null;
      latency_ms: number | string | null;
      revenue_usd: string | number | null;
      is_test_mode: boolean;
      meta_json: string | null;
      created_at: Date;
    };

    const sql = `
      SELECT
        id::text AS id,
        event_id::text AS event_id,
        observed_at,
        publisher_id,
        COALESCE(app_id, '') AS app_id,
        COALESCE(placement_id, '') AS placement_id,
        COALESCE(adapter_id, '') AS adapter_id,
        COALESCE(adapter_name, '') AS adapter_name,
        COALESCE(ad_unit_id, '') AS ad_unit_id,
        COALESCE(ad_format, '') AS ad_format,
        COALESCE(country_code, 'ZZ') AS country_code,
        COALESCE(device_type, 'unknown') AS device_type,
        COALESCE(os, 'unknown') AS os,
        COALESCE(os_version, '') AS os_version,
        COALESCE(session_id, '') AS session_id,
        COALESCE(user_id, '') AS user_id,
        COALESCE(request_id, '') AS request_id,
        COALESCE(status, '') AS status,
        filled,
        viewable,
        measurable,
        view_duration_ms,
        latency_ms,
        COALESCE(revenue_usd, 0) AS revenue_usd,
        is_test_mode,
        COALESCE(meta::text, '{}') AS meta_json,
        created_at
      FROM analytics_impressions
      WHERE publisher_id = $1
        AND observed_at >= $2
        AND observed_at < $3
      ORDER BY observed_at ASC
      LIMIT $4
    `;

    const iterator = this.streamReplicaQuery<Row>(
      sql,
      [publisherId, from, to, this.maxRawExportRows],
      'EXPORT_ALL_IMPRESSIONS'
    );
    const self = this;
    return (async function* () {
      for await (const row of iterator) {
        yield {
          id: row.id,
          event_id: row.event_id,
          observed_at: row.observed_at instanceof Date ? row.observed_at : new Date(row.observed_at),
          publisher_id: row.publisher_id,
          app_id: row.app_id ?? '',
          placement_id: row.placement_id ?? '',
          adapter_id: row.adapter_id ?? '',
          adapter_name: row.adapter_name ?? '',
          ad_unit_id: row.ad_unit_id ?? '',
          ad_format: row.ad_format ?? '',
          country_code: row.country_code ?? 'ZZ',
          device_type: row.device_type ?? 'unknown',
          os: row.os ?? 'unknown',
          os_version: row.os_version ?? '',
          session_id: row.session_id ?? '',
          user_id: row.user_id ?? '',
          request_id: row.request_id ?? '',
          status: row.status ?? '',
          filled: row.filled,
          viewable: row.viewable,
          measurable: row.measurable,
          view_duration_ms: self.toSafeNumber(row.view_duration_ms),
          latency_ms: self.toSafeNumber(row.latency_ms),
          revenue_usd: self.toSafeNumber(row.revenue_usd),
          is_test_mode: row.is_test_mode,
          meta_json: row.meta_json ?? '{}',
          created_at: row.created_at instanceof Date ? row.created_at : new Date(row.created_at),
        };
      }
    })();
  }

  private truncateToUtcStart(date: Date): Date {
    const clone = new Date(date);
    return new Date(Date.UTC(clone.getUTCFullYear(), clone.getUTCMonth(), clone.getUTCDate()));
  }

  private getDateBounds(startDate: Date, endDate: Date): { from: Date; to: Date } {
    const from = this.truncateToUtcStart(startDate);
    const toStart = this.truncateToUtcStart(endDate);
    const to = new Date(toStart.getTime());
    to.setUTCDate(to.getUTCDate() + 1);
    return { from, to };
  }

  private streamReplicaQuery<T extends QueryResultRow = QueryResultRow>(
    sql: string,
    params: ReadonlyArray<unknown>,
    label: string
  ): AsyncGenerator<T> {
    return pgStreamQuery<T>(sql, params, { replica: true, label, batchSize: this.streamBatchSize });
  }

  private toSafeNumber(value: string | number | null | undefined): number {
    if (value === null || value === undefined) {
      return 0;
    }
    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : 0;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private createWritableTarget(filePath: string, compress: boolean): {
    target: NodeJS.WritableStream;
    output: fs.WriteStream;
  } {
    const output = fs.createWriteStream(filePath);
    if (compress) {
      const gzip = createGzip();
      gzip.pipe(output);
      return { target: gzip, output };
    }
    return { target: output, output };
  }

  private formatCsvValue(value: ExportRowPrimitive | undefined): string {
    if (value === null || value === undefined) {
      return '';
    }
    if (value instanceof Date) {
      return value.toISOString();
    }
    if (typeof value === 'string') {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return String(value);
  }

  private buildParquetSchema(firstRow: ExportRow): Record<string, { type: string; optional: boolean }> {
    const schemaDef: Record<string, { type: string; optional: boolean }> = {};
    Object.keys(firstRow).forEach((key) => {
      const val = firstRow[key];
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
    return schemaDef;
  }

  /**
   * Generate export file (CSV, JSON, or Parquet)
   */
  private async generateExportFile(
    job: ExportJob,
    stream: AsyncGenerator<ExportRow>,
    config: ExportConfig
  ): Promise<{ filePath: string; rowsWritten: number }> {
    try {
      const fileName = `${job.dataType}_${job.publisherId}_${Date.now()}.${config.format}${config.compression === 'gzip' ? '.gz' : ''}`;
      const filePath = path.join(this.exportDir, fileName);
      const first = await stream.next();
      if (first.done || !first.value) {
        throw new Error('No data to export');
      }

      let rowsWritten = 0;
      switch (config.format) {
        case 'csv':
          rowsWritten = await this.generateCSV(filePath, first.value, stream, config.compression === 'gzip');
          break;

        case 'json':
          rowsWritten = await this.generateJSON(filePath, first.value, stream, config.compression === 'gzip');
          break;

        case 'parquet':
          rowsWritten = await this.generateParquet(filePath, first.value, stream);
          break;

        default:
          throw new Error(`Unsupported format: ${config.format}`);
      }

      return { filePath, rowsWritten };
    } catch (error) {
      logger.error('Failed to generate export file', { error, jobId: job.id });
      throw error;
    }
  }

  /**
   * Generate CSV file
   */
  private async generateCSV(
    filePath: string,
    firstRow: ExportRow,
    stream: AsyncGenerator<ExportRow>,
    compress: boolean
  ): Promise<number> {
    const headers = Object.keys(firstRow);
    const { target, output } = this.createWritableTarget(filePath, compress);
    let closed = false;
    const closeStream = async () => {
      if (!closed) {
        closed = true;
        target.end();
        try {
          await finished(output);
        } catch (e) {
          logger.warn('Failed to finalize CSV stream', { filePath, error: (e as Error)?.message });
        }
      }
    };

    try {
      target.write(headers.join(',') + '\n');

      const writeRow = (row: ExportRow): void => {
        const values = headers.map((header) => this.formatCsvValue(row[header]));
        target.write(values.join(',') + '\n');
      };

      let rows = 0;
      writeRow(firstRow);
      rows += 1;

      for await (const row of stream) {
        writeRow(row);
        rows += 1;
      }

      await closeStream();
      logger.info('Generated CSV export', { filePath, rows });
      return rows;
    } catch (error) {
      await closeStream();
      logger.error('Failed to generate CSV', { error, filePath });
      throw error;
    }
  }

  /**
   * Generate JSON file
   */
  private async generateJSON(
    filePath: string,
    firstRow: ExportRow,
    stream: AsyncGenerator<ExportRow>,
    compress: boolean
  ): Promise<number> {
    const { target, output } = this.createWritableTarget(filePath, compress);
    let closed = false;
    const closeStream = async () => {
      if (!closed) {
        closed = true;
        target.end();
        try {
          await finished(output);
        } catch (e) {
          logger.warn('Failed to finalize JSON stream', { filePath, error: (e as Error)?.message });
        }
      }
    };

    try {
      let rows = 0;
      target.write('[\n');
      target.write(`  ${JSON.stringify(firstRow)}`);
      rows += 1;

      for await (const row of stream) {
        target.write(',\n');
        target.write(`  ${JSON.stringify(row)}`);
        rows += 1;
      }

      target.write('\n]\n');
      await closeStream();
      logger.info('Generated JSON export', { filePath, rows });
      return rows;
    } catch (error) {
      await closeStream();
      logger.error('Failed to generate JSON', { error, filePath });
      throw error;
    }
  }

  /**
   * Generate Parquet file
   */
  private async generateParquet(
    filePath: string,
    firstRow: ExportRow,
    stream: AsyncGenerator<ExportRow>
  ): Promise<number> {
    try {
      const { ParquetSchema, ParquetWriter } = await import('parquetjs-lite');
      const schema = new ParquetSchema(this.buildParquetSchema(firstRow));
      const writer = await ParquetWriter.openFile(schema, filePath);
      let rows = 0;

      try {
        await writer.appendRow(firstRow);
        rows += 1;

        for await (const row of stream) {
          await writer.appendRow(row);
          rows += 1;
        }
      } finally {
        await writer.close();
      }

      logger.info('Generated Parquet export', { filePath, rows });
      return rows;
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

  private describeExportLocation(destination: ExportConfig['destination'], localPath: string): string {
    switch (destination.type) {
      case 's3':
        if (destination.bucket && destination.path) {
          return `s3://${destination.bucket}/${destination.path}`;
        }
        break;
      case 'gcs':
        if (destination.bucket && destination.path) {
          return `gs://${destination.bucket}/${destination.path}`;
        }
        break;
      case 'bigquery':
        if (destination.dataset && destination.table) {
          return `bigquery://${destination.dataset}.${destination.table}`;
        }
        break;
      default:
        break;
    }
    return localPath;
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
