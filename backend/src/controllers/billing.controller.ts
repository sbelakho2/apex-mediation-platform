// Types are augmented via ../types/express.d.ts; no triple-slash needed
import { Request, Response, NextFunction } from 'express';
import { AppError } from '../middleware/errorHandler';
import { logger } from '../utils/logger';
import { usageMeteringService } from '../services/billing/UsageMeteringService';
import { invoiceService } from '../services/invoiceService';
import { reconciliationService } from '../services/reconciliationService';
import { migrationAssistantService } from '../services/billing/migrationAssistantService';
import { revenueShareService } from '../services/billing/revenueShareService';

/**
 * GET /api/v1/billing/usage/current
 * Returns current billing period usage with overage calculations
 */
export const getCurrentUsage = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const customerId = req.user?.userId;
    
    if (!customerId) {
      throw new AppError('User not authenticated', 401);
    }

    // Get usage metrics
    const usage = await usageMeteringService.getCurrentPeriodUsage(customerId);
    
    // Get overage calculations
    const overages = await usageMeteringService.calculateOverages(customerId);
    
    // Get subscription details for plan limits
    const subscription = await usageMeteringService.getSubscriptionDetails(customerId);

    res.json({
      success: true,
      data: {
        period: {
          start: usage.period_start,
          end: usage.period_end,
        },
        plan: subscription.plan_type,
        usage: {
          impressions: usage.impressions,
          api_calls: usage.api_calls,
          data_transfer_gb: usage.data_transfer_gb,
        },
        limits: {
          impressions: subscription.included_impressions,
          api_calls: subscription.included_api_calls || 0,
          data_transfer_gb: subscription.included_data_transfer_gb || 0,
        },
        overages: {
          impressions: overages.impressions_overage,
          impressions_cost_cents: overages.impressions_overage_cost_cents,
          api_calls: overages.api_calls_overage,
          api_calls_cost_cents: overages.api_calls_overage_cost_cents,
          data_transfer_gb: overages.data_transfer_overage_gb,
          data_transfer_cost_cents: overages.data_transfer_overage_cost_cents,
          total_cost_cents: overages.total_overage_cost_cents,
        },
      },
    });
  } catch (error) {
    logger.error('Error fetching current usage', { error, userId: req.user?.userId });
    next(error);
  }
};

/**
 * GET /api/v1/billing/invoices
 * List invoices with pagination and filtering
 */
export const listInvoices = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const customerId = req.user?.userId;
    
    if (!customerId) {
      throw new AppError('User not authenticated', 401);
    }

    const { status, from, to, page = '1', limit = '20' } = req.query;
    
    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);
    
    if (isNaN(pageNum) || pageNum < 1) {
      throw new AppError('Invalid page number', 400);
    }
    
    if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
      throw new AppError('Invalid limit (must be 1-100)', 400);
    }

    const filters = {
      status: status as string | undefined,
      from: from as string | undefined,
      to: to as string | undefined,
    };

    const result = await invoiceService.listInvoices(customerId, pageNum, limitNum, filters);

    res.json({
      success: true,
      data: result.invoices,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: result.total,
        pages: Math.ceil(result.total / limitNum),
      },
    });
  } catch (error) {
    logger.error('Error listing invoices', { error, userId: req.user?.userId });
    next(error);
  }
};

/**
 * GET /api/v1/billing/invoices/:id
 * Get specific invoice details
 */
export const getInvoice = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const customerId = req.user?.userId;
    const { id } = req.params;
    
    if (!customerId) {
      throw new AppError('User not authenticated', 401);
    }

    const invoice = await invoiceService.getInvoice(id, customerId);
    
    if (!invoice) {
      throw new AppError('Invoice not found', 404);
    }

    res.json({
      success: true,
      data: invoice,
    });
  } catch (error) {
    logger.error('Error fetching invoice', { error, userId: req.user?.userId, invoiceId: req.params.id });
    next(error);
  }
};

/**
 * GET /api/v1/billing/invoices/:id/pdf
 * Stream invoice PDF
 */
export const getInvoicePDF = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const customerId = req.user?.userId;
    const { id } = req.params;
    
    if (!customerId) {
      throw new AppError('User not authenticated', 401);
    }

    const invoice = await invoiceService.getInvoice(id, customerId);
    
    if (!invoice) {
      throw new AppError('Invoice not found', 404);
    }

    // Generate ETag from invoice data
    const etag = invoiceService.generateInvoiceETag(invoice);
    
    // Check if client has cached version
    if (req.headers['if-none-match'] === etag) {
      res.status(304).end();
      return;
    }

    // Generate PDF
    const pdfBuffer = await invoiceService.generateInvoicePDF(invoice);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="invoice-${invoice.invoice_number}.pdf"`);
    res.setHeader('ETag', etag);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.send(pdfBuffer);
  } catch (error) {
    logger.error('Error generating invoice PDF', { error, userId: req.user?.userId, invoiceId: req.params.id });
    next(error);
  }
};

/**
 * POST /api/v1/billing/migration/request
 * Capture billing migration context for ops to review
 */
export const requestMigration = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const customerId = req.user?.userId;

    if (!customerId) {
      throw new AppError('User not authenticated', 401);
    }

    const { channel, notes } = req.body || {};

    if (typeof notes !== 'string' || notes.trim().length < 20) {
      throw new AppError('Provide migration notes with at least 20 characters of context.', 400);
    }

    const targetChannel = channel === 'production' ? 'production' : 'sandbox';

    const request = await migrationAssistantService.createRequest({
      customerId,
      accountEmail: req.user?.email ?? null,
      channel: targetChannel,
      notes: notes.trim(),
    });

    res.status(202).json({
      success: true,
      data: request,
    });
  } catch (error) {
    logger.error('Error handling billing migration request', {
      error,
      userId: req.user?.userId,
    });
    next(error);
  }
};

/**
 * POST /api/v1/billing/reconcile
 * Trigger billing reconciliation (admin only)
 */
export const reconcileBilling = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Enforce header-based idempotency per FIX-11 (648)
    const idempotencyKeyHeader = req.header('Idempotency-Key') || req.header('idempotency-key');
    const idempotencyKey = idempotencyKeyHeader?.trim();

    if (!idempotencyKey) {
      throw new AppError('Idempotency-Key header required', 400);
    }

    // Check if already processed
    const existing = await reconciliationService.checkIdempotencyKey(idempotencyKey);
    if (existing) {
      res.json({
        success: true,
        data: existing,
        message: 'Reconciliation already processed',
      });
      return;
    }

    // Run reconciliation
    const result = await reconciliationService.reconcile();
    
    // Store idempotency record
    await reconciliationService.storeIdempotencyKey(idempotencyKey, result);
    
    // Emit audit event
    logger.info('Billing reconciliation triggered', {
      actor: req.user?.email,
      result,
      idempotencyKey,
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error('Error during billing reconciliation', { error, user: req.user });
    next(error);
  }
};

/**
 * POST /api/v1/billing/revenue-share/calculate
 * Calculate revenue share with marginal tier breakdown
 */
export const calculateRevenueShare = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { gross_revenue_cents, is_ctv = false } = req.body;

    if (typeof gross_revenue_cents !== 'number' || gross_revenue_cents < 0) {
      throw new AppError('Invalid gross_revenue_cents (must be non-negative number)', 400);
    }

    const calculation = revenueShareService.calculateRevenueShare(
      gross_revenue_cents,
      Boolean(is_ctv)
    );

    res.json({
      success: true,
      data: calculation,
    });
  } catch (error) {
    logger.error('Error calculating revenue share', { error, body: req.body });
    next(error);
  }
};

/**
 * GET /api/v1/billing/tiers
 * Get revenue share tier configuration
 */
export const getTiers = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const tiers = revenueShareService.getTiers();
    const ctvPremium = revenueShareService.getCTVPremium();

    res.json({
      success: true,
      data: {
        tiers,
        ctv_premium_points: ctvPremium,
        note: 'CTV/web video adds +2pp to each tier rate',
      },
    });
  } catch (error) {
    logger.error('Error fetching tier configs', { error });
    next(error);
  }
};
