import * as adapterConfigService from '../adapterConfigService';
import * as adapterConfigRepository from '../../repositories/adapterConfigRepository';

jest.mock('../../repositories/adapterConfigRepository');

const mockFindByPublisherId = jest.mocked(adapterConfigRepository.findByPublisherId);
const mockFindById = jest.mocked(adapterConfigRepository.findById);
const mockFindByPublisherAndAdapter = jest.mocked(
  adapterConfigRepository.findByPublisherAndAdapter
);
const mockCreate = jest.mocked(adapterConfigRepository.create);
const mockUpdate = jest.mocked(adapterConfigRepository.update);
const mockDeleteById = jest.mocked(adapterConfigRepository.deleteById);

describe('adapterConfigService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const mockPublisherId = '11111111-1111-1111-1111-111111111111';
  const mockAdapterId = '22222222-2222-2222-2222-222222222222';
  const mockConfigId = '33333333-3333-3333-3333-333333333333';
  const mockConfig = { appId: 'test-app-id', apiKey: 'test-key' };
  const mockTimestamp = new Date('2025-01-01T00:00:00Z');

  describe('getAdapterConfigs', () => {
    it('should return formatted adapter configs for a publisher', async () => {
      const mockRepoConfigs = [
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

      mockFindByPublisherId.mockResolvedValue(mockRepoConfigs);

      const result = await adapterConfigService.getAdapterConfigs(mockPublisherId);

      expect(result).toEqual([
        {
          id: mockConfigId,
          adapterId: mockAdapterId,
          adapterName: 'Test Adapter',
          enabled: true,
          config: mockConfig,
          updatedAt: '2025-01-01T00:00:00.000Z',
        },
      ]);
      expect(mockFindByPublisherId).toHaveBeenCalledWith(mockPublisherId);
    });

    it('should return empty array when no configs found', async () => {
      mockFindByPublisherId.mockResolvedValue([]);

      const result = await adapterConfigService.getAdapterConfigs(mockPublisherId);

      expect(result).toEqual([]);
    });
  });

  describe('getAdapterConfigById', () => {
    it('should return formatted adapter config by ID', async () => {
      const mockRepoConfig = {
        id: mockConfigId,
        publisher_id: mockPublisherId,
        adapter_id: mockAdapterId,
        config: mockConfig,
        updated_at: mockTimestamp,
        adapter_name: 'Test Adapter',
        adapter_enabled: true,
      };

      mockFindById.mockResolvedValue(mockRepoConfig);

      const result = await adapterConfigService.getAdapterConfigById(
        mockConfigId,
        mockPublisherId
      );

      expect(result).toEqual({
        id: mockConfigId,
        adapterId: mockAdapterId,
        adapterName: 'Test Adapter',
        enabled: true,
        config: mockConfig,
        updatedAt: '2025-01-01T00:00:00.000Z',
      });
      expect(mockFindById).toHaveBeenCalledWith(mockConfigId, mockPublisherId);
    });

    it('should return null when config not found', async () => {
      mockFindById.mockResolvedValue(null);

      const result = await adapterConfigService.getAdapterConfigById(
        mockConfigId,
        mockPublisherId
      );

      expect(result).toBeNull();
    });
  });

  describe('createAdapterConfig', () => {
    it('should create a new adapter config', async () => {
      const request = {
        adapterId: mockAdapterId,
        config: mockConfig,
      };

      const mockCreated = {
        id: mockConfigId,
        publisher_id: mockPublisherId,
        adapter_id: mockAdapterId,
        config: mockConfig,
        updated_at: mockTimestamp,
      };

      const mockFullConfig = {
        ...mockCreated,
        adapter_name: 'Test Adapter',
        adapter_enabled: true,
      };

      mockFindByPublisherAndAdapter.mockResolvedValue(null);
      mockCreate.mockResolvedValue(mockCreated);
      mockFindById.mockResolvedValue(mockFullConfig);

      const result = await adapterConfigService.createAdapterConfig(mockPublisherId, request);

      expect(result).toEqual({
        id: mockConfigId,
        adapterId: mockAdapterId,
        adapterName: 'Test Adapter',
        enabled: true,
        config: mockConfig,
        updatedAt: '2025-01-01T00:00:00.000Z',
      });
      expect(mockFindByPublisherAndAdapter).toHaveBeenCalledWith(mockPublisherId, mockAdapterId);
      expect(mockCreate).toHaveBeenCalledWith({
        publisher_id: mockPublisherId,
        adapter_id: mockAdapterId,
        config: mockConfig,
      });
      expect(mockFindById).toHaveBeenCalledWith(mockConfigId, mockPublisherId);
    });

    it('should throw error when config already exists', async () => {
      const request = {
        adapterId: mockAdapterId,
        config: mockConfig,
      };

      const existingConfig = {
        id: mockConfigId,
        publisher_id: mockPublisherId,
        adapter_id: mockAdapterId,
        config: mockConfig,
        updated_at: mockTimestamp,
        adapter_name: 'Test Adapter',
        adapter_enabled: true,
      };

      mockFindByPublisherAndAdapter.mockResolvedValue(existingConfig);

      await expect(
        adapterConfigService.createAdapterConfig(mockPublisherId, request)
      ).rejects.toThrow('Adapter config already exists for this publisher');

      expect(mockCreate).not.toHaveBeenCalled();
    });

    it('should throw error when failed to retrieve created config', async () => {
      const request = {
        adapterId: mockAdapterId,
        config: mockConfig,
      };

      const mockCreated = {
        id: mockConfigId,
        publisher_id: mockPublisherId,
        adapter_id: mockAdapterId,
        config: mockConfig,
        updated_at: mockTimestamp,
      };

      mockFindByPublisherAndAdapter.mockResolvedValue(null);
      mockCreate.mockResolvedValue(mockCreated);
      mockFindById.mockResolvedValue(null);

      await expect(
        adapterConfigService.createAdapterConfig(mockPublisherId, request)
      ).rejects.toThrow('Failed to retrieve created adapter config');
    });
  });

  describe('updateAdapterConfig', () => {
    it('should update an existing adapter config', async () => {
      const request = {
        config: { appId: 'updated-id' },
      };

      const mockUpdated = {
        id: mockConfigId,
        publisher_id: mockPublisherId,
        adapter_id: mockAdapterId,
        config: request.config,
        updated_at: mockTimestamp,
      };

      const mockFullConfig = {
        ...mockUpdated,
        adapter_name: 'Test Adapter',
        adapter_enabled: true,
      };

      mockUpdate.mockResolvedValue(mockUpdated);
      mockFindById.mockResolvedValue(mockFullConfig);

      const result = await adapterConfigService.updateAdapterConfig(
        mockConfigId,
        mockPublisherId,
        request
      );

      expect(result).toEqual({
        id: mockConfigId,
        adapterId: mockAdapterId,
        adapterName: 'Test Adapter',
        enabled: true,
        config: request.config,
        updatedAt: '2025-01-01T00:00:00.000Z',
      });
      expect(mockUpdate).toHaveBeenCalledWith(mockConfigId, mockPublisherId, request);
      expect(mockFindById).toHaveBeenCalledWith(mockConfigId, mockPublisherId);
    });

    it('should return null when config not found', async () => {
      const request = {
        config: { appId: 'updated-id' },
      };

      mockUpdate.mockResolvedValue(null);

      const result = await adapterConfigService.updateAdapterConfig(
        mockConfigId,
        mockPublisherId,
        request
      );

      expect(result).toBeNull();
      expect(mockFindById).not.toHaveBeenCalled();
    });

    it('should return null when failed to retrieve updated config', async () => {
      const request = {
        config: { appId: 'updated-id' },
      };

      const mockUpdated = {
        id: mockConfigId,
        publisher_id: mockPublisherId,
        adapter_id: mockAdapterId,
        config: request.config,
        updated_at: mockTimestamp,
      };

      mockUpdate.mockResolvedValue(mockUpdated);
      mockFindById.mockResolvedValue(null);

      const result = await adapterConfigService.updateAdapterConfig(
        mockConfigId,
        mockPublisherId,
        request
      );

      expect(result).toBeNull();
    });
  });

  describe('deleteAdapterConfig', () => {
    it('should delete an adapter config and return true', async () => {
      mockDeleteById.mockResolvedValue(true);

      const result = await adapterConfigService.deleteAdapterConfig(
        mockConfigId,
        mockPublisherId
      );

      expect(result).toBe(true);
      expect(mockDeleteById).toHaveBeenCalledWith(mockConfigId, mockPublisherId);
    });

    it('should return false when config not found', async () => {
      mockDeleteById.mockResolvedValue(false);

      const result = await adapterConfigService.deleteAdapterConfig(
        mockConfigId,
        mockPublisherId
      );

      expect(result).toBe(false);
    });
  });
});
