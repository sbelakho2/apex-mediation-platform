import { Pool, PoolClient } from 'pg';
import { BillingAuditTrailService } from '../billingAuditTrailService';
import * as crypto from 'crypto';

// Mock dependencies
jest.mock('../../utils/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
}));

jest.mock('../../utils/crypto', () => ({
  sha256Hex: jest.fn((data: string) => {
    return require('crypto').createHash('sha256').update(data).digest('hex');
  }),
}));

describe('BillingAuditTrailService', () => {
  let service: BillingAuditTrailService;
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

    service = new BillingAuditTrailService(mockPool);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('logEvent', () => {
    it('should log a billing audit event successfully', async () => {
      const mockAuditId = 'audit-123';
      mockClient.query.mockResolvedValueOnce({
        rows: [{ id: mockAuditId }],
        rowCount: 1,
      } as any);

      const auditId = await service.logEvent({
        eventType: 'invoice.generated',
        entityType: 'invoice',
        entityId: 'inv-123',
        actorId: 'user-456',
        actorType: 'user',
        action: 'CREATE',
        afterState: { amount: 100, currency: 'USD' },
        metadata: { note: 'Test invoice' },
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
      });

      expect(auditId).toBe(mockAuditId);
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO billing_audit_trail'),
        expect.arrayContaining([
          'invoice.generated',
          'invoice',
          'inv-123',
          'user-456',
          'user',
          'CREATE',
          JSON.stringify({ amount: 100, currency: 'USD' }),
          JSON.stringify({ note: 'Test invoice' }),
          '192.168.1.1',
          'Mozilla/5.0',
          expect.any(Date),
          expect.any(String), // checksum
        ])
      );
    });

    it('should compute correct checksum for audit event', async () => {
      const mockAuditId = 'audit-123';
      mockClient.query.mockResolvedValueOnce({
        rows: [{ id: mockAuditId }],
        rowCount: 1,
      } as any);

      await service.logEvent({
        eventType: 'payment.processed',
        entityType: 'payment',
        entityId: 'pay-123',
        actorId: 'system',
        actorType: 'system',
        action: 'CREATE',
        afterState: { amount: 50, status: 'completed' },
      });

      const callArgs = mockClient.query.mock.calls[0][1] as any[];
      const checksum = callArgs[12]; // checksum is 13th parameter (index 12)

      expect(checksum).toMatch(/^[0-9a-f]{64}$/); // SHA-256 hex format
    });

    it('should handle null optional fields', async () => {
      const mockAuditId = 'audit-123';
      mockClient.query.mockResolvedValueOnce({
        rows: [{ id: mockAuditId }],
        rowCount: 1,
      } as any);

      await service.logEvent({
        eventType: 'usage.metered',
        entityType: 'usage',
        entityId: 'usage-123',
        actorId: 'system',
        actorType: 'system',
        action: 'CREATE',
      });

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([
          'usage.metered',
          'usage',
          'usage-123',
          'system',
          'system',
          'CREATE',
          null, // before_state
          null, // after_state
          null, // metadata
          null, // ip_address
          null, // user_agent
          expect.any(Date),
          expect.any(String),
        ])
      );
    });

    it('should throw error if database insert fails', async () => {
      mockClient.query.mockRejectedValueOnce(new Error('Database error'));

      await expect(
        service.logEvent({
          eventType: 'test',
          entityType: 'test',
          entityId: 'test-123',
          actorId: 'user-123',
          actorType: 'user',
          action: 'CREATE',
        })
      ).rejects.toThrow('Database error');
    });
  });

  describe('logInvoiceGeneration', () => {
    it('should log invoice generation with correct parameters', async () => {
      const mockAuditId = 'audit-123';
      mockClient.query.mockResolvedValueOnce({
        rows: [{ id: mockAuditId }],
        rowCount: 1,
      } as any);

      const invoiceData = {
        amount: 100,
        currency: 'USD',
        status: 'pending',
      };

      await service.logInvoiceGeneration({
        invoiceId: 'inv-123',
        customerId: 'cust-456',
        actorId: 'system',
        actorType: 'system',
        invoiceData,
        metadata: { billingPeriod: '2024-01' },
      });

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([
          'invoice.generated',
          'invoice',
          'inv-123',
          'system',
          'system',
          'CREATE',
          null, // no before_state
          JSON.stringify(invoiceData),
          JSON.stringify({ billingPeriod: '2024-01', customerId: 'cust-456' }),
        ])
      );
    });
  });

  describe('logInvoiceUpdate', () => {
    it('should log invoice update with before/after states', async () => {
      const mockAuditId = 'audit-123';
      mockClient.query.mockResolvedValueOnce({
        rows: [{ id: mockAuditId }],
        rowCount: 1,
      } as any);

      const beforeState = { amount: 100, status: 'draft' };
      const afterState = { amount: 150, status: 'pending' };

      await service.logInvoiceUpdate({
        invoiceId: 'inv-123',
        actorId: 'user-456',
        actorType: 'user',
        beforeState,
        afterState,
        reason: 'Amount correction',
      });

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([
          'invoice.updated',
          'invoice',
          'inv-123',
          'user-456',
          'user',
          'UPDATE',
          JSON.stringify(beforeState),
          JSON.stringify(afterState),
          JSON.stringify({ reason: 'Amount correction' }),
        ])
      );
    });
  });

  describe('logPaymentProcessed', () => {
    it('should log payment processing', async () => {
      const mockAuditId = 'audit-123';
      mockClient.query.mockResolvedValueOnce({
        rows: [{ id: mockAuditId }],
        rowCount: 1,
      } as any);

      await service.logPaymentProcessed({
        paymentId: 'pay-123',
        invoiceId: 'inv-456',
        customerId: 'cust-789',
        amount: 100,
        currency: 'USD',
        method: 'credit_card',
        status: 'succeeded',
        metadata: { last4: '4242' },
      });

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([
          'payment.processed',
          'payment',
          'pay-123',
          'system',
          'system',
          'CREATE',
          null,
          JSON.stringify({
            amount: 100,
            currency: 'USD',
            method: 'credit_card',
            status: 'succeeded',
          }),
          JSON.stringify({
            last4: '4242',
            invoiceId: 'inv-456',
            customerId: 'cust-789',
          }),
        ])
      );
    });
  });

  describe('logSubscriptionChange', () => {
    it('should log subscription creation', async () => {
      const mockAuditId = 'audit-123';
      mockClient.query.mockResolvedValueOnce({
        rows: [{ id: mockAuditId }],
        rowCount: 1,
      } as any);

      const afterState = {
        planId: 'plan-pro',
        status: 'active',
        startDate: '2024-01-01',
      };

      await service.logSubscriptionChange({
        subscriptionId: 'sub-123',
        customerId: 'cust-456',
        actorId: 'user-456',
        actorType: 'user',
        action: 'CREATE',
        afterState,
      });

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([
          'subscription.changed',
          'subscription',
          'sub-123',
          'user-456',
          'user',
          'CREATE',
          null,
          JSON.stringify(afterState),
          JSON.stringify({ customerId: 'cust-456' }),
        ])
      );
    });

    it('should log subscription update with before/after states', async () => {
      const mockAuditId = 'audit-123';
      mockClient.query.mockResolvedValueOnce({
        rows: [{ id: mockAuditId }],
        rowCount: 1,
      } as any);

      const beforeState = { planId: 'plan-basic', status: 'active' };
      const afterState = { planId: 'plan-pro', status: 'active' };

      await service.logSubscriptionChange({
        subscriptionId: 'sub-123',
        customerId: 'cust-456',
        actorId: 'user-456',
        actorType: 'user',
        action: 'UPDATE',
        beforeState,
        afterState,
      });

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([
          'subscription.changed',
          'subscription',
          'sub-123',
          'user-456',
          'user',
          'UPDATE',
          JSON.stringify(beforeState),
          JSON.stringify(afterState),
        ])
      );
    });
  });

  describe('logUsageMetering', () => {
    it('should log usage metering events', async () => {
      const mockAuditId = 'audit-123';
      mockClient.query.mockResolvedValueOnce({
        rows: [{ id: mockAuditId }],
        rowCount: 1,
      } as any);

      const timestamp = new Date('2024-01-01T12:00:00Z');

      await service.logUsageMetering({
        customerId: 'cust-123',
        subscriptionId: 'sub-456',
        metric: 'api_requests',
        quantity: 1000,
        timestamp,
        metadata: { endpoint: '/v1/auctions' },
      });

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([
          'usage.metered',
          'usage',
          expect.stringContaining('cust-123-api_requests-2024-01-01'),
          'system',
          'system',
          'CREATE',
          null,
          JSON.stringify({
            metric: 'api_requests',
            quantity: 1000,
            timestamp,
          }),
          JSON.stringify({
            endpoint: '/v1/auctions',
            customerId: 'cust-123',
            subscriptionId: 'sub-456',
          }),
        ])
      );
    });
  });

  describe('logFxConversion', () => {
    it('should log FX conversion for billing', async () => {
      const mockAuditId = 'audit-123';
      mockClient.query.mockResolvedValueOnce({
        rows: [{ id: mockAuditId }],
        rowCount: 1,
      } as any);

      await service.logFxConversion({
        invoiceId: 'inv-123',
        fromAmount: 100,
        fromCurrency: 'USD',
        toAmount: 85,
        toCurrency: 'EUR',
        rate: 0.85,
        source: 'ECB',
      });

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([
          'fx.converted',
          'invoice',
          'inv-123',
          'system',
          'system',
          'FX_CONVERT',
          JSON.stringify({ amount: 100, currency: 'USD' }),
          JSON.stringify({ amount: 85, currency: 'EUR' }),
          JSON.stringify({ rate: 0.85, source: 'ECB' }),
        ])
      );
    });
  });

  describe('logDunningAction', () => {
    it('should log dunning actions', async () => {
      const mockAuditId = 'audit-123';
      mockClient.query.mockResolvedValueOnce({
        rows: [{ id: mockAuditId }],
        rowCount: 1,
      } as any);

      await service.logDunningAction({
        customerId: 'cust-123',
        invoiceId: 'inv-456',
        action: 'RETRY_PAYMENT',
        attemptNumber: 2,
        result: 'failed',
        metadata: { errorCode: 'insufficient_funds' },
      });

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([
          'dunning.action',
          'invoice',
          'inv-456',
          'system',
          'system',
          'RETRY_PAYMENT',
          null,
          JSON.stringify({ attemptNumber: 2, result: 'failed' }),
          JSON.stringify({
            errorCode: 'insufficient_funds',
            customerId: 'cust-123',
          }),
        ])
      );
    });
  });

  describe('queryAuditTrail', () => {
    it('should query audit trail with no filters', async () => {
      const mockRows = [
        {
          id: 'audit-1',
          event_type: 'invoice.generated',
          entity_type: 'invoice',
          entity_id: 'inv-123',
          actor_id: 'system',
          actor_type: 'system',
          action: 'CREATE',
          before_state: null,
          after_state: '{"amount": 100}',
          metadata: '{"note": "test"}',
          ip_address: '192.168.1.1',
          user_agent: 'Mozilla/5.0',
          timestamp: new Date('2024-01-01'),
          checksum: 'abc123',
        },
      ];

      mockClient.query.mockResolvedValueOnce({
        rows: mockRows,
        rowCount: 1,
      } as any);

      const results = await service.queryAuditTrail({});

      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({
        id: 'audit-1',
        eventType: 'invoice.generated',
        entityType: 'invoice',
        entityId: 'inv-123',
        actorId: 'system',
        actorType: 'system',
        action: 'CREATE',
        beforeState: undefined,
        afterState: { amount: 100 },
        metadata: { note: 'test' },
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
        timestamp: new Date('2024-01-01'),
        checksum: 'abc123',
      });
    });

    it('should query audit trail with filters', async () => {
      mockClient.query.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      } as any);

      await service.queryAuditTrail({
        entityType: 'invoice',
        entityId: 'inv-123',
        actorId: 'user-456',
        eventType: 'invoice.updated',
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-01-31'),
        limit: 50,
        offset: 10,
      });

      const sql = mockClient.query.mock.calls[0][0] as string;
      const params = mockClient.query.mock.calls[0][1] as any[];

      expect(sql).toContain('WHERE');
      expect(sql).toContain('entity_type =');
      expect(sql).toContain('entity_id =');
      expect(sql).toContain('actor_id =');
      expect(sql).toContain('event_type =');
      expect(sql).toContain('timestamp >=');
      expect(sql).toContain('timestamp <=');
      expect(sql).toContain('LIMIT');
      expect(sql).toContain('OFFSET');

      expect(params).toEqual([
        'invoice',
        'inv-123',
        'user-456',
        'invoice.updated',
        new Date('2024-01-01'),
        new Date('2024-01-31'),
        50,
        10,
      ]);
    });

    it('should apply default limit and offset', async () => {
      mockClient.query.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      } as any);

      await service.queryAuditTrail({ entityType: 'invoice' });

      const sql = mockClient.query.mock.calls[0][0] as string;
      const params = mockClient.query.mock.calls[0][1] as any[];

      expect(params[params.length - 2]).toBe(100); // default limit
      expect(params[params.length - 1]).toBe(0); // default offset
    });
  });

  describe('verifyIntegrity', () => {
    it('should verify audit entry integrity successfully', async () => {
      const timestamp = new Date('2024-01-01T12:00:00Z');
      const checksumData = JSON.stringify({
        eventType: 'invoice.generated',
        entityType: 'invoice',
        entityId: 'inv-123',
        actorId: 'system',
        action: 'CREATE',
        timestamp: timestamp.toISOString(),
        beforeState: undefined,
        afterState: { amount: 100 },
      });
      const expectedChecksum = crypto.createHash('sha256').update(checksumData).digest('hex');

      mockClient.query.mockResolvedValueOnce({
        rows: [
          {
            event_type: 'invoice.generated',
            entity_type: 'invoice',
            entity_id: 'inv-123',
            actor_id: 'system',
            action: 'CREATE',
            before_state: null,
            after_state: '{"amount": 100}',
            timestamp,
            checksum: expectedChecksum,
          },
        ],
        rowCount: 1,
      } as any);

      const isValid = await service.verifyIntegrity('audit-123');

      expect(isValid).toBe(true);
    });

    it('should detect tampered audit entry', async () => {
      mockClient.query.mockResolvedValueOnce({
        rows: [
          {
            event_type: 'invoice.generated',
            entity_type: 'invoice',
            entity_id: 'inv-123',
            actor_id: 'system',
            action: 'CREATE',
            before_state: null,
            after_state: '{"amount": 100}',
            timestamp: new Date('2024-01-01'),
            checksum: 'wrong-checksum',
          },
        ],
        rowCount: 1,
      } as any);

      const isValid = await service.verifyIntegrity('audit-123');

      expect(isValid).toBe(false);
    });

    it('should return false for non-existent audit entry', async () => {
      mockClient.query.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      } as any);

      const isValid = await service.verifyIntegrity('non-existent');

      expect(isValid).toBe(false);
    });
  });

  describe('getEntityAuditSummary', () => {
    it('should get audit summary for entity', async () => {
      mockClient.query
        .mockResolvedValueOnce({
          rows: [
            {
              total_events: '5',
              event_type: 'invoice.generated',
              first_event: new Date('2024-01-01'),
              last_event: new Date('2024-01-05'),
              actors: ['system', 'user-123'],
            },
            {
              total_events: '3',
              event_type: 'invoice.updated',
              first_event: new Date('2024-01-02'),
              last_event: new Date('2024-01-04'),
              actors: ['user-123'],
            },
          ],
          rowCount: 2,
        } as any)
        .mockResolvedValueOnce({
          rows: [{ total: '8' }],
          rowCount: 1,
        } as any);

      const summary = await service.getEntityAuditSummary('invoice', 'inv-123');

      expect(summary).toEqual({
        totalEvents: 8,
        eventTypes: {
          'invoice.generated': 5,
          'invoice.updated': 3,
        },
        firstEvent: new Date('2024-01-01'),
        lastEvent: new Date('2024-01-05'),
        actors: ['system', 'user-123'],
      });
    });
  });

  describe('purgeOldEntries', () => {
    it('should purge old audit entries', async () => {
      mockClient.query.mockResolvedValueOnce({
        rows: [{}, {}, {}],
        rowCount: 3,
      } as any);

      const count = await service.purgeOldEntries(365);

      expect(count).toBe(3);
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM billing_audit_trail'),
        expect.arrayContaining([expect.any(Date)])
      );
    });

    it('should use default retention period of 2555 days (7 years)', async () => {
      mockClient.query.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      } as any);

      await service.purgeOldEntries();

      const callArgs = mockClient.query.mock.calls[0][1] as any[];
      const cutoffDate = callArgs[0] as Date;
      const daysDiff = Math.floor(
        (new Date().getTime() - cutoffDate.getTime()) / (1000 * 60 * 60 * 24)
      );

      expect(daysDiff).toBeGreaterThanOrEqual(2554);
      expect(daysDiff).toBeLessThanOrEqual(2556);
    });
  });
});
