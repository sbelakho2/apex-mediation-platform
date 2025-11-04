/**
 * Financial Reporting Controller
 * 
 * API endpoints for Estonian compliance reporting:
 * - GET /api/v1/reports/transactions/:year - Download transaction log Excel
 * - GET /api/v1/reports/vat/:year/:quarter - Download VAT report Excel
 * - GET /api/v1/reports/pnl/:year - Download P&L statement Excel
 * - GET /api/v1/reports/cashflow/:year - Download cash flow statement Excel
 * - GET /api/v1/reports/customer-revenue/:year - Download customer revenue Excel
 */

import { Request, Response } from 'express';
import { Pool } from 'pg';
import { FinancialReportingService } from '../services/FinancialReportingService';

export class FinancialReportingController {
  private reportingService: FinancialReportingService;

  constructor(pool: Pool) {
    this.reportingService = new FinancialReportingService(pool);
  }

  /**
   * Download complete transaction log for a fiscal year
   * GET /api/v1/reports/transactions/:year
   * 
   * Estonian Requirement: 7-year retention (§ 13 Accounting Act)
   * 
   * Query params:
   *   - format: 'excel' (default) | 'csv' (future)
   */
  async downloadTransactionLog(req: Request, res: Response): Promise<void> {
    try {
      const fiscalYear = parseInt(req.params.year, 10);

      if (isNaN(fiscalYear) || fiscalYear < 2020 || fiscalYear > 2100) {
        res.status(400).json({ error: 'Invalid fiscal year' });
        return;
      }

      const buffer = await this.reportingService.exportTransactionLog(fiscalYear);

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="transaction_log_${fiscalYear}.xlsx"`);
      res.send(buffer);
    } catch (error) {
      console.error('[FinancialReporting] Error exporting transaction log:', error);
      res.status(500).json({ 
        error: 'Failed to generate transaction log',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Download quarterly VAT report for e-MTA submission
   * GET /api/v1/reports/vat/:year/:quarter
   * 
   * Estonian Requirement: Quarterly VAT reports due within 20 days after quarter end
   * Submitted to: e-Tax Board (e-MTA)
   * 
   * Path params:
   *   - year: Fiscal year (e.g., 2025)
   *   - quarter: 1, 2, 3, or 4
   */
  async downloadVATReport(req: Request, res: Response): Promise<void> {
    try {
      const fiscalYear = parseInt(req.params.year, 10);
      const quarter = parseInt(req.params.quarter, 10);

      if (isNaN(fiscalYear) || fiscalYear < 2020 || fiscalYear > 2100) {
        res.status(400).json({ error: 'Invalid fiscal year' });
        return;
      }

      if (isNaN(quarter) || quarter < 1 || quarter > 4) {
        res.status(400).json({ error: 'Quarter must be 1, 2, 3, or 4' });
        return;
      }

      const buffer = await this.reportingService.exportVATReport(fiscalYear, quarter);

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="vat_report_${fiscalYear}_Q${quarter}.xlsx"`);
      res.send(buffer);
    } catch (error) {
      console.error('[FinancialReporting] Error exporting VAT report:', error);
      res.status(500).json({ 
        error: 'Failed to generate VAT report',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Download annual Profit & Loss statement for e-Business Register
   * GET /api/v1/reports/pnl/:year
   * 
   * Estonian Requirement: Annual report due by March 31
   * Submitted to: e-Business Register
   */
  async downloadAnnualPnL(req: Request, res: Response): Promise<void> {
    try {
      const fiscalYear = parseInt(req.params.year, 10);

      if (isNaN(fiscalYear) || fiscalYear < 2020 || fiscalYear > 2100) {
        res.status(400).json({ error: 'Invalid fiscal year' });
        return;
      }

      const buffer = await this.reportingService.exportAnnualPnL(fiscalYear);

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="annual_pnl_${fiscalYear}.xlsx"`);
      res.send(buffer);
    } catch (error) {
      console.error('[FinancialReporting] Error exporting P&L statement:', error);
      res.status(500).json({ 
        error: 'Failed to generate P&L statement',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Download cash flow statement
   * GET /api/v1/reports/cashflow/:year
   */
  async downloadCashFlowStatement(req: Request, res: Response): Promise<void> {
    try {
      const fiscalYear = parseInt(req.params.year, 10);

      if (isNaN(fiscalYear) || fiscalYear < 2020 || fiscalYear > 2100) {
        res.status(400).json({ error: 'Invalid fiscal year' });
        return;
      }

      const buffer = await this.reportingService.exportCashFlowStatement(fiscalYear);

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="cash_flow_${fiscalYear}.xlsx"`);
      res.send(buffer);
    } catch (error) {
      console.error('[FinancialReporting] Error exporting cash flow statement:', error);
      res.status(500).json({ 
        error: 'Failed to generate cash flow statement',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Download customer revenue report
   * GET /api/v1/reports/customer-revenue/:year
   */
  async downloadCustomerRevenue(req: Request, res: Response): Promise<void> {
    try {
      const fiscalYear = parseInt(req.params.year, 10);

      if (isNaN(fiscalYear) || fiscalYear < 2020 || fiscalYear > 2100) {
        res.status(400).json({ error: 'Invalid fiscal year' });
        return;
      }

      const buffer = await this.reportingService.exportCustomerRevenue(fiscalYear);

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="customer_revenue_${fiscalYear}.xlsx"`);
      res.send(buffer);
    } catch (error) {
      console.error('[FinancialReporting] Error exporting customer revenue:', error);
      res.status(500).json({ 
        error: 'Failed to generate customer revenue report',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Get available fiscal years for reporting
   * GET /api/v1/reports/years
   */
  async getAvailableYears(req: Request, res: Response): Promise<void> {
    try {
      const query = `
        SELECT DISTINCT fiscal_year 
        FROM transaction_log 
        WHERE is_deleted = FALSE
        ORDER BY fiscal_year DESC
      `;

      const result = await this.reportingService['pool'].query(query);
      const years = result.rows.map(row => row.fiscal_year);

      res.json({ years });
    } catch (error) {
      console.error('[FinancialReporting] Error fetching available years:', error);
      res.status(500).json({ 
        error: 'Failed to fetch available years',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Get report summary metadata (useful for dashboard)
   * GET /api/v1/reports/summary/:year
   */
  async getReportSummary(req: Request, res: Response): Promise<void> {
    try {
      const fiscalYear = parseInt(req.params.year, 10);

      if (isNaN(fiscalYear)) {
        res.status(400).json({ error: 'Invalid fiscal year' });
        return;
      }

      const summaryQuery = `
        SELECT
          COUNT(*) AS total_transactions,
          COUNT(DISTINCT customer_id) AS unique_customers,
          SUM(CASE WHEN transaction_type IN ('revenue', 'subscription_charge', 'usage_charge') 
            THEN amount_eur_cents ELSE 0 END) / 100.0 AS total_revenue_eur,
          SUM(CASE WHEN transaction_type IN ('expense', 'payment_sent') 
            THEN amount_eur_cents ELSE 0 END) / 100.0 AS total_expenses_eur,
          SUM(vat_amount_cents) / 100.0 AS total_vat_eur,
          MIN(transaction_date) AS first_transaction,
          MAX(transaction_date) AS last_transaction
        FROM transaction_log
        WHERE fiscal_year = $1 AND is_deleted = FALSE
      `;

      const result = await this.reportingService['pool'].query(summaryQuery, [fiscalYear]);

      res.json({
        fiscal_year: fiscalYear,
        summary: result.rows[0],
        available_reports: [
          { type: 'transaction_log', description: 'Complete transaction log (7-year retention)' },
          { type: 'vat_q1', description: 'Q1 VAT Report (e-MTA submission)' },
          { type: 'vat_q2', description: 'Q2 VAT Report (e-MTA submission)' },
          { type: 'vat_q3', description: 'Q3 VAT Report (e-MTA submission)' },
          { type: 'vat_q4', description: 'Q4 VAT Report (e-MTA submission)' },
          { type: 'annual_pnl', description: 'Annual P&L Statement (e-Business Register)' },
          { type: 'cash_flow', description: 'Cash Flow Statement' },
          { type: 'customer_revenue', description: 'Customer Revenue Breakdown' },
        ],
      });
    } catch (error) {
      console.error('[FinancialReporting] Error fetching report summary:', error);
      res.status(500).json({ 
        error: 'Failed to fetch report summary',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
}
