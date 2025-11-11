/**
 * Unit tests for billing.controller.ts
 * 
 * Tests all billing API endpoints:
 * - GET /billing/usage/current
 * - GET /billing/invoices
 * - GET /billing/invoices/:id/pdf
 * - POST /billing/reconcile
 */

import { Request, Response } from 'express';
import { getCurrentUsage, listInvoices, getInvoicePDF, reconcileBilling } from '../../controllers/billing.controller';

// Mock dependencies
jest.mock('../../services/usageMeteringService');
jest.mock('../../services/invoiceService');
jest.mock('../../services/reconciliationService');

import { UsageMeteringService } from '../../services/usageMeteringService';
import { InvoiceService } from '../../services/invoiceService';
import { ReconciliationService } from '../../services/reconciliationService';

describe('Billing Controller', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockUsageMeteringService: jest.Mocked<UsageMeteringService>;
  let mockInvoiceService: jest.Mocked<InvoiceService>;
  let mockReconciliationService: jest.Mocked<ReconciliationService>;

  beforeEach(() => {
    mockRequest = {
      query: {},
      params: {},
      headers: {},
      user: { id: 'user-123', organizationId: 'org-123' },
    };

    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
    };

    mockUsageMeteringService = {
      getCurrentUsage: jest.fn(),
    } as any;

    mockInvoiceService = {
      listInvoices: jest.fn(),
      generateInvoicePDF: jest.fn(),
    } as any;

    mockReconciliationService = {
      reconcile: jest.fn(),
      checkIdempotencyKey: jest.fn(),
    } as any;
  });

  describe('getCurrentUsage', () => {
    it('should return current usage with 200 status', async () => {
      const mockUsageData = {
        current_period: {
          start: '2025-11-01T00:00:00Z',
          end: '2025-11-30T23:59:59Z',
        },
        usage: {
          impressions: 150000,
          clicks: 4500,
          videostarts: 2000,
        },
        limits: {
          impressions: 200000,
          clicks: 10000,
          videostarts: 5000,
        },
        overages: {
          impressions: 0,
          clicks: 0,
          videostarts: 0,
        },
      };

      mockUsageMeteringService.getCurrentUsage.mockResolvedValue(mockUsageData);
      mockRequest.query = { organizationId: 'org-123' };

      await getCurrentUsage(
        mockRequest as Request,
        mockResponse as Response,
        mockUsageMeteringService
      );

      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith(mockUsageData);
    });

    it('should return 400 if organizationId is missing', async () => {
      mockRequest.query = {};

      await getCurrentUsage(
        mockRequest as Request,
        mockResponse as Response,
        mockUsageMeteringService
      );

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'bad_request',
          message: expect.stringContaining('organizationId'),
        })
      );
    });

    it('should return 404 if organization not found', async () => {
      mockUsageMeteringService.getCurrentUsage.mockRejectedValue(
        new Error('Organization not found')
      );
      mockRequest.query = { organizationId: 'org-999' };

      await getCurrentUsage(
        mockRequest as Request,
        mockResponse as Response,
        mockUsageMeteringService
      );

      expect(mockResponse.status).toHaveBeenCalledWith(404);
    });

    it('should handle overages correctly', async () => {
      const mockUsageDataWithOverages = {
        current_period: {
          start: '2025-11-01T00:00:00Z',
          end: '2025-11-30T23:59:59Z',
        },
        usage: {
          impressions: 250000,
          clicks: 12000,
          videostarts: 2000,
        },
        limits: {
          impressions: 200000,
          clicks: 10000,
          videostarts: 5000,
        },
        overages: {
          impressions: 50000,
          clicks: 2000,
          videostarts: 0,
        },
        overage_amount: 7500, // $75.00 in cents
      };

      mockUsageMeteringService.getCurrentUsage.mockResolvedValue(
        mockUsageDataWithOverages
      );
      mockRequest.query = { organizationId: 'org-123' };

      await getCurrentUsage(
        mockRequest as Request,
        mockResponse as Response,
        mockUsageMeteringService
      );

      expect(mockResponse.status).toHaveBeenCalledWith(200);
      const response = (mockResponse.json as jest.Mock).mock.calls[0][0];
      expect(response.overages.impressions).toBe(50000);
      expect(response.overages.clicks).toBe(2000);
      expect(response.overage_amount).toBe(7500);
    });
  });

  describe('listInvoices', () => {
    it('should return paginated invoices with 200 status', async () => {
      const mockInvoices = {
        invoices: [
          {
            id: 'in_123',
            number: 'INV-2025-001',
            status: 'paid',
            amount_due: 12500,
            amount_paid: 12500,
            currency: 'usd',
            created: '2025-11-01T00:00:00Z',
          },
        ],
        pagination: {
          current_page: 1,
          total_pages: 1,
          total_count: 1,
          has_more: false,
        },
      };

      mockInvoiceService.listInvoices.mockResolvedValue(mockInvoices);
      mockRequest.query = {
        organizationId: 'org-123',
        page: '1',
        limit: '20',
      };

      await listInvoices(
        mockRequest as Request,
        mockResponse as Response,
        mockInvoiceService
      );

      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith(mockInvoices);
    });

    it('should handle status filter', async () => {
      mockRequest.query = {
        organizationId: 'org-123',
        status: 'open',
      };

      await listInvoices(
        mockRequest as Request,
        mockResponse as Response,
        mockInvoiceService
      );

      expect(mockInvoiceService.listInvoices).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'open' })
      );
    });

    it('should validate pagination parameters', async () => {
      mockRequest.query = {
        organizationId: 'org-123',
        page: '0', // Invalid: must be >= 1
        limit: '200', // Invalid: max is 100
      };

      await listInvoices(
        mockRequest as Request,
        mockResponse as Response,
        mockInvoiceService
      );

      expect(mockResponse.status).toHaveBeenCalledWith(400);
    });

    it('should validate status enum', async () => {
      mockRequest.query = {
        organizationId: 'org-123',
        status: 'invalid_status',
      };

      await listInvoices(
        mockRequest as Request,
        mockResponse as Response,
        mockInvoiceService
      );

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('status'),
        })
      );
    });
  });

  describe('getInvoicePDF', () => {
    it('should stream PDF with correct headers', async () => {
      const mockPDFStream = Buffer.from('PDF_CONTENT');
      const mockETag = 'etag-123';

      mockInvoiceService.generateInvoicePDF.mockResolvedValue({
        stream: mockPDFStream,
        etag: mockETag,
      });

      mockRequest.params = { id: 'in_123' };

      await getInvoicePDF(
        mockRequest as Request,
        mockResponse as Response,
        mockInvoiceService
      );

      expect(mockResponse.set).toHaveBeenCalledWith('Content-Type', 'application/pdf');
      expect(mockResponse.set).toHaveBeenCalledWith('ETag', mockETag);
      expect(mockResponse.set).toHaveBeenCalledWith(
        'Content-Disposition',
        'attachment; filename="invoice-in_123.pdf"'
      );
      expect(mockResponse.send).toHaveBeenCalledWith(mockPDFStream);
    });

    it('should return 304 if ETag matches', async () => {
      const mockETag = 'etag-123';
      mockRequest.params = { id: 'in_123' };
      mockRequest.headers = { 'if-none-match': mockETag };

      mockInvoiceService.generateInvoicePDF.mockResolvedValue({
        stream: Buffer.from(''),
        etag: mockETag,
      });

      await getInvoicePDF(
        mockRequest as Request,
        mockResponse as Response,
        mockInvoiceService
      );

      expect(mockResponse.status).toHaveBeenCalledWith(304);
      expect(mockResponse.send).toHaveBeenCalledWith();
    });

    it('should return 404 if invoice not found', async () => {
      mockInvoiceService.generateInvoicePDF.mockRejectedValue(
        new Error('Invoice not found')
      );
      mockRequest.params = { id: 'in_999' };

      await getInvoicePDF(
        mockRequest as Request,
        mockResponse as Response,
        mockInvoiceService
      );

      expect(mockResponse.status).toHaveBeenCalledWith(404);
    });
  });

  describe('reconcileBilling', () => {
    it('should reconcile successfully with idempotency key', async () => {
      const mockReconcileResult = {
        status: 'completed',
        summary: {
          impressions_stripe: 100000,
          impressions_clickhouse: 100000,
          clicks_stripe: 3000,
          clicks_clickhouse: 3001,
        },
        discrepancies: [
          {
            metric: 'clicks',
            stripe_value: 3000,
            clickhouse_value: 3001,
            diff: 1,
            diff_percent: 0.033,
          },
        ],
        audit_log_id: 'audit_123',
      };

      mockReconciliationService.checkIdempotencyKey.mockResolvedValue(null);
      mockReconciliationService.reconcile.mockResolvedValue(mockReconcileResult);

      mockRequest.body = {
        organization_id: 'org-123',
        period_start: '2025-11-01T00:00:00Z',
        period_end: '2025-11-30T23:59:59Z',
      };
      mockRequest.headers = {
        'idempotency-key': 'reconcile-org-123-2025-11',
      };

      await reconcileBilling(
        mockRequest as Request,
        mockResponse as Response,
        mockReconciliationService
      );

      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith(mockReconcileResult);
    });

    it('should return cached result for duplicate idempotency key', async () => {
      const cachedResult = { status: 'completed', cached: true };
      mockReconciliationService.checkIdempotencyKey.mockResolvedValue(cachedResult);

      mockRequest.body = {
        organization_id: 'org-123',
        period_start: '2025-11-01T00:00:00Z',
        period_end: '2025-11-30T23:59:59Z',
      };
      mockRequest.headers = {
        'idempotency-key': 'reconcile-org-123-2025-11',
      };

      await reconcileBilling(
        mockRequest as Request,
        mockResponse as Response,
        mockReconciliationService
      );

      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith(cachedResult);
      expect(mockReconciliationService.reconcile).not.toHaveBeenCalled();
    });

    it('should require idempotency key header', async () => {
      mockRequest.body = {
        organization_id: 'org-123',
        period_start: '2025-11-01T00:00:00Z',
        period_end: '2025-11-30T23:59:59Z',
      };
      mockRequest.headers = {}; // No idempotency key

      await reconcileBilling(
        mockRequest as Request,
        mockResponse as Response,
        mockReconciliationService
      );

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('Idempotency-Key'),
        })
      );
    });

    it('should validate idempotency key length (min 16 chars)', async () => {
      mockRequest.body = {
        organization_id: 'org-123',
        period_start: '2025-11-01T00:00:00Z',
        period_end: '2025-11-30T23:59:59Z',
      };
      mockRequest.headers = {
        'idempotency-key': 'short', // Too short
      };

      await reconcileBilling(
        mockRequest as Request,
        mockResponse as Response,
        mockReconciliationService
      );

      expect(mockResponse.status).toHaveBeenCalledWith(400);
    });

    it('should validate date formats', async () => {
      mockRequest.body = {
        organization_id: 'org-123',
        period_start: 'invalid-date',
        period_end: '2025-11-30T23:59:59Z',
      };
      mockRequest.headers = {
        'idempotency-key': 'reconcile-org-123-2025-11',
      };

      await reconcileBilling(
        mockRequest as Request,
        mockResponse as Response,
        mockReconciliationService
      );

      expect(mockResponse.status).toHaveBeenCalledWith(400);
    });
  });
});
