/**
 * Unity Ads Report Ingestion Service Tests
 * 
 * Comprehensive unit tests for Unity report fetching, pagination, and ingestion.
 * Tests cover API integration, pagination handling, placement mapping, duplicate handling,
 * and error scenarios.
 */

import { Pool, PoolClient } from 'pg';
import {
  UnityReportIngestionService,
  UnityCredentials,
  UnityReportRow,
  IngestionResult,
} from '../unityReportIngestionService';
import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('UnityReportIngestionService', () => {
  let service: UnityReportIngestionService;
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

    service = new UnityReportIngestionService(mockPool);

    // Mock axios.create
    mockedAxios.create = jest.fn().mockReturnValue({
      get: jest.fn(),
    } as any);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('fetchReportFromAPI', () => {
    it('should fetch report from Unity API successfully', async () => {
      const credentials: UnityCredentials = {
        organizationId: 'org-12345',
        projectId: 'proj-67890',
        apiKey: 'unity_api_key_base64',
      };

      const mockResponse = {
        data: {
          results: [
            {
              date: '2025-11-19',
              placement_id: 'unity-placement-123',
              placement_name: 'Test Rewarded Video',
              impressions: '2000',
              clicks: '100',
              revenue: '15.50',
            },
            {
              date: '2025-11-20',
              placement_id: 'unity-placement-456',
              placement_name: 'Test Interstitial',
              impressions: '1500',
              clicks: '75',
              revenue: '12.25',
            },
          ],
        },
      };

      const mockAxiosInstance = {
        get: jest.fn().mockResolvedValue(mockResponse),
      };
      mockedAxios.create = jest.fn().mockReturnValue(mockAxiosInstance as any);
      service = new UnityReportIngestionService(mockPool);

      const result = await service.fetchReportFromAPI(
        credentials,
        '2025-11-19',
        '2025-11-20'
      );

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        date: '2025-11-19',
        placementId: 'unity-placement-123',
        placementName: 'Test Rewarded Video',
        impressions: 2000,
        clicks: 100,
        revenue: 15.5,
        currency: 'USD',
      });
      expect(result[1]).toEqual({
        date: '2025-11-20',
        placementId: 'unity-placement-456',
        placementName: 'Test Interstitial',
        impressions: 1500,
        clicks: 75,
        revenue: 12.25,
        currency: 'USD',
      });

      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/monetization/v1/organizations/org-12345/projects/proj-67890/statistics',
        expect.objectContaining({
          params: expect.objectContaining({
            start: '2025-11-19',
            end: '2025-11-20',
            granularity: 'day',
          }),
          headers: {
            Authorization: 'Basic unity_api_key_base64',
          },
        })
      );
    });

    it('should handle API errors gracefully', async () => {
      const credentials: UnityCredentials = {
        organizationId: 'org-12345',
        projectId: 'proj-67890',
        apiKey: 'invalid_key',
      };

      const mockAxiosInstance = {
        get: jest.fn().mockRejectedValue({
          message: 'Unauthorized',
          response: { status: 401, data: { error: 'Invalid API key' } },
        }),
      };
      mockedAxios.create = jest.fn().mockReturnValue(mockAxiosInstance as any);
      service = new UnityReportIngestionService(mockPool);

      await expect(
        service.fetchReportFromAPI(credentials, '2025-11-19', '2025-11-20')
      ).rejects.toThrow('Unity Ads API fetch failed: Unauthorized');
    });

    it('should handle empty report response', async () => {
      const credentials: UnityCredentials = {
        organizationId: 'org-12345',
        projectId: 'proj-67890',
        apiKey: 'unity_api_key_base64',
      };

      const mockResponse = {
        data: {
          results: [],
        },
      };

      const mockAxiosInstance = {
        get: jest.fn().mockResolvedValue(mockResponse),
      };
      mockedAxios.create = jest.fn().mockReturnValue(mockAxiosInstance as any);
      service = new UnityReportIngestionService(mockPool);

      const result = await service.fetchReportFromAPI(
        credentials,
        '2025-11-19',
        '2025-11-20'
      );

      expect(result).toHaveLength(0);
    });
  });

  describe('fetchReportWithPagination', () => {
    it('should fetch multiple pages successfully', async () => {
      const credentials: UnityCredentials = {
        organizationId: 'org-12345',
        projectId: 'proj-67890',
        apiKey: 'unity_api_key_base64',
      };

      const mockPage1 = {
        data: {
          results: [
            {
              date: '2025-11-19',
              placement_id: 'unity-placement-123',
              placement_name: 'Page 1 Placement',
              impressions: '1000',
              clicks: '50',
              revenue: '10.00',
            },
          ],
          has_more: true,
        },
      };

      const mockPage2 = {
        data: {
          results: [
            {
              date: '2025-11-20',
              placement_id: 'unity-placement-456',
              placement_name: 'Page 2 Placement',
              impressions: '2000',
              clicks: '100',
              revenue: '20.00',
            },
          ],
          has_more: false,
        },
      };

      const mockAxiosInstance = {
        get: jest
          .fn()
          .mockResolvedValueOnce(mockPage1)
          .mockResolvedValueOnce(mockPage2),
      };
      mockedAxios.create = jest.fn().mockReturnValue(mockAxiosInstance as any);
      service = new UnityReportIngestionService(mockPool);

      const result = await service.fetchReportWithPagination(
        credentials,
        '2025-11-19',
        '2025-11-20'
      );

      expect(result).toHaveLength(2);
      expect(result[0].placementId).toBe('unity-placement-123');
      expect(result[1].placementId).toBe('unity-placement-456');
      expect(mockAxiosInstance.get).toHaveBeenCalledTimes(2);
    });

    it('should handle pagination errors', async () => {
      const credentials: UnityCredentials = {
        organizationId: 'org-12345',
        projectId: 'proj-67890',
        apiKey: 'unity_api_key_base64',
      };

      const error = new Error('Network error');
      (error as any).response = { status: 500 };

      const mockAxiosInstance = {
        get: jest.fn().mockRejectedValue(error),
      };
      mockedAxios.create = jest.fn().mockReturnValue(mockAxiosInstance as any);
      service = new UnityReportIngestionService(mockPool);

      await expect(
        service.fetchReportWithPagination(credentials, '2025-11-19', '2025-11-20')
      ).rejects.toThrow('Network error');
    });
  });

  describe('ingestReport', () => {
    const publisherId = 'pub-uuid-1234';
    const adapterId = 'adapter-uuid-unity';

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
                unity_placement_id: 'unity-placement-123',
                publisher_id: publisherId,
                adapter_id: adapterId,
              },
              {
                placement_id: 'placement-uuid-2',
                unity_placement_id: 'unity-placement-456',
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
      const rows: UnityReportRow[] = [
        {
          date: '2025-11-19',
          placementId: 'unity-placement-123',
          placementName: 'Test Rewarded',
          impressions: 2000,
          clicks: 100,
          revenue: 15.5,
          currency: 'USD',
        },
        {
          date: '2025-11-20',
          placementId: 'unity-placement-456',
          placementName: 'Test Interstitial',
          impressions: 1500,
          clicks: 75,
          revenue: 12.25,
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

    it('should skip rows with unmapped Unity placements', async () => {
      const rows: UnityReportRow[] = [
        {
          date: '2025-11-19',
          placementId: 'unity-placement-123',
          placementName: 'Mapped Placement',
          impressions: 2000,
          clicks: 100,
          revenue: 15.5,
          currency: 'USD',
        },
        {
          date: '2025-11-20',
          placementId: 'unity-placement-unmapped',
          placementName: 'Unmapped Placement',
          impressions: 1500,
          clicks: 75,
          revenue: 12.25,
          currency: 'USD',
        },
      ];

      const result = await service.ingestReport(publisherId, rows);

      expect(result.rowsProcessed).toBe(2);
      expect(result.rowsInserted).toBe(1);
      expect(result.rowsSkipped).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('unity-placement-unmapped');
      expect(result.errors[0]).toContain('not mapped to any Apex placement');
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
                unity_placement_id: 'unity-placement-123',
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

      const rows: UnityReportRow[] = [
        {
          date: '2025-11-19',
          placementId: 'unity-placement-123',
          placementName: 'Test Rewarded',
          impressions: 2000,
          clicks: 100,
          revenue: 15.5,
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

      const rows: UnityReportRow[] = [
        {
          date: '2025-11-19',
          placementId: 'unity-placement-123',
          placementName: 'Test Rewarded',
          impressions: 2000,
          clicks: 100,
          revenue: 15.5,
          currency: 'USD',
        },
      ];

      await expect(service.ingestReport(publisherId, rows)).rejects.toThrow(
        'Database connection failed'
      );

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should handle missing Unity adapter gracefully', async () => {
      mockClient.query.mockImplementation((sql: string) => {
        if (sql === 'BEGIN' || sql === 'ROLLBACK') {
          return Promise.resolve();
        }
        if (sql.includes('SELECT id FROM adapters')) {
          return Promise.resolve({ rows: [] }); // No adapter found
        }
        return Promise.resolve({ rows: [] });
      });

      const rows: UnityReportRow[] = [
        {
          date: '2025-11-19',
          placementId: 'unity-placement-123',
          placementName: 'Test Rewarded',
          impressions: 2000,
          clicks: 100,
          revenue: 15.5,
          currency: 'USD',
        },
      ];

      await expect(service.ingestReport(publisherId, rows)).rejects.toThrow(
        'Unity adapter not found in database'
      );
    });
  });

  describe('ingestFromAPI', () => {
    it('should fetch and ingest report in one workflow', async () => {
      const publisherId = 'pub-uuid-1234';
      const credentials: UnityCredentials = {
        organizationId: 'org-12345',
        projectId: 'proj-67890',
        apiKey: 'unity_api_key_base64',
      };

      const mockResponse = {
        data: {
          results: [
            {
              date: '2025-11-19',
              placement_id: 'unity-placement-123',
              placement_name: 'Test Rewarded',
              impressions: '2000',
              clicks: '100',
              revenue: '15.50',
            },
          ],
        },
      };

      const mockAxiosInstance = {
        get: jest.fn().mockResolvedValue(mockResponse),
      };
      mockedAxios.create = jest.fn().mockReturnValue(mockAxiosInstance as any);
      service = new UnityReportIngestionService(mockPool);

      // Mock database calls
      mockClient.query.mockImplementation((sql: string) => {
        if (sql === 'BEGIN' || sql === 'COMMIT') {
          return Promise.resolve();
        }
        if (sql.includes('SELECT id FROM adapters')) {
          return Promise.resolve({ rows: [{ id: 'adapter-uuid-unity' }] });
        }
        if (sql.includes('SELECT p.id as placement_id')) {
          return Promise.resolve({
            rows: [
              {
                placement_id: 'placement-uuid-1',
                unity_placement_id: 'unity-placement-123',
                publisher_id: publisherId,
                adapter_id: 'adapter-uuid-unity',
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

  describe('ingestFromAPIWithPagination', () => {
    it('should fetch paginated report and ingest', async () => {
      const publisherId = 'pub-uuid-1234';
      const credentials: UnityCredentials = {
        organizationId: 'org-12345',
        projectId: 'proj-67890',
        apiKey: 'unity_api_key_base64',
      };

      const mockPage1 = {
        data: {
          results: [
            {
              date: '2025-11-19',
              placement_id: 'unity-placement-123',
              placement_name: 'Page 1',
              impressions: '1000',
              clicks: '50',
              revenue: '10.00',
            },
          ],
          has_more: true,
        },
      };

      const mockPage2 = {
        data: {
          results: [
            {
              date: '2025-11-20',
              placement_id: 'unity-placement-123',
              placement_name: 'Page 2',
              impressions: '2000',
              clicks: '100',
              revenue: '20.00',
            },
          ],
          has_more: false,
        },
      };

      const mockAxiosInstance = {
        get: jest
          .fn()
          .mockResolvedValueOnce(mockPage1)
          .mockResolvedValueOnce(mockPage2),
      };
      mockedAxios.create = jest.fn().mockReturnValue(mockAxiosInstance as any);
      service = new UnityReportIngestionService(mockPool);

      // Mock database calls
      mockClient.query.mockImplementation((sql: string) => {
        if (sql === 'BEGIN' || sql === 'COMMIT') {
          return Promise.resolve();
        }
        if (sql.includes('SELECT id FROM adapters')) {
          return Promise.resolve({ rows: [{ id: 'adapter-uuid-unity' }] });
        }
        if (sql.includes('SELECT p.id as placement_id')) {
          return Promise.resolve({
            rows: [
              {
                placement_id: 'placement-uuid-1',
                unity_placement_id: 'unity-placement-123',
                publisher_id: publisherId,
                adapter_id: 'adapter-uuid-unity',
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

      const result = await service.ingestFromAPIWithPagination(
        publisherId,
        credentials,
        '2025-11-19',
        '2025-11-20'
      );

      expect(result.success).toBe(true);
      expect(result.rowsInserted).toBe(2); // Both pages ingested
    });
  });
});
