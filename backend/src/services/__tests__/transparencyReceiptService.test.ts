import { Pool } from 'pg';
import { TransparencyReceiptService, BidEntry, WinnerEntry } from '../transparencyReceiptService';
import * as crypto from 'crypto';

// Mock dependencies
jest.mock('../../utils/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
}));

describe('TransparencyReceiptService', () => {
  let service: TransparencyReceiptService;
  let mockPool: jest.Mocked<Pool>;
  let mockClient: any;
  let testKeyPair: { privateKey: crypto.KeyObject; publicKey: crypto.KeyObject };

  beforeAll(() => {
    // Generate test Ed25519 key pair
    testKeyPair = crypto.generateKeyPairSync('ed25519');
  });

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

    service = new TransparencyReceiptService(mockPool, 'test-key');
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('initialize', () => {
    it('should load Ed25519 key pair successfully', async () => {
      const privatePem = testKeyPair.privateKey.export({ type: 'pkcs8', format: 'pem' });
      const publicPem = testKeyPair.publicKey.export({ type: 'spki', format: 'pem' });

      mockClient.query.mockResolvedValueOnce({
        rows: [
          {
            private_key_pem: privatePem,
            public_key_pem: publicPem,
          },
        ],
        rowCount: 1,
      });

      await service.initialize();

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT private_key_pem, public_key_pem FROM ed25519_keys'),
        ['test-key']
      );
    });

    it('should throw error if key pair not found', async () => {
      mockClient.query.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      });

      await expect(service.initialize()).rejects.toThrow('Ed25519 key pair not found: test-key');
    });
  });

  describe('createReceipt', () => {
    beforeEach(async () => {
      // Mock key loading
      const privatePem = testKeyPair.privateKey.export({ type: 'pkcs8', format: 'pem' });
      const publicPem = testKeyPair.publicKey.export({ type: 'spki', format: 'pem' });

      mockClient.query.mockResolvedValueOnce({
        rows: [{ private_key_pem: privatePem, public_key_pem: publicPem }],
        rowCount: 1,
      });

      await service.initialize();
      jest.clearAllMocks();
    });

    it('should create receipt with valid signature', async () => {
      const bids: BidEntry[] = [
        { network: 'admob', bidCpm: 2.5, currency: 'USD', latencyMs: 150, status: 'win' },
        { network: 'unity', bidCpm: 2.0, currency: 'USD', latencyMs: 200, status: 'lose' },
      ];

      const winner: WinnerEntry = {
        network: 'admob',
        bidCpm: 2.5,
        currency: 'USD',
        normalizedCpm: 2.5,
      };

      mockClient.query
        .mockResolvedValueOnce({
          // BEGIN
          rows: [],
          rowCount: 0,
        })
        .mockResolvedValueOnce({
          // Previous hash query
          rows: [],
          rowCount: 0,
        })
        .mockResolvedValueOnce({
          // Insert receipt
          rows: [{ id: 'receipt-123' }],
          rowCount: 1,
        })
        .mockResolvedValueOnce({
          // Commit
          rows: [],
          rowCount: 0,
        });

      const receipt = await service.createReceipt({
        reqId: 'auction-123',
        placementId: 'placement-456',
        floorCpm: 1.5,
        currency: 'USD',
        bids,
        winner,
      });

      expect(receipt.receiptId).toBe('receipt-123');
      expect(receipt.reqId).toBe('auction-123');
      expect(receipt.placementId).toBe('placement-456');
      expect(receipt.floorCpm).toBe(1.5);
      expect(receipt.currency).toBe('USD');
      expect(receipt.bids).toEqual(bids);
      expect(receipt.winner).toEqual(winner);
      expect(receipt.prevHash).toBeNull();
      expect(receipt.hash).toMatch(/^[0-9a-f]{64}$/);
      expect(receipt.signature).toMatch(/^[0-9a-f]+$/);

      // Verify signature
      const isValidSignature = crypto.verify(
        null,
        Buffer.from(receipt.hash, 'hex'),
        testKeyPair.publicKey,
        Buffer.from(receipt.signature, 'hex')
      );
      expect(isValidSignature).toBe(true);
    });

    it('should create receipt with previous hash (chain)', async () => {
      const prevHash = 'a'.repeat(64);

      mockClient.query
        .mockResolvedValueOnce({
          // BEGIN
          rows: [],
          rowCount: 0,
        })
        .mockResolvedValueOnce({
          // Previous hash query
          rows: [{ hash: prevHash }],
          rowCount: 1,
        })
        .mockResolvedValueOnce({
          // Insert receipt
          rows: [{ id: 'receipt-123' }],
          rowCount: 1,
        })
        .mockResolvedValueOnce({
          // Commit
          rows: [],
          rowCount: 0,
        });

      const receipt = await service.createReceipt({
        reqId: 'auction-123',
        placementId: 'placement-456',
        floorCpm: 1.5,
        currency: 'USD',
        bids: [],
        winner: null,
      });

      expect(receipt.prevHash).toBe(prevHash);
    });

    it('should create receipt with no winner', async () => {
      const bids: BidEntry[] = [
        { network: 'admob', bidCpm: 0.5, currency: 'USD', latencyMs: 150, status: 'lose' },
        { network: 'unity', bidCpm: 0.8, currency: 'USD', latencyMs: 200, status: 'lose' },
      ];

      mockClient.query
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // BEGIN
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // prev hash
        .mockResolvedValueOnce({ rows: [{ id: 'receipt-123' }], rowCount: 1 }) // INSERT
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // COMMIT

      const receipt = await service.createReceipt({
        reqId: 'auction-123',
        placementId: 'placement-456',
        floorCpm: 1.5,
        currency: 'USD',
        bids,
        winner: null,
      });

      expect(receipt.winner).toBeNull();
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([
          'auction-123',
          expect.any(Date),
          'placement-456',
          1.5,
          'USD',
          JSON.stringify(bids),
          null, // winner is null
          null, // prevHash
          expect.any(String), // hash
          expect.any(String), // signature
          'test-key',
        ])
      );
    });

    it('should throw error if not initialized', async () => {
      const uninitializedService = new TransparencyReceiptService(mockPool);

      await expect(
        uninitializedService.createReceipt({
          reqId: 'auction-123',
          placementId: 'placement-456',
          floorCpm: 1.5,
          currency: 'USD',
          bids: [],
          winner: null,
        })
      ).rejects.toThrow('Service not initialized - call initialize() first');
    });

    it('should rollback on database error', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // BEGIN
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // prev hash
        .mockRejectedValueOnce(new Error('Database error')); // insert fails

      await expect(
        service.createReceipt({
          reqId: 'auction-123',
          placementId: 'placement-456',
          floorCpm: 1.5,
          currency: 'USD',
          bids: [],
          winner: null,
        })
      ).rejects.toThrow('Database error');

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });
  });

  describe('getReceipt', () => {
    it('should retrieve receipt by ID', async () => {
      const mockRow = {
        id: 'receipt-123',
        req_id: 'auction-456',
        timestamp: new Date('2024-01-01T12:00:00Z'),
        placement_id: 'placement-789',
        floor_cpm: '1.5000',
        currency: 'USD',
        bids: JSON.stringify([
          { network: 'admob', bidCpm: 2.0, currency: 'USD', latencyMs: 100, status: 'win' },
        ]),
        winner: JSON.stringify({
          network: 'admob',
          bidCpm: 2.0,
          currency: 'USD',
          normalizedCpm: 2.0,
        }),
        prev_hash: 'abc123',
        hash: 'def456',
        signature: 'sig789',
      };

      mockClient.query.mockResolvedValueOnce({
        rows: [mockRow],
        rowCount: 1,
      });

      const receipt = await service.getReceipt('receipt-123');

      expect(receipt).not.toBeNull();
      expect(receipt!.receiptId).toBe('receipt-123');
      expect(receipt!.reqId).toBe('auction-456');
      expect(receipt!.timestamp).toEqual(new Date('2024-01-01T12:00:00Z'));
      expect(receipt!.floorCpm).toBe(1.5);
      expect(receipt!.bids).toHaveLength(1);
      expect(receipt!.winner).toEqual({
        network: 'admob',
        bidCpm: 2.0,
        currency: 'USD',
        normalizedCpm: 2.0,
      });
    });

    it('should return null if receipt not found', async () => {
      mockClient.query.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      });

      const receipt = await service.getReceipt('non-existent');

      expect(receipt).toBeNull();
    });
  });

  describe('getReceiptsForPlacement', () => {
    it('should retrieve receipts for placement with pagination', async () => {
      const mockRows = [
        {
          id: 'receipt-1',
          req_id: 'auction-1',
          timestamp: new Date('2024-01-01'),
          placement_id: 'placement-123',
          floor_cpm: '1.5',
          currency: 'USD',
          bids: '[]',
          winner: null,
          prev_hash: null,
          hash: 'hash1',
          signature: 'sig1',
        },
      ];

      mockClient.query.mockResolvedValueOnce({
        rows: mockRows,
        rowCount: 1,
      });

      const receipts = await service.getReceiptsForPlacement('placement-123', 50, 10);

      expect(receipts).toHaveLength(1);
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.any(String),
        ['placement-123', 50, 10]
      );
    });

    it('should use default pagination values', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      await service.getReceiptsForPlacement('placement-123');

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.any(String),
        ['placement-123', 100, 0]
      );
    });
  });

  describe('getReceiptsByReqId', () => {
    it('should retrieve receipts by request ID', async () => {
      const mockRows = [
        {
          id: 'receipt-1',
          req_id: 'auction-123',
          timestamp: new Date('2024-01-01'),
          placement_id: 'placement-456',
          floor_cpm: '1.5',
          currency: 'USD',
          bids: '[]',
          winner: null,
          prev_hash: null,
          hash: 'hash1',
          signature: 'sig1',
        },
      ];

      mockClient.query.mockResolvedValueOnce({
        rows: mockRows,
        rowCount: 1,
      });

      const receipts = await service.getReceiptsByReqId('auction-123');

      expect(receipts).toHaveLength(1);
      expect(receipts[0].reqId).toBe('auction-123');
    });
  });

  describe('verifyReceipt', () => {
    beforeEach(async () => {
      // Mock key loading for verification
      const privatePem = testKeyPair.privateKey.export({ type: 'pkcs8', format: 'pem' });
      const publicPem = testKeyPair.publicKey.export({ type: 'spki', format: 'pem' });

      mockClient.query.mockResolvedValueOnce({
        rows: [{ private_key_pem: privatePem, public_key_pem: publicPem }],
        rowCount: 1,
      });

      await service.initialize();
      jest.clearAllMocks();
    });

    it('should verify valid receipt', async () => {
      // Create a valid receipt
      const bids: BidEntry[] = [
        { network: 'admob', bidCpm: 2.0, currency: 'USD', latencyMs: 100, status: 'win' },
      ];
      const winner: WinnerEntry = {
        network: 'admob',
        bidCpm: 2.0,
        currency: 'USD',
        normalizedCpm: 2.0,
      };

      mockClient.query
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // BEGIN
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // prev hash
        .mockResolvedValueOnce({ rows: [{ id: 'receipt-123' }], rowCount: 1 }) // insert
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // commit

      const receipt = await service.createReceipt({
        reqId: 'auction-123',
        placementId: 'placement-456',
        floorCpm: 1.5,
        currency: 'USD',
        bids,
        winner,
      });

      jest.clearAllMocks();

      // Mock getReceipt call in verifyReceipt
      mockClient.query.mockResolvedValueOnce({
        rows: [
          {
            id: receipt.receiptId,
            req_id: receipt.reqId,
            timestamp: receipt.timestamp,
            placement_id: receipt.placementId,
            floor_cpm: receipt.floorCpm.toString(),
            currency: receipt.currency,
            bids: JSON.stringify(receipt.bids),
            winner: JSON.stringify(receipt.winner),
            prev_hash: receipt.prevHash,
            hash: receipt.hash,
            signature: receipt.signature,
          },
        ],
        rowCount: 1,
      });

      // Mock chain verification (no previous)
      mockClient.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const verification = await service.verifyReceipt(receipt.receiptId);

      expect(verification.isValid).toBe(true);
      expect(verification.hashValid).toBe(true);
      expect(verification.signatureValid).toBe(true);
      expect(verification.chainValid).toBe(true);
      expect(verification.errors).toHaveLength(0);
    });

    it('should detect invalid hash', async () => {
      mockClient.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'receipt-123',
            req_id: 'auction-123',
            timestamp: new Date('2024-01-01'),
            placement_id: 'placement-456',
            floor_cpm: '1.5',
            currency: 'USD',
            bids: '[]',
            winner: null,
            prev_hash: null,
            hash: 'wrong-hash',
            signature: 'sig123',
          },
        ],
        rowCount: 1,
      });

      mockClient.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const verification = await service.verifyReceipt('receipt-123');

      expect(verification.isValid).toBe(false);
      expect(verification.hashValid).toBe(false);
      expect(verification.errors).toContain('Hash mismatch - receipt data may have been tampered with');
    });

    it('should detect invalid signature', async () => {
      // Create valid receipt
      mockClient.query
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // BEGIN
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // prev hash
        .mockResolvedValueOnce({ rows: [{ id: 'receipt-123' }], rowCount: 1 }) // INSERT
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // COMMIT

      const receipt = await service.createReceipt({
        reqId: 'auction-123',
        placementId: 'placement-456',
        floorCpm: 1.5,
        currency: 'USD',
        bids: [],
        winner: null,
      });

      jest.clearAllMocks();

      // Mock with tampered signature
      mockClient.query.mockResolvedValueOnce({
        rows: [
          {
            id: receipt.receiptId,
            req_id: receipt.reqId,
            timestamp: receipt.timestamp,
            placement_id: receipt.placementId,
            floor_cpm: receipt.floorCpm.toString(),
            currency: receipt.currency,
            bids: JSON.stringify(receipt.bids),
            winner: null,
            prev_hash: receipt.prevHash,
            hash: receipt.hash,
            signature: 'tampered-signature',
          },
        ],
        rowCount: 1,
      });

      mockClient.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const verification = await service.verifyReceipt(receipt.receiptId);

      expect(verification.isValid).toBe(false);
      expect(verification.signatureValid).toBe(false);
      expect(verification.errors).toContain('Invalid signature - receipt not signed by authorized key');
    });

    it('should return false for non-existent receipt', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const verification = await service.verifyReceipt('non-existent');

      expect(verification.isValid).toBe(false);
      expect(verification.errors).toContain('Receipt not found');
    });
  });

  describe('verifyChain', () => {
    it('should verify entire chain for placement', async () => {
      // Mock getReceiptsForPlacement
      const receipts = [
        {
          receiptId: 'receipt-1',
          reqId: 'auction-1',
          timestamp: new Date('2024-01-01'),
          placementId: 'placement-123',
          floorCpm: 1.5,
          currency: 'USD',
          bids: [],
          winner: null,
          prevHash: null,
          hash: 'hash1',
          signature: 'sig1',
        },
      ];

      mockClient.query.mockResolvedValueOnce({
        rows: receipts.map((r) => ({
          id: r.receiptId,
          req_id: r.reqId,
          timestamp: r.timestamp,
          placement_id: r.placementId,
          floor_cpm: r.floorCpm.toString(),
          currency: r.currency,
          bids: '[]',
          winner: null,
          prev_hash: r.prevHash,
          hash: r.hash,
          signature: r.signature,
        })),
        rowCount: 1,
      });

      // Mock verifyReceipt calls
      mockClient.query
        .mockResolvedValueOnce({
          rows: [receipts[0]].map((r) => ({
            id: r.receiptId,
            req_id: r.reqId,
            timestamp: r.timestamp,
            placement_id: r.placementId,
            floor_cpm: r.floorCpm.toString(),
            currency: r.currency,
            bids: '[]',
            winner: null,
            prev_hash: r.prevHash,
            hash: r.hash,
            signature: r.signature,
          })),
          rowCount: 1,
        })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // chain check

      const result = await service.verifyChain('placement-123');

      expect(result.totalReceipts).toBe(1);
      expect(result.validReceipts).toBeGreaterThanOrEqual(0);
    });
  });

  describe('getPlacementStatistics', () => {
    it('should calculate statistics for placement', async () => {
      mockClient.query.mockResolvedValueOnce({
        rows: [
          {
            total_receipts: '10',
            total_auctions: '10',
            total_wins: '6',
            avg_floor_cpm: '1.5',
            avg_win_cpm: '2.0',
          },
        ],
        rowCount: 1,
      });

      mockClient.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'r1',
            req_id: 'a1',
            timestamp: new Date(),
            placement_id: 'p1',
            floor_cpm: '1.5',
            currency: 'USD',
            bids: JSON.stringify([
              { network: 'admob', bidCpm: 2.0, currency: 'USD', latencyMs: 100, status: 'win' },
              { network: 'unity', bidCpm: 1.8, currency: 'USD', latencyMs: 150, status: 'lose' },
            ]),
            winner: JSON.stringify({ network: 'admob', bidCpm: 2.0, currency: 'USD', normalizedCpm: 2.0 }),
            prev_hash: null,
            hash: 'h1',
            signature: 's1',
          },
        ],
        rowCount: 1,
      });

      const stats = await service.getPlacementStatistics('placement-123');

      expect(stats.totalReceipts).toBe(10);
      expect(stats.totalAuctions).toBe(10);
      expect(stats.totalWins).toBe(6);
      expect(stats.winRate).toBe(0.6);
      expect(stats.averageFloorCpm).toBe(1.5);
      expect(stats.averageWinCpm).toBe(2.0);
      expect(stats.networkStats).toHaveProperty('admob');
      expect(stats.networkStats).toHaveProperty('unity');
    });
  });
});
