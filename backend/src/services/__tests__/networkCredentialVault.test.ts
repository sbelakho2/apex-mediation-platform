import { Pool } from 'pg';
import { NetworkCredentialVaultService } from '../networkCredentialVault';
import * as crypto from '../../utils/crypto';
import * as jwt from 'jsonwebtoken';

// Mock dependencies
jest.mock('../../utils/crypto');
jest.mock('../../utils/logger');
jest.mock('jsonwebtoken');

describe('NetworkCredentialVaultService', () => {
  let service: NetworkCredentialVaultService;
  let mockPool: jest.Mocked<Pool>;
  let mockClient: any;

  beforeEach(() => {
    // Setup mock client
    mockClient = {
      query: jest.fn(),
      release: jest.fn(),
    };

    // Setup mock pool
    mockPool = {
      connect: jest.fn().mockResolvedValue(mockClient),
    } as any;

    service = new NetworkCredentialVaultService(mockPool);

    // Setup crypto mocks
    (crypto.aesGcmEncrypt as jest.Mock).mockReturnValue({
      iv: 'mockIv',
      authTag: 'mockTag',
      ciphertext: 'mockCiphertext',
    });
    (crypto.aesGcmDecrypt as jest.Mock).mockReturnValue(
      JSON.stringify({ apiKey: 'test-key', secret: 'test-secret' })
    );

    // Setup JWT mock
    (jwt.sign as jest.Mock).mockReturnValue('mock-jwt-token');
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('storeCredentials', () => {
    it('should store new credentials successfully', async () => {
      const input = {
        publisherId: 'pub-123',
        network: 'admob',
        credentials: { apiKey: 'test-key', secret: 'test-secret' },
      };

      // Mock no existing credentials
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // SELECT existing
        .mockResolvedValueOnce({ rows: [{ id: 'cred-123' }] }) // INSERT
        .mockResolvedValueOnce({ rows: [] }) // INSERT audit
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      const credentialId = await service.storeCredentials(input);

      expect(credentialId).toBe('cred-123');
      expect(crypto.aesGcmEncrypt).toHaveBeenCalledWith(
        JSON.stringify(input.credentials)
      );
      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should update existing credentials with version increment', async () => {
      const input = {
        publisherId: 'pub-123',
        network: 'admob',
        credentials: { apiKey: 'new-key', secret: 'new-secret' },
      };

      // Mock existing credentials
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({
          rows: [{ id: 'cred-123', version: 2 }],
        }) // SELECT existing
        .mockResolvedValueOnce({ rows: [] }) // UPDATE
        .mockResolvedValueOnce({ rows: [] }) // INSERT audit
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      const credentialId = await service.storeCredentials(input);

      expect(credentialId).toBe('cred-123');
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE encrypted_network_credentials'),
        expect.arrayContaining([expect.any(String), 3, 'cred-123'])
      );
    });

    it('should rollback on error', async () => {
      const input = {
        publisherId: 'pub-123',
        network: 'admob',
        credentials: { apiKey: 'test-key' },
      };

      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockRejectedValueOnce(new Error('Database error')); // SELECT fails

      await expect(service.storeCredentials(input)).rejects.toThrow(
        'Database error'
      );
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClient.release).toHaveBeenCalled();
    });
  });

  describe('getCredentials', () => {
    it('should retrieve and decrypt credentials', async () => {
      const mockRow = {
        id: 'cred-123',
        publisher_id: 'pub-123',
        network: 'admob',
        credentials_ciphertext: JSON.stringify({
          iv: 'mockIv',
          authTag: 'mockTag',
          ciphertext: 'mockCiphertext',
        }),
        version: 1,
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockClient.query
        .mockResolvedValueOnce({ rows: [mockRow] }) // SELECT
        .mockResolvedValueOnce({ rows: [] }); // INSERT audit

      const result = await service.getCredentials('pub-123', 'admob');

      expect(result).toEqual({
        id: 'cred-123',
        publisherId: 'pub-123',
        network: 'admob',
        credentials: { apiKey: 'test-key', secret: 'test-secret' },
        createdAt: mockRow.created_at,
        updatedAt: mockRow.updated_at,
        version: 1,
      });

      expect(crypto.aesGcmDecrypt).toHaveBeenCalled();
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO credential_audit_log'),
        ['cred-123', 'pub-123']
      );
    });

    it('should return null for non-existent credentials', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [] });

      const result = await service.getCredentials('pub-999', 'unknown');

      expect(result).toBeNull();
      expect(crypto.aesGcmDecrypt).not.toHaveBeenCalled();
    });
  });

  describe('generateShortLivedToken', () => {
    it('should generate token with correct payload', async () => {
      const mockCredential = {
        id: 'cred-123',
        publisherId: 'pub-123',
        network: 'admob',
        credentials: { apiKey: 'test-key' },
        createdAt: new Date(),
        updatedAt: new Date(),
        version: 1,
      };

      // Mock getCredentials
      mockClient.query
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'cred-123',
              publisher_id: 'pub-123',
              network: 'admob',
              credentials_ciphertext: JSON.stringify({
                iv: 'mockIv',
                authTag: 'mockTag',
                ciphertext: 'mockCiphertext',
              }),
              version: 1,
              created_at: new Date(),
              updated_at: new Date(),
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] }); // audit log

      const result = await service.generateShortLivedToken(
        'pub-123',
        'admob',
        15
      );

      expect(result).not.toBeNull();
      expect(result?.token).toBe('mock-jwt-token');
      expect(result?.network).toBe('admob');
      expect(result?.publisherId).toBe('pub-123');
      expect(result?.expiresAt).toBeInstanceOf(Date);

      expect(jwt.sign).toHaveBeenCalledWith(
        expect.objectContaining({
          publisherId: 'pub-123',
          network: 'admob',
          credentialId: 'cred-123',
          type: 'network_adapter',
        }),
        expect.any(String)
      );
    });

    it('should return null if credentials do not exist', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [] });

      const result = await service.generateShortLivedToken(
        'pub-999',
        'unknown'
      );

      expect(result).toBeNull();
      expect(jwt.sign).not.toHaveBeenCalled();
    });

    it('should use custom TTL', async () => {
      mockClient.query
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'cred-123',
              publisher_id: 'pub-123',
              network: 'admob',
              credentials_ciphertext: '{}',
              version: 1,
              created_at: new Date(),
              updated_at: new Date(),
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] });

      const ttlMinutes = 5;
      const result = await service.generateShortLivedToken(
        'pub-123',
        'admob',
        ttlMinutes
      );

      const expectedExpiry = Date.now() + ttlMinutes * 60 * 1000;
      expect(result?.expiresAt.getTime()).toBeGreaterThanOrEqual(
        expectedExpiry - 1000
      );
      expect(result?.expiresAt.getTime()).toBeLessThanOrEqual(
        expectedExpiry + 1000
      );
    });
  });

  describe('deleteCredentials', () => {
    it('should soft delete credentials', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [{ id: 'cred-123' }] }) // UPDATE
        .mockResolvedValueOnce({ rows: [] }); // INSERT audit

      await service.deleteCredentials('pub-123', 'admob');

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE encrypted_network_credentials'),
        expect.arrayContaining(['pub-123', 'admob'])
      );

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO credential_audit_log'),
        ['cred-123', 'pub-123']
      );
    });

    it('should not log audit if credentials do not exist', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [] });

      await service.deleteCredentials('pub-999', 'unknown');

      expect(mockClient.query).toHaveBeenCalledTimes(1);
    });
  });

  describe('listNetworks', () => {
    it('should return list of networks for publisher', async () => {
      mockClient.query.mockResolvedValueOnce({
        rows: [{ network: 'admob' }, { network: 'unity' }, { network: 'meta' }],
      });

      const result = await service.listNetworks('pub-123');

      expect(result).toEqual(['admob', 'unity', 'meta']);
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT DISTINCT network'),
        ['pub-123']
      );
    });

    it('should return empty array if no networks found', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [] });

      const result = await service.listNetworks('pub-999');

      expect(result).toEqual([]);
    });
  });

  describe('getCredentialMetadata', () => {
    it('should return metadata without decrypting', async () => {
      const mockRow = {
        id: 'cred-123',
        publisher_id: 'pub-123',
        network: 'admob',
        version: 2,
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockClient.query.mockResolvedValueOnce({ rows: [mockRow] });

      const result = await service.getCredentialMetadata('pub-123', 'admob');

      expect(result).toEqual(mockRow);
      expect(crypto.aesGcmDecrypt).not.toHaveBeenCalled();
    });

    it('should return null if not found', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [] });

      const result = await service.getCredentialMetadata('pub-999', 'unknown');

      expect(result).toBeNull();
    });
  });

  describe('rotateCredentials', () => {
    it('should call storeCredentials with new credentials', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [{ id: 'cred-123', version: 1 }] }) // SELECT
        .mockResolvedValueOnce({ rows: [] }) // UPDATE
        .mockResolvedValueOnce({ rows: [] }) // INSERT audit
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      await service.rotateCredentials('pub-123', 'admob', {
        apiKey: 'new-key',
      });

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE encrypted_network_credentials'),
        expect.arrayContaining([expect.any(String), 2, 'cred-123'])
      );
    });
  });
});
