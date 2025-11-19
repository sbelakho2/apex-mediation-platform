/**
 * AdMob Report Ingestion Service Tests
 * 
 * Comprehensive unit tests for AdMob report fetching, parsing, and ingestion.
 * Tests cover API integration, CSV parsing, placement mapping, duplicate handling,
 * and error scenarios.
 */

import { Pool, PoolClient } from 'pg';
import {
  AdMobReportIngestionService,
  AdMobCredentials,
  AdMobReportRow,
  IngestionResult,
} from '../admobReportIngestionService';
import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('AdMobReportIngestionService', () => {
  let service: AdMobReportIngestionService;
  let mockPool: any;
  let mockClient: any;

  beforeEach(() => {
    // Mock pool and client
    mockClient = {
      query: jest.fn(),
      release: jest.fn(),
    };

    mockPool = {
      connect: jest.fn().mockResolvedValue(mockClient),
      query: jest.fn(),
    } as any;

    service = new AdMobReportIngestionService(mockPool);

    // Mock axios.create
    mockedAxios.create = jest.fn().mockReturnValue({
      post: jest.fn(),
    } as any);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('fetchReportFromAPI', () => {
    it('should fetch report from AdMob API successfully', async () => {
      const credentials: AdMobCredentials = {
        accountId: 'pub-1234567890',
        accessToken: 'ya29.mock_token',
      };

      const mockResponse = {
        data: {
          rows: [
            {
              dimensionValues: {
                DATE: { year: 2025, month: 11, day: 19 },
                AD_UNIT: {
                  value: 'ca-app-pub-123~456',
                  displayLabel: 'Test Banner',
                },
              },
              metricValues: {
                IMPRESSIONS: { integerValue: '1000' },
                CLICKS: { integerValue: '50' },
                ESTIMATED_EARNINGS: { microsValue: '5000000' }, // $5.00
              },
            },
            {
              dimensionValues: {
                DATE: { year: 2025, month: 11, day: 20 },
                AD_UNIT: {
                  value: 'ca-app-pub-123~789',
                  displayLabel: 'Test Interstitial',
                },
              },
              metricValues: {
                IMPRESSIONS: { integerValue: '500' },
                CLICKS: { integerValue: '25' },
                ESTIMATED_EARNINGS: { microsValue: '7500000' }, // $7.50
              },
            },
          ],
        },
      };

      const mockAxiosInstance = {
        post: jest.fn().mockResolvedValue(mockResponse),
      };
      mockedAxios.create = jest.fn().mockReturnValue(mockAxiosInstance as any);
      service = new AdMobReportIngestionService(mockPool); // Recreate service with new mock

      const result = await service.fetchReportFromAPI(
        credentials,
        '2025-11-19',
        '2025-11-20'
      );

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        date: '2025-11-19',
        adUnitId: 'ca-app-pub-123~456',
        adUnitName: 'Test Banner',
        impressions: 1000,
        clicks: 50,
        earnings: 5.0,
        currency: 'USD',
      });
      expect(result[1]).toEqual({
        date: '2025-11-20',
        adUnitId: 'ca-app-pub-123~789',
        adUnitName: 'Test Interstitial',
        impressions: 500,
        clicks: 25,
        earnings: 7.5,
        currency: 'USD',
      });

      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/accounts/pub-1234567890/networkReport:generate',
        expect.objectContaining({
          reportSpec: expect.objectContaining({
            dateRange: expect.any(Object),
            dimensions: ['DATE', 'AD_UNIT'],
            metrics: ['IMPRESSIONS', 'CLICKS', 'ESTIMATED_EARNINGS'],
          }),
        }),
        expect.objectContaining({
          headers: {
            Authorization: 'Bearer ya29.mock_token',
          },
        })
      );
    });

    it('should handle API errors gracefully', async () => {
      const credentials: AdMobCredentials = {
        accountId: 'pub-1234567890',
        accessToken: 'invalid_token',
      };

      const mockAxiosInstance = {
        post: jest.fn().mockRejectedValue({
          message: 'Unauthorized',
          response: { status: 401, data: { error: 'Invalid token' } },
        }),
      };
      mockedAxios.create = jest.fn().mockReturnValue(mockAxiosInstance as any);
      service = new AdMobReportIngestionService(mockPool);

      await expect(
        service.fetchReportFromAPI(credentials, '2025-11-19', '2025-11-20')
      ).rejects.toThrow('AdMob API fetch failed: Unauthorized');
    });

    it('should handle empty report response', async () => {
      const credentials: AdMobCredentials = {
        accountId: 'pub-1234567890',
        accessToken: 'ya29.mock_token',
      };

      const mockResponse = {
        data: {
          rows: [],
        },
      };

      const mockAxiosInstance = {
        post: jest.fn().mockResolvedValue(mockResponse),
      };
      mockedAxios.create = jest.fn().mockReturnValue(mockAxiosInstance as any);
      service = new AdMobReportIngestionService(mockPool);

      const result = await service.fetchReportFromAPI(
        credentials,
        '2025-11-19',
        '2025-11-20'
      );

      expect(result).toHaveLength(0);
    });
  });

  describe('parseCSVReport', () => {
    it('should parse valid CSV report', async () => {
      const csvContent = `Date,Ad Unit ID,Ad Unit Name,Impressions,Clicks,Estimated Earnings
2025-11-19,ca-app-pub-123~456,Test Banner,1000,50,5.00
2025-11-20,ca-app-pub-123~789,Test Interstitial,500,25,7.50`;

      const result = await service.parseCSVReport(csvContent);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        date: '2025-11-19',
        adUnitId: 'ca-app-pub-123~456',
        adUnitName: 'Test Banner',
        impressions: 1000,
        clicks: 50,
        earnings: 5.0,
        currency: 'USD',
      });
      expect(result[1]).toEqual({
        date: '2025-11-20',
        adUnitId: 'ca-app-pub-123~789',
        adUnitName: 'Test Interstitial',
        impressions: 500,
        clicks: 25,
        earnings: 7.5,
        currency: 'USD',
      });
    });

    it('should skip malformed CSV lines', async () => {
      const csvContent = `Date,Ad Unit ID,Ad Unit Name,Impressions,Clicks,Estimated Earnings
2025-11-19,ca-app-pub-123~456,Test Banner,1000,50,5.00
2025-11-20,invalid
2025-11-21,ca-app-pub-123~789,Test Interstitial,500,25,7.50`;

      const result = await service.parseCSVReport(csvContent);

      expect(result).toHaveLength(2); // Only 2 valid rows
      expect(result[0].date).toBe('2025-11-19');
      expect(result[1].date).toBe('2025-11-21');
    });

    it('should handle CSV with missing values', async () => {
      const csvContent = `Date,Ad Unit ID,Ad Unit Name,Impressions,Clicks,Estimated Earnings
2025-11-19,ca-app-pub-123~456,Test Banner,,,`;

      const result = await service.parseCSVReport(csvContent);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        date: '2025-11-19',
        adUnitId: 'ca-app-pub-123~456',
        adUnitName: 'Test Banner',
        impressions: 0,
        clicks: 0,
        earnings: 0,
        currency: 'USD',
      });
    });

    it('should throw error for CSV with only header', async () => {
      const csvContent = `Date,Ad Unit ID,Ad Unit Name,Impressions,Clicks,Estimated Earnings`;

      await expect(service.parseCSVReport(csvContent)).rejects.toThrow(
        'CSV must have at least header and one data row'
      );
    });
  });

  describe('ingestReport', () => {
    const publisherId = 'pub-uuid-1234';
    const adapterId = 'adapter-uuid-admob';

    beforeEach(() => {
      // Default successful transaction flow
      mockClient.query.mockImplementation((sql: string) => {
        if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
          return Promise.resolve();
        }
        if (sql.includes('SELECT id FROM adapters')) {
          return Promise.resolve({ rows: [{ id: adapterId }] });
        }
        if (sql.includes('SELECT p.id as placement_id')) {
          return Promise.resolve({
            rows: [
              {
                placement_id: 'placement-uuid-1',
                ad_unit_id: 'ca-app-pub-123~456',
                publisher_id: publisherId,
                adapter_id: adapterId,
              },
              {
                placement_id: 'placement-uuid-2',
                ad_unit_id: 'ca-app-pub-123~789',
                publisher_id: publisherId,
                adapter_id: adapterId,
              },
            ],
          });
        }
        if (sql.includes('SELECT id FROM revenue_events')) {
          return Promise.resolve({ rows: [] }); // No duplicates
        }
        if (sql.includes('INSERT INTO revenue_events')) {
          return Promise.resolve({ rows: [] });
        }
        return Promise.resolve({ rows: [] });
      });
    });

    it('should ingest report rows successfully', async () => {
      const rows: AdMobReportRow[] = [
        {
          date: '2025-11-19',
          adUnitId: 'ca-app-pub-123~456',
          adUnitName: 'Test Banner',
          impressions: 1000,
          clicks: 50,
          earnings: 5.0,
          currency: 'USD',
        },
        {
          date: '2025-11-20',
          adUnitId: 'ca-app-pub-123~789',
          adUnitName: 'Test Interstitial',
          impressions: 500,
          clicks: 25,
          earnings: 7.5,
          currency: 'USD',
        },
      ];

      const result = await service.ingestReport(publisherId, rows);

      expect(result).toEqual({
        success: true,
        rowsProcessed: 2,
        rowsInserted: 2,
        rowsSkipped: 0,
        errors: [],
        startDate: '2025-11-19',
        endDate: '2025-11-20',
      });

      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should skip rows with unmapped ad units', async () => {
      const rows: AdMobReportRow[] = [
        {
          date: '2025-11-19',
          adUnitId: 'ca-app-pub-123~456',
          adUnitName: 'Mapped Banner',
          impressions: 1000,
          clicks: 50,
          earnings: 5.0,
          currency: 'USD',
        },
        {
          date: '2025-11-20',
          adUnitId: 'ca-app-pub-999~unmapped',
          adUnitName: 'Unmapped Banner',
          impressions: 500,
          clicks: 25,
          earnings: 7.5,
          currency: 'USD',
        },
      ];

      const result = await service.ingestReport(publisherId, rows);

      expect(result.rowsProcessed).toBe(2);
      expect(result.rowsInserted).toBe(1);
      expect(result.rowsSkipped).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('ca-app-pub-999~unmapped');
      expect(result.errors[0]).toContain('not mapped to any placement');
    });

    it('should skip duplicate revenue events', async () => {
      // Mock duplicate check to return existing row
      mockClient.query.mockImplementation((sql: string) => {
        if (sql === 'BEGIN' || sql === 'COMMIT') {
          return Promise.resolve();
        }
        if (sql.includes('SELECT id FROM adapters')) {
          return Promise.resolve({ rows: [{ id: adapterId }] });
        }
        if (sql.includes('SELECT p.id as placement_id')) {
          return Promise.resolve({
            rows: [
              {
                placement_id: 'placement-uuid-1',
                ad_unit_id: 'ca-app-pub-123~456',
                publisher_id: publisherId,
                adapter_id: adapterId,
              },
            ],
          });
        }
        if (sql.includes('SELECT id FROM revenue_events')) {
          return Promise.resolve({ rows: [{ id: '123' }] }); // Duplicate found
        }
        return Promise.resolve({ rows: [] });
      });

      const rows: AdMobReportRow[] = [
        {
          date: '2025-11-19',
          adUnitId: 'ca-app-pub-123~456',
          adUnitName: 'Test Banner',
          impressions: 1000,
          clicks: 50,
          earnings: 5.0,
          currency: 'USD',
        },
      ];

      const result = await service.ingestReport(publisherId, rows);

      expect(result.rowsProcessed).toBe(1);
      expect(result.rowsInserted).toBe(0);
      expect(result.rowsSkipped).toBe(1);
    });

    it('should rollback on database error', async () => {
      mockClient.query.mockImplementation((sql: string) => {
        if (sql === 'BEGIN') {
          return Promise.resolve();
        }
        if (sql === 'ROLLBACK') {
          return Promise.resolve();
        }
        if (sql.includes('SELECT id FROM adapters')) {
          throw new Error('Database connection failed');
        }
        return Promise.resolve({ rows: [] });
      });

      const rows: AdMobReportRow[] = [
        {
          date: '2025-11-19',
          adUnitId: 'ca-app-pub-123~456',
          adUnitName: 'Test Banner',
          impressions: 1000,
          clicks: 50,
          earnings: 5.0,
          currency: 'USD',
        },
      ];

      await expect(service.ingestReport(publisherId, rows)).rejects.toThrow(
        'Database connection failed'
      );

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should handle missing AdMob adapter gracefully', async () => {
      mockClient.query.mockImplementation((sql: string) => {
        if (sql === 'BEGIN' || sql === 'ROLLBACK') {
          return Promise.resolve();
        }
        if (sql.includes('SELECT id FROM adapters')) {
          return Promise.resolve({ rows: [] }); // No adapter found
        }
        return Promise.resolve({ rows: [] });
      });

      const rows: AdMobReportRow[] = [
        {
          date: '2025-11-19',
          adUnitId: 'ca-app-pub-123~456',
          adUnitName: 'Test Banner',
          impressions: 1000,
          clicks: 50,
          earnings: 5.0,
          currency: 'USD',
        },
      ];

      await expect(service.ingestReport(publisherId, rows)).rejects.toThrow(
        'AdMob adapter not found in database'
      );
    });
  });

  describe('ingestFromAPI', () => {
    it('should fetch and ingest report in one workflow', async () => {
      const publisherId = 'pub-uuid-1234';
      const credentials: AdMobCredentials = {
        accountId: 'pub-1234567890',
        accessToken: 'ya29.mock_token',
      };

      const mockResponse = {
        data: {
          rows: [
            {
              dimensionValues: {
                DATE: { year: 2025, month: 11, day: 19 },
                AD_UNIT: {
                  value: 'ca-app-pub-123~456',
                  displayLabel: 'Test Banner',
                },
              },
              metricValues: {
                IMPRESSIONS: { integerValue: '1000' },
                CLICKS: { integerValue: '50' },
                ESTIMATED_EARNINGS: { microsValue: '5000000' },
              },
            },
          ],
        },
      };

      const mockAxiosInstance = {
        post: jest.fn().mockResolvedValue(mockResponse),
      };
      mockedAxios.create = jest.fn().mockReturnValue(mockAxiosInstance as any);
      service = new AdMobReportIngestionService(mockPool);

      // Mock database calls
      mockClient.query.mockImplementation((sql: string) => {
        if (sql === 'BEGIN' || sql === 'COMMIT') {
          return Promise.resolve();
        }
        if (sql.includes('SELECT id FROM adapters')) {
          return Promise.resolve({ rows: [{ id: 'adapter-uuid-admob' }] });
        }
        if (sql.includes('SELECT p.id as placement_id')) {
          return Promise.resolve({
            rows: [
              {
                placement_id: 'placement-uuid-1',
                ad_unit_id: 'ca-app-pub-123~456',
                publisher_id: publisherId,
                adapter_id: 'adapter-uuid-admob',
              },
            ],
          });
        }
        if (sql.includes('SELECT id FROM revenue_events')) {
          return Promise.resolve({ rows: [] });
        }
        if (sql.includes('INSERT INTO revenue_events')) {
          return Promise.resolve({ rows: [] });
        }
        return Promise.resolve({ rows: [] });
      });

      const result = await service.ingestFromAPI(
        publisherId,
        credentials,
        '2025-11-19',
        '2025-11-20'
      );

      expect(result.success).toBe(true);
      expect(result.rowsInserted).toBe(1);
    });
  });

  describe('ingestFromCSV', () => {
    it('should parse CSV and ingest report in one workflow', async () => {
      const publisherId = 'pub-uuid-1234';
      const csvContent = `Date,Ad Unit ID,Ad Unit Name,Impressions,Clicks,Estimated Earnings
2025-11-19,ca-app-pub-123~456,Test Banner,1000,50,5.00`;

      // Mock database calls
      mockClient.query.mockImplementation((sql: string) => {
        if (sql === 'BEGIN' || sql === 'COMMIT') {
          return Promise.resolve();
        }
        if (sql.includes('SELECT id FROM adapters')) {
          return Promise.resolve({ rows: [{ id: 'adapter-uuid-admob' }] });
        }
        if (sql.includes('SELECT p.id as placement_id')) {
          return Promise.resolve({
            rows: [
              {
                placement_id: 'placement-uuid-1',
                ad_unit_id: 'ca-app-pub-123~456',
                publisher_id: publisherId,
                adapter_id: 'adapter-uuid-admob',
              },
            ],
          });
        }
        if (sql.includes('SELECT id FROM revenue_events')) {
          return Promise.resolve({ rows: [] });
        }
        if (sql.includes('INSERT INTO revenue_events')) {
          return Promise.resolve({ rows: [] });
        }
        return Promise.resolve({ rows: [] });
      });

      const result = await service.ingestFromCSV(publisherId, csvContent);

      expect(result.success).toBe(true);
      expect(result.rowsInserted).toBe(1);
    });
  });
});
