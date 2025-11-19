/**
 * AdMob Report Ingestion Service
 * 
 * Fetches revenue reports from Google AdMob API and ingests them into revenue_events table.
 * Supports both CSV file upload and API-based ingestion for BYO model.
 * 
 * Key features:
 * - AdMob Reporting API v1 integration
 * - CSV report parsing for manual uploads
 * - Placement ID mapping via ad unit IDs
 * - Revenue normalization to USD
 * - Duplicate detection and idempotency
 * - Error handling with detailed diagnostics
 */

import axios, { AxiosInstance } from 'axios';
import { Pool } from 'pg';
import { logger } from '../utils/logger';

export interface AdMobCredentials {
  accountId: string;
  accessToken: string; // Short-lived OAuth token from credential vault
}

export interface AdMobReportRow {
  date: string; // YYYY-MM-DD
  adUnitId: string; // ca-app-pub-XXXXXXXX~YYYYYY
  adUnitName: string;
  impressions: number;
  clicks: number;
  earnings: number; // In USD
  currency: string; // Always USD for AdMob
}

export interface IngestionResult {
  success: boolean;
  rowsProcessed: number;
  rowsInserted: number;
  rowsSkipped: number;
  errors: string[];
  startDate: string;
  endDate: string;
}

export interface PlacementBinding {
  placementId: string;
  adUnitId: string;
  publisherId: string;
  adapterId: string;
}

export class AdMobReportIngestionService {
  private httpClient: AxiosInstance;
  private pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
    this.httpClient = axios.create({
      baseURL: 'https://admob.googleapis.com/v1',
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * Fetch report from AdMob Reporting API
   * Uses the Network Report API to get daily revenue data
   */
  async fetchReportFromAPI(
    credentials: AdMobCredentials,
    startDate: string, // YYYY-MM-DD
    endDate: string // YYYY-MM-DD
  ): Promise<AdMobReportRow[]> {
    try {
      logger.info('Fetching AdMob report from API', {
        accountId: credentials.accountId,
        startDate,
        endDate,
      });

      const response = await this.httpClient.post(
        `/accounts/${credentials.accountId}/networkReport:generate`,
        {
          reportSpec: {
            dateRange: {
              startDate: { year: parseInt(startDate.split('-')[0]), month: parseInt(startDate.split('-')[1]), day: parseInt(startDate.split('-')[2]) },
              endDate: { year: parseInt(endDate.split('-')[0]), month: parseInt(endDate.split('-')[1]), day: parseInt(endDate.split('-')[2]) },
            },
            dimensions: ['DATE', 'AD_UNIT'],
            metrics: ['IMPRESSIONS', 'CLICKS', 'ESTIMATED_EARNINGS'],
            dimensionFilters: [],
            sortConditions: [{ dimension: 'DATE', order: 'ASCENDING' }],
          },
        },
        {
          headers: {
            Authorization: `Bearer ${credentials.accessToken}`,
          },
        }
      );

      // Parse response (simplified - actual API returns paginated data)
      const rows: AdMobReportRow[] = [];
      if (response.data && response.data.rows) {
        for (const row of response.data.rows) {
          rows.push({
            date: this.formatAdMobDate(row.dimensionValues.DATE),
            adUnitId: row.dimensionValues.AD_UNIT.value,
            adUnitName: row.dimensionValues.AD_UNIT.displayLabel || '',
            impressions: parseInt(row.metricValues.IMPRESSIONS.integerValue || '0'),
            clicks: parseInt(row.metricValues.CLICKS.integerValue || '0'),
            earnings: parseFloat(row.metricValues.ESTIMATED_EARNINGS.microsValue || '0') / 1_000_000, // AdMob returns micros
            currency: 'USD',
          });
        }
      }

      logger.info('AdMob API fetch successful', { rowCount: rows.length });
      return rows;
    } catch (error: any) {
      logger.error('AdMob API fetch failed', {
        error: error.message,
        status: error.response?.status,
        data: error.response?.data,
      });
      throw new Error(`AdMob API fetch failed: ${error.message}`);
    }
  }

  /**
   * Parse CSV report (for manual uploads)
   * Expected CSV format:
   * Date,Ad Unit ID,Ad Unit Name,Impressions,Clicks,Estimated Earnings
   * 2025-11-19,ca-app-pub-123~456,My Banner,1000,50,5.00
   */
  async parseCSVReport(csvContent: string): Promise<AdMobReportRow[]> {
    const rows: AdMobReportRow[] = [];
    const lines = csvContent.trim().split('\n');

    if (lines.length < 2) {
      throw new Error('CSV must have at least header and one data row');
    }

    // Skip header (line 0)
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const fields = this.parseCSVLine(line);
      if (fields.length < 6) {
        logger.warn('Skipping malformed CSV line', { lineNumber: i + 1, line });
        continue;
      }

      rows.push({
        date: fields[0], // YYYY-MM-DD
        adUnitId: fields[1],
        adUnitName: fields[2],
        impressions: parseInt(fields[3]) || 0,
        clicks: parseInt(fields[4]) || 0,
        earnings: parseFloat(fields[5]) || 0,
        currency: 'USD',
      });
    }

    logger.info('CSV parse successful', { rowCount: rows.length });
    return rows;
  }

  /**
   * Ingest report rows into revenue_events table
   * Maps ad unit IDs to placements, handles duplicates
   */
  async ingestReport(
    publisherId: string,
    rows: AdMobReportRow[]
  ): Promise<IngestionResult> {
    const client = await this.pool.connect();
    const errors: string[] = [];
    let rowsInserted = 0;
    let rowsSkipped = 0;

    try {
      await client.query('BEGIN');

      // Get AdMob adapter ID
      const adapterResult = await client.query(
        `SELECT id FROM adapters WHERE name = 'admob' LIMIT 1`
      );
      if (adapterResult.rows.length === 0) {
        throw new Error('AdMob adapter not found in database');
      }
      const adapterId = adapterResult.rows[0].id;

      // Fetch all placement bindings for this publisher
      // Uses placement config JSONB to map ad unit IDs to placements
      const bindingsResult = await client.query<{
        placement_id: string;
        ad_unit_id: string;
        publisher_id: string;
        adapter_id: string;
      }>(
        `SELECT p.id as placement_id, 
                p.config->>'adUnitId' as ad_unit_id, 
                a.publisher_id, 
                $2 as adapter_id
         FROM placements p
         JOIN apps a ON a.id = p.app_id
         WHERE a.publisher_id = $1 
           AND p.config->>'adUnitId' IS NOT NULL`,
        [publisherId, adapterId]
      );

      const bindingsMap = new Map<string, PlacementBinding>();
      for (const binding of bindingsResult.rows) {
        bindingsMap.set(binding.ad_unit_id, {
          placementId: binding.placement_id,
          adUnitId: binding.ad_unit_id,
          publisherId: binding.publisher_id,
          adapterId: binding.adapter_id,
        });
      }

      logger.info('Loaded placement bindings', {
        publisherId,
        bindingCount: bindingsMap.size,
      });

      // Process each row
      for (const row of rows) {
        try {
          const binding = bindingsMap.get(row.adUnitId);
          if (!binding) {
            errors.push(
              `Ad unit ${row.adUnitId} not mapped to any placement for publisher ${publisherId}`
            );
            rowsSkipped++;
            continue;
          }

          // Check for duplicate (date + placement + adapter)
          const duplicateCheck = await client.query(
            `SELECT id FROM revenue_events 
             WHERE publisher_id = $1 
             AND placement_id = $2 
             AND adapter_id = $3 
             AND event_date = $4`,
            [publisherId, binding.placementId, adapterId, row.date]
          );

          if (duplicateCheck.rows.length > 0) {
            logger.debug('Duplicate revenue event, skipping', {
              date: row.date,
              adUnitId: row.adUnitId,
            });
            rowsSkipped++;
            continue;
          }

          // Insert revenue event
          await client.query(
            `INSERT INTO revenue_events 
             (publisher_id, placement_id, adapter_id, impressions, clicks, revenue, event_date)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [
              publisherId,
              binding.placementId,
              adapterId,
              row.impressions,
              row.clicks,
              row.earnings,
              row.date,
            ]
          );

          rowsInserted++;
        } catch (rowError: any) {
          errors.push(
            `Error processing row (date=${row.date}, adUnit=${row.adUnitId}): ${rowError.message}`
          );
          rowsSkipped++;
        }
      }

      await client.query('COMMIT');

      const startDate = rows.length > 0 ? rows[0].date : '';
      const endDate = rows.length > 0 ? rows[rows.length - 1].date : '';

      logger.info('AdMob report ingestion complete', {
        publisherId,
        rowsProcessed: rows.length,
        rowsInserted,
        rowsSkipped,
        errorCount: errors.length,
      });

      return {
        success: errors.length === 0 || rowsInserted > 0,
        rowsProcessed: rows.length,
        rowsInserted,
        rowsSkipped,
        errors,
        startDate,
        endDate,
      };
    } catch (error: any) {
      await client.query('ROLLBACK');
      logger.error('AdMob report ingestion failed', { error: error.message });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Full ingestion workflow: fetch from API and ingest
   */
  async ingestFromAPI(
    publisherId: string,
    credentials: AdMobCredentials,
    startDate: string,
    endDate: string
  ): Promise<IngestionResult> {
    const rows = await this.fetchReportFromAPI(credentials, startDate, endDate);
    return await this.ingestReport(publisherId, rows);
  }

  /**
   * Full ingestion workflow: parse CSV and ingest
   */
  async ingestFromCSV(
    publisherId: string,
    csvContent: string
  ): Promise<IngestionResult> {
    const rows = await this.parseCSVReport(csvContent);
    return await this.ingestReport(publisherId, rows);
  }

  // --- Helper methods ---

  private formatAdMobDate(dateObj: any): string {
    // AdMob API returns {year: 2025, month: 11, day: 19}
    const year = dateObj.year;
    const month = String(dateObj.month).padStart(2, '0');
    const day = String(dateObj.day).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private parseCSVLine(line: string): string[] {
    // Simple CSV parser (doesn't handle quoted commas - production would use csv-parse)
    return line.split(',').map((field) => field.trim());
  }
}

/**
 * Factory function for easy instantiation
 */
export const createAdMobReportIngestionService = (pool: Pool): AdMobReportIngestionService => {
  return new AdMobReportIngestionService(pool);
};
