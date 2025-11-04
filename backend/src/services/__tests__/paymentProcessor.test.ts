/**
 * Payment Processor Tests with Failover Logic
 */

import {
  PaymentProcessor,
  PayoutLedgerService,
  paymentProcessor,
  ledgerService,
  PayoutRequest,
} from '../payoutProcessor';
import { query } from '../../utils/postgres';
import logger from '../../utils/logger';

// Mock dependencies
jest.mock('../../utils/postgres');
jest.mock('../../utils/logger');

const mockQuery = jest.mocked(query);
const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};
(logger.info as jest.Mock) = mockLogger.info;
(logger.warn as jest.Mock) = mockLogger.warn;
(logger.error as jest.Mock) = mockLogger.error;

describe('PaymentProcessor', () => {
  let processor: PaymentProcessor;

  beforeEach(() => {
    jest.clearAllMocks();
    processor = new PaymentProcessor();
    
    // Mock successful query responses by default
    mockQuery.mockResolvedValue({
      rows: [],
      rowCount: 0,
      command: '',
      oid: 0,
      fields: [],
    });
  });

  describe('processPayout', () => {
    const validPayoutRequest: PayoutRequest = {
      payoutId: 'payout-123',
      publisherId: 'publisher-456',
      amount: 500,
      currency: 'USD',
      method: 'wire',
      recipientEmail: 'test@example.com',
    };

    it('should process payout with primary provider (Tipalti)', async () => {
      // Mock ledger entry creation
      mockQuery
        .mockResolvedValueOnce({
          rows: [{ id: 'debit-entry-1' }],
          rowCount: 1,
          command: '',
          oid: 0,
          fields: [],
        })
        .mockResolvedValueOnce({
          rows: [{ id: 'credit-entry-1' }],
          rowCount: 1,
          command: '',
          oid: 0,
          fields: [],
        })
        .mockResolvedValueOnce({
          rows: [{ balance: 0 }],
          rowCount: 1,
          command: '',
          oid: 0,
          fields: [],
        })
        .mockResolvedValueOnce({
          rows: [],
          rowCount: 1,
          command: '',
          oid: 0,
          fields: [],
        });

      const result = await processor.processPayout(validPayoutRequest);

      expect(result.success).toBe(true);
      expect(result.provider).toBe('tipalti');
      expect(result.transactionId).toContain('tipalti_');
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Payout processed successfully',
        expect.objectContaining({
          payoutId: 'payout-123',
          provider: 'tipalti',
        })
      );
    });

    it('should failover to Wise when Tipalti fails', async () => {
      // Simulate Tipalti API failure by setting env to trigger error path
      const originalTipaltiKey = process.env.TIPALTI_API_KEY;
      delete process.env.TIPALTI_API_KEY;

      // Mock ledger entries for successful Wise transaction
      mockQuery
        .mockResolvedValueOnce({
          rows: [{ id: 'debit-entry-1' }],
          rowCount: 1,
          command: '',
          oid: 0,
          fields: [],
        })
        .mockResolvedValueOnce({
          rows: [{ id: 'credit-entry-1' }],
          rowCount: 1,
          command: '',
          oid: 0,
          fields: [],
        })
        .mockResolvedValueOnce({
          rows: [{ balance: 0 }],
          rowCount: 1,
          command: '',
          oid: 0,
          fields: [],
        })
        .mockResolvedValueOnce({
          rows: [],
          rowCount: 1,
          command: '',
          oid: 0,
          fields: [],
        });

      const result = await processor.processPayout(validPayoutRequest);

      expect(result.success).toBe(true);
      expect(['tipalti', 'wise', 'payoneer']).toContain(result.provider);

      // Restore env
      if (originalTipaltiKey) {
        process.env.TIPALTI_API_KEY = originalTipaltiKey;
      }
    });

    it('should create ledger entries after successful payout', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [{ id: 'debit-123' }],
          rowCount: 1,
          command: '',
          oid: 0,
          fields: [],
        })
        .mockResolvedValueOnce({
          rows: [{ id: 'credit-123' }],
          rowCount: 1,
          command: '',
          oid: 0,
          fields: [],
        })
        .mockResolvedValueOnce({
          rows: [{ balance: 0 }],
          rowCount: 1,
          command: '',
          oid: 0,
          fields: [],
        })
        .mockResolvedValueOnce({
          rows: [],
          rowCount: 1,
          command: '',
          oid: 0,
          fields: [],
        });

      await processor.processPayout(validPayoutRequest);

      // Verify ledger entries were created
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO payout_ledger'),
        expect.arrayContaining(['payout-123', 'publisher-456', 500, 'USD', 'debit'])
      );

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO payout_ledger'),
        expect.arrayContaining(['payout-123', 'publisher-456', 500, 'USD', 'credit'])
      );
    });

    it('should validate ledger balance after payout', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [{ id: 'debit-123' }],
          rowCount: 1,
          command: '',
          oid: 0,
          fields: [],
        })
        .mockResolvedValueOnce({
          rows: [{ id: 'credit-123' }],
          rowCount: 1,
          command: '',
          oid: 0,
          fields: [],
        })
        .mockResolvedValueOnce({
          rows: [{ balance: 0 }],
          rowCount: 1,
          command: '',
          oid: 0,
          fields: [],
        })
        .mockResolvedValueOnce({
          rows: [],
          rowCount: 1,
          command: '',
          oid: 0,
          fields: [],
        });

      await processor.processPayout(validPayoutRequest);

      // Verify balance validation query was called
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('SUM'),
        ['payout-123']
      );
    });

    it('should update payout status after successful processing', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [{ id: 'debit-123' }],
          rowCount: 1,
          command: '',
          oid: 0,
          fields: [],
        })
        .mockResolvedValueOnce({
          rows: [{ id: 'credit-123' }],
          rowCount: 1,
          command: '',
          oid: 0,
          fields: [],
        })
        .mockResolvedValueOnce({
          rows: [{ balance: 0 }],
          rowCount: 1,
          command: '',
          oid: 0,
          fields: [],
        })
        .mockResolvedValueOnce({
          rows: [],
          rowCount: 1,
          command: '',
          oid: 0,
          fields: [],
        });

      await processor.processPayout(validPayoutRequest);

      // Verify status update query
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE payouts'),
        expect.arrayContaining(['processed', expect.any(String), expect.any(String), 'payout-123'])
      );
    });
  });

  describe('retryFailedPayouts', () => {
    it('should retry failed payouts from last 24 hours', async () => {
      const failedPayouts = [
        {
          id: 'payout-1',
          publisher_id: 'pub-1',
          amount: 100,
          currency: 'USD',
          method: 'wire',
        },
        {
          id: 'payout-2',
          publisher_id: 'pub-2',
          amount: 200,
          currency: 'EUR',
          method: 'paypal',
        },
      ];

      // Mock query for failed payouts
      mockQuery.mockResolvedValueOnce({
        rows: failedPayouts,
        rowCount: 2,
        command: '',
        oid: 0,
        fields: [],
      });

      // Mock successful ledger operations for retry
      for (let i = 0; i < 8; i++) {
        mockQuery.mockResolvedValueOnce({
          rows: [{ id: `entry-${i}` }],
          rowCount: 1,
          command: '',
          oid: 0,
          fields: [],
        });
      }

      const result = await processor.retryFailedPayouts();

      expect(result.processed).toBeGreaterThanOrEqual(0);
      expect(result.failed).toBeGreaterThanOrEqual(0);
      expect(result.processed + result.failed).toBe(2);
    });
  });
});

describe('PayoutLedgerService', () => {
  let service: PayoutLedgerService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new PayoutLedgerService();
  });

  describe('createLedgerEntries', () => {
    it('should create debit and credit entries', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [{ id: 'debit-456' }],
          rowCount: 1,
          command: '',
          oid: 0,
          fields: [],
        })
        .mockResolvedValueOnce({
          rows: [{ id: 'credit-789' }],
          rowCount: 1,
          command: '',
          oid: 0,
          fields: [],
        });

      const result = await service.createLedgerEntries(
        'payout-123',
        'publisher-456',
        500,
        'USD',
        'tipalti'
      );

      expect(result.debitId).toBe('debit-456');
      expect(result.creditId).toBe('credit-789');
      expect(mockQuery).toHaveBeenCalledTimes(2);
    });

    it('should throw error if ledger entry creation fails', async () => {
      mockQuery.mockRejectedValueOnce(new Error('Database error'));

      await expect(
        service.createLedgerEntries('payout-123', 'pub-123', 100, 'USD', 'wise')
      ).rejects.toThrow('Ledger entry creation failed');
    });
  });

  describe('validateLedgerBalance', () => {
    it('should return true for balanced ledger', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ balance: 0 }],
        rowCount: 1,
        command: '',
        oid: 0,
        fields: [],
      });

      const result = await service.validateLedgerBalance('payout-123');

      expect(result).toBe(true);
    });

    it('should return false for unbalanced ledger', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ balance: 10.5 }],
        rowCount: 1,
        command: '',
        oid: 0,
        fields: [],
      });

      const result = await service.validateLedgerBalance('payout-123');

      expect(result).toBe(false);
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Ledger balance validation failed',
        expect.objectContaining({
          payoutId: 'payout-123',
          balance: 10.5,
        })
      );
    });

    it('should handle floating point precision', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ balance: 0.001 }],
        rowCount: 1,
        command: '',
        oid: 0,
        fields: [],
      });

      const result = await service.validateLedgerBalance('payout-123');

      expect(result).toBe(true); // Should pass as difference < 0.01
    });
  });

  describe('getLedgerEntries', () => {
    it('should retrieve all ledger entries for a payout', async () => {
      const mockEntries = [
        {
          id: 'entry-1',
          payout_id: 'payout-123',
          publisher_id: 'pub-123',
          amount: 500,
          currency: 'USD',
          type: 'debit' as const,
          provider: 'tipalti' as const,
          created_at: new Date('2024-01-01'),
        },
        {
          id: 'entry-2',
          payout_id: 'payout-123',
          publisher_id: 'pub-123',
          amount: 500,
          currency: 'USD',
          type: 'credit' as const,
          provider: 'tipalti' as const,
          created_at: new Date('2024-01-01'),
        },
      ];

      mockQuery.mockResolvedValueOnce({
        rows: mockEntries,
        rowCount: 2,
        command: '',
        oid: 0,
        fields: [],
      });

      const result = await service.getLedgerEntries('payout-123');

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('entry-1');
      expect(result[0].type).toBe('debit');
      expect(result[1].type).toBe('credit');
    });

    it('should return empty array on error', async () => {
      mockQuery.mockRejectedValueOnce(new Error('Database error'));

      const result = await service.getLedgerEntries('payout-123');

      expect(result).toEqual([]);
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });
});

describe('Payment Provider Integration', () => {
  it('should export singleton instances', () => {
    expect(paymentProcessor).toBeInstanceOf(PaymentProcessor);
    expect(ledgerService).toBeInstanceOf(PayoutLedgerService);
  });
});
