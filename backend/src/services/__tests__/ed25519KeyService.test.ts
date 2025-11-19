import { Pool } from 'pg';
import { Ed25519KeyService } from '../ed25519KeyService';
import * as crypto from 'crypto';

// Mock dependencies
jest.mock('../../utils/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
}));

describe('Ed25519KeyService', () => {
  let service: Ed25519KeyService;
  let mockPool: jest.Mocked<Pool>;
  let mockClient: any;

  beforeEach(() => {
    // Create mock client
    mockClient = {
      query: jest.fn(),
      release: jest.fn(),
    };

    // Create mock pool
    mockPool = {
      connect: jest.fn().mockResolvedValue(mockClient),
      query: jest.fn(),
      end: jest.fn(),
      on: jest.fn(),
    } as any;

    service = new Ed25519KeyService(mockPool);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('generateKeyPair', () => {
    it('should generate new Ed25519 key pair', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // BEGIN
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // check existing
        .mockResolvedValueOnce({
          // INSERT
          rows: [{ id: 'key-uuid-123', created_at: new Date('2024-01-01') }],
          rowCount: 1,
        })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // COMMIT

      const keyPair = await service.generateKeyPair({
        keyId: 'test-key-2024',
        purpose: 'receipt_signing',
      });

      expect(keyPair.keyId).toBe('test-key-2024');
      expect(keyPair.purpose).toBe('receipt_signing');
      expect(keyPair.algorithm).toBe('Ed25519');
      expect(keyPair.isActive).toBe(true);
      expect(keyPair.expiresAt).toBeNull();
      expect(keyPair.publicKeyPem).toContain('BEGIN PUBLIC KEY');
      expect(keyPair.privateKeyPem).toContain('BEGIN PRIVATE KEY');

      // Verify key material can be used for crypto operations
      const publicKey = crypto.createPublicKey({
        key: keyPair.publicKeyPem,
        format: 'pem',
      });
      const privateKey = crypto.createPrivateKey({
        key: keyPair.privateKeyPem,
        format: 'pem',
      });

      const testData = Buffer.from('test message');
      const signature = crypto.sign(null, testData, privateKey);
      const isValid = crypto.verify(null, testData, publicKey, signature);

      expect(isValid).toBe(true);
    });

    it('should generate key pair with expiration date', async () => {
      const expiresAt = new Date('2025-01-01');

      mockClient.query
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // BEGIN
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // check
        .mockResolvedValueOnce({
          rows: [{ id: 'key-123', created_at: new Date() }],
          rowCount: 1,
        })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // COMMIT

      const keyPair = await service.generateKeyPair({
        keyId: 'expiring-key',
        purpose: 'api_auth',
        expiresAt,
      });

      expect(keyPair.expiresAt).toEqual(expiresAt);
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining(['expiring-key', expect.any(String), expect.any(String), 'api_auth', expiresAt])
      );
    });

    it('should throw error if key ID already exists', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // BEGIN
        .mockResolvedValueOnce({
          // existing check
          rows: [{ key_id: 'existing-key' }],
          rowCount: 1,
        });

      await expect(
        service.generateKeyPair({
          keyId: 'existing-key',
          purpose: 'receipt_signing',
        })
      ).rejects.toThrow('Key ID already exists: existing-key');
    });

    it('should rollback on database error', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // BEGIN
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // check
        .mockRejectedValueOnce(new Error('Database error'));

      await expect(
        service.generateKeyPair({
          keyId: 'test-key',
          purpose: 'receipt_signing',
        })
      ).rejects.toThrow('Database error');

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });
  });

  describe('getKeyPair', () => {
    it('should retrieve key pair by ID', async () => {
      const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
      const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }) as string;
      const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;

      mockClient.query.mockResolvedValueOnce({
        rows: [
          {
            key_id: 'test-key',
            public_key_pem: publicKeyPem,
            private_key_pem: privateKeyPem,
            algorithm: 'Ed25519',
            purpose: 'receipt_signing',
            created_at: new Date('2024-01-01'),
            expires_at: null,
            is_active: true,
          },
        ],
        rowCount: 1,
      });

      const keyPair = await service.getKeyPair('test-key');

      expect(keyPair).not.toBeNull();
      expect(keyPair!.keyId).toBe('test-key');
      expect(keyPair!.purpose).toBe('receipt_signing');
      expect(keyPair!.publicKeyPem).toBe(publicKeyPem);
      expect(keyPair!.privateKeyPem).toBe(privateKeyPem);
      expect(keyPair!.isActive).toBe(true);
    });

    it('should return null if key not found', async () => {
      mockClient.query.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      });

      const keyPair = await service.getKeyPair('non-existent');

      expect(keyPair).toBeNull();
    });
  });

  describe('getPublicKey', () => {
    it('should retrieve public key metadata only', async () => {
      const { publicKey } = crypto.generateKeyPairSync('ed25519');
      const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }) as string;

      mockClient.query.mockResolvedValueOnce({
        rows: [
          {
            key_id: 'test-key',
            public_key_pem: publicKeyPem,
            algorithm: 'Ed25519',
            purpose: 'receipt_signing',
            created_at: new Date('2024-01-01'),
            expires_at: null,
            is_active: true,
          },
        ],
        rowCount: 1,
      });

      const metadata = await service.getPublicKey('test-key');

      expect(metadata).not.toBeNull();
      expect(metadata!.keyId).toBe('test-key');
      expect(metadata!.publicKeyPem).toBe(publicKeyPem);
      expect(metadata).not.toHaveProperty('privateKeyPem');
    });
  });

  describe('listActiveKeys', () => {
    it('should list all active keys', async () => {
      const mockRows = [
        {
          key_id: 'key-1',
          public_key_pem: 'pem-1',
          algorithm: 'Ed25519',
          purpose: 'receipt_signing',
          created_at: new Date('2024-01-01'),
          expires_at: null,
          is_active: true,
        },
        {
          key_id: 'key-2',
          public_key_pem: 'pem-2',
          algorithm: 'Ed25519',
          purpose: 'api_auth',
          created_at: new Date('2024-01-02'),
          expires_at: null,
          is_active: true,
        },
      ];

      mockClient.query.mockResolvedValueOnce({
        rows: mockRows,
        rowCount: 2,
      });

      const keys = await service.listActiveKeys();

      expect(keys).toHaveLength(2);
      expect(keys[0].keyId).toBe('key-1');
      expect(keys[1].keyId).toBe('key-2');
    });

    it('should filter by purpose', async () => {
      mockClient.query.mockResolvedValueOnce({
        rows: [
          {
            key_id: 'signing-key',
            public_key_pem: 'pem',
            algorithm: 'Ed25519',
            purpose: 'receipt_signing',
            created_at: new Date(),
            expires_at: null,
            is_active: true,
          },
        ],
        rowCount: 1,
      });

      const keys = await service.listActiveKeys('receipt_signing');

      expect(keys).toHaveLength(1);
      expect(keys[0].purpose).toBe('receipt_signing');
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('purpose ='),
        ['receipt_signing']
      );
    });
  });

  describe('rotateKey', () => {
    it('should rotate key successfully', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // BEGIN
        .mockResolvedValueOnce({
          // check old key
          rows: [{ key_id: 'old-key', is_active: true }],
          rowCount: 1,
        })
        .mockResolvedValueOnce({
          // insert new key
          rows: [{ id: 'new-uuid', created_at: new Date('2024-01-01') }],
          rowCount: 1,
        })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // deactivate old
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // COMMIT

      const newKey = await service.rotateKey({
        oldKeyId: 'old-key',
        newKeyId: 'new-key',
        purpose: 'receipt_signing',
        gracePeriodDays: 7,
      });

      expect(newKey.keyId).toBe('new-key');
      expect(newKey.isActive).toBe(true);
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE ed25519_keys'),
        expect.arrayContaining([expect.any(Date), 'old-key'])
      );
    });

    it('should throw error if old key not found', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // BEGIN
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // old key check

      await expect(
        service.rotateKey({
          oldKeyId: 'non-existent',
          newKeyId: 'new-key',
          purpose: 'receipt_signing',
        })
      ).rejects.toThrow('Old key not found: non-existent');
    });

    it('should throw error if old key already inactive', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // BEGIN
        .mockResolvedValueOnce({
          rows: [{ key_id: 'old-key', is_active: false }],
          rowCount: 1,
        });

      await expect(
        service.rotateKey({
          oldKeyId: 'old-key',
          newKeyId: 'new-key',
          purpose: 'receipt_signing',
        })
      ).rejects.toThrow('Old key is already inactive: old-key');
    });
  });

  describe('deactivateKey', () => {
    it('should deactivate a key', async () => {
      mockClient.query.mockResolvedValueOnce({
        rows: [{ key_id: 'test-key' }],
        rowCount: 1,
      });

      await service.deactivateKey('test-key');

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE ed25519_keys'),
        ['test-key']
      );
    });

    it('should throw error if key not found', async () => {
      mockClient.query.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      });

      await expect(service.deactivateKey('non-existent')).rejects.toThrow('Key not found: non-existent');
    });
  });

  describe('deleteKey', () => {
    it('should soft delete a key', async () => {
      mockClient.query.mockResolvedValueOnce({
        rows: [{ key_id: 'test-key' }],
        rowCount: 1,
      });

      await service.deleteKey('test-key');

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE ed25519_keys'),
        ['test-key']
      );
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('deleted_at = NOW()'),
        expect.any(Array)
      );
    });
  });

  describe('sign', () => {
    it('should sign data with key', async () => {
      const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
      const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }) as string;
      const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;

      mockClient.query.mockResolvedValueOnce({
        rows: [
          {
            key_id: 'test-key',
            public_key_pem: publicKeyPem,
            private_key_pem: privateKeyPem,
            algorithm: 'Ed25519',
            purpose: 'receipt_signing',
            created_at: new Date(),
            expires_at: null,
            is_active: true,
          },
        ],
        rowCount: 1,
      });

      const testData = 'test message';
      const signature = await service.sign('test-key', testData);

      expect(signature).toMatch(/^[0-9a-f]+$/);

      // Verify signature
      const isValid = crypto.verify(
        null,
        Buffer.from(testData),
        publicKey,
        Buffer.from(signature, 'hex')
      );
      expect(isValid).toBe(true);
    });

    it('should throw error if key not found', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      await expect(service.sign('non-existent', 'data')).rejects.toThrow('Key not found: non-existent');
    });

    it('should throw error if key is inactive', async () => {
      mockClient.query.mockResolvedValueOnce({
        rows: [
          {
            key_id: 'inactive-key',
            public_key_pem: 'pem',
            private_key_pem: 'pem',
            algorithm: 'Ed25519',
            purpose: 'receipt_signing',
            created_at: new Date(),
            expires_at: null,
            is_active: false,
          },
        ],
        rowCount: 1,
      });

      await expect(service.sign('inactive-key', 'data')).rejects.toThrow('Key is inactive: inactive-key');
    });

    it('should throw error if key has expired', async () => {
      const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
      const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }) as string;
      const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;

      mockClient.query.mockResolvedValueOnce({
        rows: [
          {
            key_id: 'expired-key',
            public_key_pem: publicKeyPem,
            private_key_pem: privateKeyPem,
            algorithm: 'Ed25519',
            purpose: 'receipt_signing',
            created_at: new Date('2023-01-01'),
            expires_at: new Date('2023-12-31'),
            is_active: true,
          },
        ],
        rowCount: 1,
      });

      await expect(service.sign('expired-key', 'data')).rejects.toThrow('Key has expired: expired-key');
    });
  });

  describe('verify', () => {
    it('should verify valid signature', async () => {
      const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
      const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }) as string;

      const testData = Buffer.from('test message');
      const signature = crypto.sign(null, testData, privateKey);

      mockClient.query.mockResolvedValueOnce({
        rows: [
          {
            key_id: 'test-key',
            public_key_pem: publicKeyPem,
            algorithm: 'Ed25519',
            purpose: 'receipt_signing',
            created_at: new Date(),
            expires_at: null,
            is_active: true,
          },
        ],
        rowCount: 1,
      });

      const isValid = await service.verify('test-key', testData, signature.toString('hex'));

      expect(isValid).toBe(true);
    });

    it('should detect invalid signature', async () => {
      const { publicKey } = crypto.generateKeyPairSync('ed25519');
      const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }) as string;

      mockClient.query.mockResolvedValueOnce({
        rows: [
          {
            key_id: 'test-key',
            public_key_pem: publicKeyPem,
            algorithm: 'Ed25519',
            purpose: 'receipt_signing',
            created_at: new Date(),
            expires_at: null,
            is_active: true,
          },
        ],
        rowCount: 1,
      });

      const isValid = await service.verify('test-key', 'data', 'invalid-signature');

      expect(isValid).toBe(false);
    });
  });

  describe('expireOldKeys', () => {
    it('should expire old keys', async () => {
      mockClient.query.mockResolvedValueOnce({
        rows: [{ key_id: 'expired-1' }, { key_id: 'expired-2' }],
        rowCount: 2,
      });

      const count = await service.expireOldKeys();

      expect(count).toBe(2);
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('expires_at < NOW()'),
        []
      );
    });

    it('should return zero if no keys expired', async () => {
      mockClient.query.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      });

      const count = await service.expireOldKeys();

      expect(count).toBe(0);
    });
  });

  describe('exportPublicKeys', () => {
    it('should export all active public keys', async () => {
      const { publicKey } = crypto.generateKeyPairSync('ed25519');
      const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }) as string;

      mockClient.query.mockResolvedValueOnce({
        rows: [
          {
            key_id: 'key-1',
            public_key_pem: publicKeyPem,
            algorithm: 'Ed25519',
            purpose: 'receipt_signing',
            created_at: new Date('2024-01-01T12:00:00Z'),
            expires_at: null,
            is_active: true,
          },
        ],
        rowCount: 1,
      });

      const exported = await service.exportPublicKeys();

      expect(exported).toHaveLength(1);
      expect(exported[0]).toEqual({
        keyId: 'key-1',
        publicKey: publicKeyPem,
        algorithm: 'Ed25519',
        purpose: 'receipt_signing',
        createdAt: '2024-01-01T12:00:00.000Z',
        expiresAt: null,
      });
    });

    it('should filter by purpose when exporting', async () => {
      mockClient.query.mockResolvedValueOnce({
        rows: [
          {
            key_id: 'signing-key',
            public_key_pem: 'pem',
            algorithm: 'Ed25519',
            purpose: 'receipt_signing',
            created_at: new Date(),
            expires_at: null,
            is_active: true,
          },
        ],
        rowCount: 1,
      });

      await service.exportPublicKeys('receipt_signing');

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('purpose ='),
        ['receipt_signing']
      );
    });
  });
});
