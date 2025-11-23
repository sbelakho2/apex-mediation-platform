import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../../middleware/errorHandler';
import {
  getCurrentUsage,
  listInvoices,
  getInvoicePDF,
  reconcileBilling,
  requestMigration,
} from '../billing.controller';

jest.mock('../../services/billing/UsageMeteringService', () => ({
  usageMeteringService: {
    getCurrentPeriodUsage: jest.fn(),
    calculateOverages: jest.fn(),
    getSubscriptionDetails: jest.fn(),
  },
}));

jest.mock('../../services/invoiceService', () => ({
  invoiceService: {
    listInvoices: jest.fn(),
    getInvoice: jest.fn(),
    generateInvoicePDF: jest.fn(),
    generateInvoiceETag: jest.fn(),
  },
}));

jest.mock('../../services/reconciliationService', () => ({
  reconciliationService: {
    checkIdempotencyKey: jest.fn(),
    storeIdempotencyKey: jest.fn(),
    reconcile: jest.fn(),
  },
}));

jest.mock('../../services/billing/migrationAssistantService', () => ({
  migrationAssistantService: {
    createRequest: jest.fn(),
  },
}));

import { usageMeteringService } from '../../services/billing/UsageMeteringService';
import { invoiceService } from '../../services/invoiceService';
import { reconciliationService } from '../../services/reconciliationService';
import { migrationAssistantService } from '../../services/billing/migrationAssistantService';

type MockResponse = Response & {
  status: jest.MockedFunction<Response['status']>;
  json: jest.MockedFunction<Response['json']>;
  setHeader: jest.Mock;
  send: jest.Mock;
  end: jest.Mock;
};

const createMockResponse = (): MockResponse => {
  const res: Partial<MockResponse> = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.setHeader = jest.fn();
  res.send = jest.fn();
  res.end = jest.fn();
  return res as MockResponse;
};

const createMockRequest = (): Partial<Request> & { header: Request['header'] } => {
  const headers: Record<string, string> = {};
  const headerMock = jest.fn((name: string) => {
    const key = name?.toLowerCase?.() ?? name;
    if (key === 'set-cookie') {
      return undefined;
    }
    return headers[key];
  });
  return {
    params: {},
    query: {},
    headers,
    body: {},
    header: headerMock as unknown as Request['header'],
    user: {
      userId: 'user-123',
      publisherId: 'publisher-123',
      email: 'billing@example.com',
    } as any,
  };
};

const mockedUsageMetering = jest.mocked(usageMeteringService);
const mockedInvoiceService = jest.mocked(invoiceService);
const mockedReconciliationService = jest.mocked(reconciliationService);
const mockedMigrationService = jest.mocked(migrationAssistantService);

describe('billing.controller', () => {
  let req: Partial<Request>;
  let res: MockResponse;
  let next: jest.MockedFunction<NextFunction>;

  beforeEach(() => {
    req = createMockRequest();
    res = createMockResponse();
    next = jest.fn();
    jest.clearAllMocks();
  });

  describe('getCurrentUsage', () => {
    it('returns usage details when user is present', async () => {
      const usagePeriodStart = new Date('2025-11-01T00:00:00Z');
      const usagePeriodEnd = new Date('2025-11-30T23:59:59Z');

      mockedUsageMetering.getCurrentPeriodUsage.mockResolvedValue({
        customer_id: 'user-123',
        impressions: 150_000,
        api_calls: 4500,
        data_transfer_gb: 42,
        period_start: usagePeriodStart,
        period_end: usagePeriodEnd,
      } as any);

      mockedUsageMetering.calculateOverages.mockResolvedValue({
        impressions_overage: 5000,
        impressions_overage_cost_cents: 400,
        api_calls_overage: 0,
        api_calls_overage_cost_cents: 0,
        data_transfer_overage_gb: 0,
        data_transfer_overage_cost_cents: 0,
        total_overage_cost_cents: 400,
      });

      mockedUsageMetering.getSubscriptionDetails.mockResolvedValue({
        plan_type: 'studio',
        included_impressions: 200_000,
        included_api_calls: 10_000,
        included_data_transfer_gb: 100,
      });

      await getCurrentUsage(req as Request, res, next);

      expect(mockedUsageMetering.getCurrentPeriodUsage).toHaveBeenCalledWith('user-123');
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            period: {
              start: usagePeriodStart,
              end: usagePeriodEnd,
            },
            plan: 'studio',
          }),
        })
      );
      expect(next).not.toHaveBeenCalled();
    });

    it('passes AppError to next when user is missing', async () => {
      delete (req as any).user;

      await getCurrentUsage(req as Request, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(AppError));
      expect(res.json).not.toHaveBeenCalled();
    });
  });

  describe('listInvoices', () => {
    it('returns invoices with pagination metadata', async () => {
      mockedInvoiceService.listInvoices.mockResolvedValue({
        invoices: [
          {
            id: 'inv-1',
            invoice_number: 'INV-0001',
            customer_id: 'user-123',
            subscription_id: null,
            invoice_date: '2025-11-01T00:00:00Z',
            due_date: '2025-11-15T00:00:00Z',
            amount_cents: 15_000,
            tax_amount_cents: 0,
            total_amount_cents: 15_000,
            currency: 'usd',
            status: 'paid',
            paid_at: '2025-11-05T00:00:00Z',
            stripe_invoice_id: 'stripe-1',
            pdf_url: null,
            line_items: [],
            notes: null,
            created_at: '2025-11-01T01:00:00Z',
            updated_at: '2025-11-05T01:00:00Z',
          },
        ],
        total: 1,
      });

      req.query = { page: '1', limit: '20', status: 'paid' };

      await listInvoices(req as Request, res, next);

      expect(mockedInvoiceService.listInvoices).toHaveBeenCalledWith('user-123', 1, 20, {
        status: 'paid',
        from: undefined,
        to: undefined,
      });
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.arrayContaining([
            expect.objectContaining({ id: 'inv-1' }),
          ]),
          pagination: expect.objectContaining({ page: 1, pages: 1, total: 1 }),
        })
      );
      expect(next).not.toHaveBeenCalled();
    });

    it('rejects invalid pagination input', async () => {
      req.query = { page: '0', limit: '200' };

      await listInvoices(req as Request, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(AppError));
      expect(res.json).not.toHaveBeenCalled();
    });
  });

  describe('getInvoicePDF', () => {
    const baseInvoice = {
      id: 'inv-1',
      invoice_number: 'INV-0001',
      customer_id: 'user-123',
      subscription_id: null,
      invoice_date: '2025-11-01T00:00:00Z',
      due_date: '2025-11-15T00:00:00Z',
      amount_cents: 15_000,
      tax_amount_cents: 0,
      total_amount_cents: 15_000,
      currency: 'usd',
      status: 'paid' as const,
      paid_at: '2025-11-05T00:00:00Z',
      stripe_invoice_id: 'stripe-1',
      pdf_url: null,
      line_items: [],
      notes: null,
      created_at: '2025-11-01T01:00:00Z',
      updated_at: '2025-11-05T01:00:00Z',
    };

    it('streams PDF and sets caching headers', async () => {
      mockedInvoiceService.getInvoice.mockResolvedValue(baseInvoice as any);
      mockedInvoiceService.generateInvoiceETag.mockReturnValue('etag-123');
      const pdfBuffer = Buffer.from('pdf');
      mockedInvoiceService.generateInvoicePDF.mockResolvedValue(pdfBuffer);

      req.params = { id: 'inv-1' };

      await getInvoicePDF(req as Request, res, next);

      expect(mockedInvoiceService.generateInvoicePDF).toHaveBeenCalledWith(baseInvoice);
      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/pdf');
      expect(res.setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        'attachment; filename="invoice-INV-0001.pdf"'
      );
      expect(res.send).toHaveBeenCalledWith(pdfBuffer);
      expect(next).not.toHaveBeenCalled();
    });

    it('returns 304 when client cache is fresh', async () => {
      mockedInvoiceService.getInvoice.mockResolvedValue(baseInvoice as any);
      mockedInvoiceService.generateInvoiceETag.mockReturnValue('etag-123');

      req.params = { id: 'inv-1' };
      req.headers = { 'if-none-match': 'etag-123' };

      await getInvoicePDF(req as Request, res, next);

      expect(res.status).toHaveBeenCalledWith(304);
      expect(res.end).toHaveBeenCalled();
      expect(mockedInvoiceService.generateInvoicePDF).not.toHaveBeenCalled();
      expect(next).not.toHaveBeenCalled();
    });

    it('propagates not-found via AppError', async () => {
      mockedInvoiceService.getInvoice.mockResolvedValue(null as any);
      req.params = { id: 'missing' };

      await getInvoicePDF(req as Request, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(AppError));
      expect(res.send).not.toHaveBeenCalled();
    });
  });

  describe('reconcileBilling', () => {
    const baseResult = {
      reconciliation_id: 'recon_1',
      timestamp: new Date().toISOString(),
      total_subscriptions_checked: 3,
      discrepancies: [
        {
          customer_id: 'user-123',
          stripe_customer_id: 'cus_123',
          internal_usage: 1000,
          stripe_usage: 990,
          difference: 10,
          difference_percentage: 1,
        },
      ],
      total_discrepancy_cents: 100,
      max_tolerated_discrepancy_percentage: 0.5,
      within_tolerance: false,
    };

    it('runs reconciliation when key is new', async () => {
      mockedReconciliationService.checkIdempotencyKey.mockResolvedValue(null);
      mockedReconciliationService.reconcile.mockResolvedValue(baseResult as any);

      (req.headers as any)['idempotency-key'] = 'reconcile-1234567890';

      await reconcileBilling(req as Request, res, next);

      expect(mockedReconciliationService.reconcile).toHaveBeenCalled();
      expect(mockedReconciliationService.storeIdempotencyKey).toHaveBeenCalledWith(
        'reconcile-1234567890',
        baseResult
      );
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, data: baseResult })
      );
      expect(next).not.toHaveBeenCalled();
    });

    it('returns cached result when key already processed', async () => {
      mockedReconciliationService.checkIdempotencyKey.mockResolvedValue(baseResult as any);

      (req.headers as any)['idempotency-key'] = 'reconcile-1234567890';

      await reconcileBilling(req as Request, res, next);

      expect(mockedReconciliationService.reconcile).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: baseResult,
          message: 'Reconciliation already processed',
        })
      );
    });

    it('rejects requests without idempotency key', async () => {
      await reconcileBilling(req as Request, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(AppError));
      expect(mockedReconciliationService.reconcile).not.toHaveBeenCalled();
    });
  });

  describe('requestMigration', () => {
    beforeEach(() => {
      mockedMigrationService.createRequest.mockResolvedValue({
        requestId: 'req-123',
        status: 'queued',
        submittedAt: new Date().toISOString(),
        channel: 'sandbox',
        notesPreview: 'Need to migrate',
      });
    });

    it('queues migration request when payload is valid', async () => {
      req.body = {
        channel: 'production',
        notes: 'Need to migrate billing data next week.',
      };

      await requestMigration(req as Request, res, next);

      expect(mockedMigrationService.createRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          customerId: 'user-123',
          channel: 'production',
          notes: 'Need to migrate billing data next week.',
        })
      );
      expect(res.status).toHaveBeenCalledWith(202);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true })
      );
      expect(next).not.toHaveBeenCalled();
    });

    it('rejects when notes are missing or too short', async () => {
      req.body = { channel: 'sandbox', notes: 'short' };

      await requestMigration(req as Request, res, next);

      expect(mockedMigrationService.createRequest).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalledWith(expect.any(AppError));
    });
  });
});
