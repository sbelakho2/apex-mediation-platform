import { QueryResult, QueryResultRow } from 'pg';
import * as adapterConfigRepository from '../adapterConfigRepository';
import * as postgres from '../../utils/postgres';

jest.mock('../../utils/postgres');

const mockQuery = jest.mocked(postgres.query);

const createQueryResult = <T extends QueryResultRow>(rows: T[]): QueryResult<T> => ({
  rows,
  command: 'SELECT',
  rowCount: rows.length,
  oid: 0,
  fields: [],
});

describe('adapterConfigRepository', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const mockPublisherId = '11111111-1111-1111-1111-111111111111';
  const mockAdapterId = '22222222-2222-2222-2222-222222222222';
  const mockConfigId = '33333333-3333-3333-3333-333333333333';
  const mockConfig = { appId: 'test-app-id', apiKey: 'test-key' };
  const mockTimestamp = new Date('2025-01-01T00:00:00Z');

  describe('findByPublisherId', () => {
    it('should return all adapter configs for a publisher', async () => {
      const mockConfigs = [
        {
          id: mockConfigId,
          publisher_id: mockPublisherId,
          adapter_id: mockAdapterId,
          config: mockConfig,
          updated_at: mockTimestamp,
          adapter_name: 'Test Adapter',
          adapter_enabled: true,
        },
      ];

      mockQuery.mockResolvedValue(createQueryResult(mockConfigs));

      const result = await adapterConfigRepository.findByPublisherId(mockPublisherId);

      expect(result).toEqual(mockConfigs);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('FROM adapter_configs ac'),
        [mockPublisherId]
      );
    });

    it('should return empty array when no configs found', async () => {
      mockQuery.mockResolvedValue(createQueryResult([]));

      const result = await adapterConfigRepository.findByPublisherId(mockPublisherId);

      expect(result).toEqual([]);
    });
  });

  describe('findById', () => {
    it('should return adapter config by ID and publisher', async () => {
      const mockConfig = {
        id: mockConfigId,
        publisher_id: mockPublisherId,
        adapter_id: mockAdapterId,
        config: { appId: 'test' },
        updated_at: mockTimestamp,
        adapter_name: 'Test Adapter',
        adapter_enabled: true,
      };

      mockQuery.mockResolvedValue(createQueryResult([mockConfig]));

      const result = await adapterConfigRepository.findById(mockConfigId, mockPublisherId);

      expect(result).toEqual(mockConfig);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE ac.id = $1 AND ac.publisher_id = $2'),
        [mockConfigId, mockPublisherId]
      );
    });

    it('should return null when config not found', async () => {
      mockQuery.mockResolvedValue(createQueryResult([]));

      const result = await adapterConfigRepository.findById(mockConfigId, mockPublisherId);

      expect(result).toBeNull();
    });
  });

  describe('findByPublisherAndAdapter', () => {
    it('should return config for specific publisher and adapter', async () => {
      const mockConfigData = {
        id: mockConfigId,
        publisher_id: mockPublisherId,
        adapter_id: mockAdapterId,
        config: mockConfig,
        updated_at: mockTimestamp,
        adapter_name: 'Test Adapter',
        adapter_enabled: true,
      };

      mockQuery.mockResolvedValue(createQueryResult([mockConfigData]));

      const result = await adapterConfigRepository.findByPublisherAndAdapter(
        mockPublisherId,
        mockAdapterId
      );

      expect(result).toEqual(mockConfigData);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE ac.publisher_id = $1 AND ac.adapter_id = $2'),
        [mockPublisherId, mockAdapterId]
      );
    });

    it('should return null when no matching config found', async () => {
      mockQuery.mockResolvedValue(createQueryResult([]));

      const result = await adapterConfigRepository.findByPublisherAndAdapter(
        mockPublisherId,
        mockAdapterId
      );

      expect(result).toBeNull();
    });
  });

  describe('create', () => {
    it('should create a new adapter config', async () => {
      const input = {
        publisher_id: mockPublisherId,
        adapter_id: mockAdapterId,
        config: mockConfig,
      };

      const mockCreated = {
        id: mockConfigId,
        publisher_id: mockPublisherId,
        adapter_id: mockAdapterId,
        config: mockConfig,
        updated_at: mockTimestamp,
      };

      mockQuery.mockResolvedValue(createQueryResult([mockCreated]));

      const result = await adapterConfigRepository.create(input);

      expect(result).toEqual(mockCreated);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO adapter_configs'),
        [mockPublisherId, mockAdapterId, JSON.stringify(mockConfig)]
      );
    });
  });

  describe('update', () => {
    it('should update an existing adapter config', async () => {
      const updatedConfig = { appId: 'updated-id' };
      const mockUpdated = {
        id: mockConfigId,
        publisher_id: mockPublisherId,
        adapter_id: mockAdapterId,
        config: updatedConfig,
        updated_at: mockTimestamp,
      };

      mockQuery.mockResolvedValue(createQueryResult([mockUpdated]));

      const result = await adapterConfigRepository.update(mockConfigId, mockPublisherId, {
        config: updatedConfig,
      });

      expect(result).toEqual(mockUpdated);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE adapter_configs'),
        [JSON.stringify(updatedConfig), mockConfigId, mockPublisherId]
      );
    });

    it('should return null when config not found', async () => {
      mockQuery.mockResolvedValue(createQueryResult([]));

      const result = await adapterConfigRepository.update(mockConfigId, mockPublisherId, {
        config: { appId: 'test' },
      });

      expect(result).toBeNull();
    });
  });

  describe('deleteById', () => {
    it('should delete an adapter config and return true', async () => {
      mockQuery.mockResolvedValue({ rowCount: 1 } as QueryResult);

      const result = await adapterConfigRepository.deleteById(mockConfigId, mockPublisherId);

      expect(result).toBe(true);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM adapter_configs'),
        [mockConfigId, mockPublisherId]
      );
    });

    it('should return false when config not found', async () => {
      mockQuery.mockResolvedValue({ rowCount: 0 } as QueryResult);

      const result = await adapterConfigRepository.deleteById(mockConfigId, mockPublisherId);

      expect(result).toBe(false);
    });

    it('should return false when rowCount is null', async () => {
      mockQuery.mockResolvedValue({ rowCount: null } as QueryResult);

      const result = await adapterConfigRepository.deleteById(mockConfigId, mockPublisherId);

      expect(result).toBe(false);
    });
  });
});
