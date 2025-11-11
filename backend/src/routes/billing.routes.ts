import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { requireFeature } from '../utils/featureFlags';
import * as billingController from '../controllers/billing.controller';

const router = Router();

// All billing endpoints require billing feature to be enabled
router.use(requireFeature('billingEnabled'));

// All billing endpoints require authentication
router.use(authenticate);

/**
 * GET /api/v1/billing/usage/current
 * Get current billing period usage for authenticated user
 */
router.get('/usage/current', billingController.getCurrentUsage);

/**
 * GET /api/v1/billing/invoices
 * List invoices for authenticated user with pagination and filters
 */
router.get('/invoices', billingController.listInvoices);

/**
 * GET /api/v1/billing/invoices/:id
 * Get specific invoice details
 */
router.get('/invoices/:id', billingController.getInvoice);

/**
 * GET /api/v1/billing/invoices/:id/pdf
 * Download invoice as PDF
 */
router.get('/invoices/:id/pdf', billingController.getInvoicePDF);

/**
 * POST /api/v1/billing/reconcile
 * Trigger billing reconciliation (admin only)
 */
router.post(
  '/reconcile',
  authorize(['admin']),
  billingController.reconcileBilling
);

export default router;
