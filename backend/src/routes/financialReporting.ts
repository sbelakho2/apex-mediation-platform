/**
 * Financial Reporting Routes
 * 
 * Estonian compliance endpoints for downloading financial reports
 */

import { Router } from 'express';
import { Pool } from 'pg';
import { FinancialReportingController } from '../controllers/FinancialReportingController';
import { authenticate } from '../middleware/auth';

export function createFinancialReportingRoutes(pool: Pool): Router {
  const router = Router();
  const controller = new FinancialReportingController(pool);

  // All routes require authentication
  router.use(authenticate);

  /**
   * Get available fiscal years
   * GET /api/v1/reports/years
   */
  router.get('/years', (req, res) => controller.getAvailableYears(req, res));

  /**
   * Get report summary for a fiscal year
   * GET /api/v1/reports/summary/:year
   */
  router.get('/summary/:year', (req, res) => controller.getReportSummary(req, res));

  /**
   * Download complete transaction log
   * GET /api/v1/reports/transactions/:year
   * 
   * Estonian: 7-year retention (§ 13 Accounting Act)
   */
  router.get('/transactions/:year', (req, res) => controller.downloadTransactionLog(req, res));

  /**
   * Download quarterly VAT report
   * GET /api/v1/reports/vat/:year/:quarter
   * 
   * Estonian: e-MTA submission (due 20 days after quarter end)
   */
  router.get('/vat/:year/:quarter', (req, res) => controller.downloadVATReport(req, res));

  /**
   * Download annual P&L statement
   * GET /api/v1/reports/pnl/:year
   * 
   * Estonian: e-Business Register submission (due March 31)
   */
  router.get('/pnl/:year', (req, res) => controller.downloadAnnualPnL(req, res));

  /**
   * Download cash flow statement
   * GET /api/v1/reports/cashflow/:year
   */
  router.get('/cashflow/:year', (req, res) => controller.downloadCashFlowStatement(req, res));

  /**
   * Download customer revenue report
   * GET /api/v1/reports/customer-revenue/:year
   */
  router.get('/customer-revenue/:year', (req, res) => controller.downloadCustomerRevenue(req, res));

  return router;
}
