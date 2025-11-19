/**
 * Unity Ads Report Ingestion Service
 * 
 * Fetches revenue reports from Unity Ads Monetization API and ingests them into revenue_events table.
 * Unity provides an operational API with statistics endpoints for BYO model.
 * 
 * Key features:
 * - Unity Monetization Stats API v1 integration
 * - Placement ID mapping via Unity placement IDs
 * - Revenue normalization to USD
 * - Duplicate detection and idempotency
 * - Pagination handling for large reports
 * - Error handling with detailed diagnostics
 */

import axios, { AxiosInstance } from 'axios';
import { Pool } from 'pg';
import { logger } from '../utils/logger';

export interface UnityCredentials {
  organizationId: string;
  projectId: string;
  apiKey: string; // Unity API key from credential vault
}

export interface UnityReportRow {
  date: string; // YYYY-MM-DD
  placementId: string; // Unity placement ID
  placementName: string;
  impressions: number;
  clicks: number;
  revenue: number; // In USD
  currency: string; // Always USD for Unity
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
  unityPlacementId: string;
  publisherId: string;
  adapterId: string;
}

export class UnityReportIngestionService {
  private httpClient: AxiosInstance;
  private pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
    this.httpClient = axios.create({
      baseURL: 'https://services.api.unity.com',
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * Fetch report from Unity Monetization Stats API
   * Uses the Statistics API to get daily revenue data
   */
  async fetchReportFromAPI(
    credentials: UnityCredentials,
    startDate: string, // YYYY-MM-DD
    endDate: string // YYYY-MM-DD
  ): Promise<UnityReportRow[]> {
    try {
      logger.info('Fetching Unity Ads report from API', {
        organizationId: credentials.organizationId,
        projectId: credentials.projectId,
        startDate,
        endDate,
      });

      // Unity Monetization Stats API endpoint
      const response = await this.httpClient.get(
        `/monetization/v1/organizations/${credentials.organizationId}/projects/${credentials.projectId}/statistics`,
        {
          params: {
            start: startDate,
            end: endDate,
            granularity: 'day',
            fields: 'placement_id,placement_name,impressions,clicks,revenue',
          },
          headers: {
            Authorization: `Basic ${credentials.apiKey}`,
          },
        }
      );

      // Parse response
      const rows: UnityReportRow[] = [];
      if (response.data && response.data.results) {
        for (const result of response.data.results) {
          rows.push({
            date: result.date, // YYYY-MM-DD
            placementId: result.placement_id,
            placementName: result.placement_name || '',
            impressions: parseInt(result.impressions || '0'),
            clicks: parseInt(result.clicks || '0'),
            revenue: parseFloat(result.revenue || '0'),
            currency: 'USD',
          });
        }
      }

      logger.info('Unity Ads API fetch successful', { rowCount: rows.length });
      return rows;
    } catch (error: any) {
      logger.error('Unity Ads API fetch failed', {
        error: error.message,
        status: error.response?.status,
        data: error.response?.data,
      });
      throw new Error(`Unity Ads API fetch failed: ${error.message}`);
    }
  }

  /**
   * Fetch report with pagination support
   * Unity API may paginate results for large date ranges
   */
  async fetchReportWithPagination(
    credentials: UnityCredentials,
    startDate: string,
    endDate: string
  ): Promise<UnityReportRow[]> {
    const allRows: UnityReportRow[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      try {
        logger.info('Fetching Unity Ads report page', { page });

        const response = await this.httpClient.get(
          `/monetization/v1/organizations/${credentials.organizationId}/projects/${credentials.projectId}/statistics`,
          {
            params: {
              start: startDate,
              end: endDate,
              granularity: 'day',
              fields: 'placement_id,placement_name,impressions,clicks,revenue',
              page,
              limit: 100, // Max results per page
            },
            headers: {
              Authorization: `Basic ${credentials.apiKey}`,
            },
          }
        );

        if (response.data && response.data.results) {
          for (const result of response.data.results) {
            allRows.push({
              date: result.date,
              placementId: result.placement_id,
              placementName: result.placement_name || '',
              impressions: parseInt(result.impressions || '0'),
              clicks: parseInt(result.clicks || '0'),
              revenue: parseFloat(result.revenue || '0'),
              currency: 'USD',
            });
          }

          // Check if there are more pages
          hasMore = response.data.has_more === true;
          page++;
        } else {
          hasMore = false;
        }
      } catch (error: any) {
        logger.error('Unity Ads pagination fetch failed', {
          page,
          error: error.message,
        });
        throw error;
      }
    }

    logger.info('Unity Ads pagination fetch complete', {
      totalRows: allRows.length,
      pages: page - 1,
    });
    return allRows;
  }

  /**
   * Ingest report rows into revenue_events table
   * Maps Unity placement IDs to Apex placements, handles duplicates
   */
  async ingestReport(
    publisherId: string,
    rows: UnityReportRow[]
  ): Promise<IngestionResult> {
    const client = await this.pool.connect();
    const errors: string[] = [];
    let rowsInserted = 0;
    let rowsSkipped = 0;

    try {
      await client.query('BEGIN');

      // Get Unity adapter ID
      const adapterResult = await client.query(
        `SELECT id FROM adapters WHERE name = 'unity' LIMIT 1`
      );
      if (adapterResult.rows.length === 0) {
        throw new Error('Unity adapter not found in database');
      }
      const adapterId = adapterResult.rows[0].id;

      // Fetch all placement bindings for this publisher
      // Uses placement config JSONB to map Unity placement IDs
      const bindingsResult = await client.query<{
        placement_id: string;
        unity_placement_id: string;
        publisher_id: string;
        adapter_id: string;
      }>(
        `SELECT p.id as placement_id, 
                p.config->>'unityPlacementId' as unity_placement_id, 
                a.publisher_id, 
                $2 as adapter_id
         FROM placements p
         JOIN apps a ON a.id = p.app_id
         WHERE a.publisher_id = $1 
           AND p.config->>'unityPlacementId' IS NOT NULL`,
        [publisherId, adapterId]
      );

      const bindingsMap = new Map<string, PlacementBinding>();
      for (const binding of bindingsResult.rows) {
        bindingsMap.set(binding.unity_placement_id, {
          placementId: binding.placement_id,
          unityPlacementId: binding.unity_placement_id,
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
          const binding = bindingsMap.get(row.placementId);
          if (!binding) {
            errors.push(
              `Unity placement ${row.placementId} not mapped to any Apex placement for publisher ${publisherId}`
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
              unityPlacementId: row.placementId,
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
              row.revenue,
              row.date,
            ]
          );

          rowsInserted++;
        } catch (rowError: any) {
          errors.push(
            `Error processing row (date=${row.date}, unityPlacement=${row.placementId}): ${rowError.message}`
          );
          rowsSkipped++;
        }
      }

      await client.query('COMMIT');

      const startDate = rows.length > 0 ? rows[0].date : '';
      const endDate = rows.length > 0 ? rows[rows.length - 1].date : '';

      logger.info('Unity Ads report ingestion complete', {
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
      logger.error('Unity Ads report ingestion failed', { error: error.message });
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
    credentials: UnityCredentials,
    startDate: string,
    endDate: string
  ): Promise<IngestionResult> {
    const rows = await this.fetchReportFromAPI(credentials, startDate, endDate);
    return await this.ingestReport(publisherId, rows);
  }

  /**
   * Full ingestion workflow with pagination: fetch from API with pagination and ingest
   */
  async ingestFromAPIWithPagination(
    publisherId: string,
    credentials: UnityCredentials,
    startDate: string,
    endDate: string
  ): Promise<IngestionResult> {
    const rows = await this.fetchReportWithPagination(credentials, startDate, endDate);
    return await this.ingestReport(publisherId, rows);
  }
}

/**
 * Factory function for easy instantiation
 */
export const createUnityReportIngestionService = (pool: Pool): UnityReportIngestionService => {
  return new UnityReportIngestionService(pool);
};
