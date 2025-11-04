/**
 * Financial Reporting Service
 *
 * Generates Excel exports for Estonian compliance:
 * - Annual reports (e-Business Register)
 * - Quarterly VAT reports (e-MTA)
 * - Transaction logs (7-year retention)
 * - Profit & Loss statements
 * - Cash flow statements
 * - Customer revenue reports
 */

import { format } from 'date-fns';
import ExcelJS from 'exceljs';
import { Pool } from 'pg';

interface TransactionLogEntry {
  transaction_id: string;
  transaction_type: string;
  category: string;
  amount_eur_cents: number;
  vat_amount_cents: number;
  customer_email?: string;
  vendor_name?: string;
  transaction_date: Date;
  description: string;
  payment_method?: string;
  payment_processor_id?: string;
}

interface VATReportSummary {
  fiscal_year: number;
  quarter: number;
  vat_collected_eur: number;
  vat_paid_eur: number;
  vat_payable_eur: number;
  reverse_charge_transactions: number;
}

interface AnnualPnLStatement {
  fiscal_year: number;
  total_revenue_eur: number;
  cogs_eur: number;
  gross_profit_eur: number;
  operating_expenses_eur: number;
  net_profit_eur: number;
  profit_margin_percent: number;
}

interface CashFlowStatement {
  fiscal_year: number;
  accounting_period: string;
  cash_from_operations_eur: number;
  cash_for_operations_eur: number;
  net_cash_flow_eur: number;
}

export class FinancialReportingService {
  constructor(private pool: Pool) {}

  /**
   * Export complete transaction log for a fiscal year
   * Required for: 7-year retention (§ 13 Accounting Act)
   */
  async exportTransactionLog(fiscalYear: number): Promise<Buffer> {
    const query = `
      SELECT
        tl.transaction_id,
        tl.transaction_type,
        tl.category,
        tl.amount_cents / 100.0 AS amount_eur,
        tl.currency_code,
        tl.amount_eur_cents / 100.0 AS amount_eur_converted,
        tl.vat_rate,
        tl.vat_amount_cents / 100.0 AS vat_amount_eur,
        tl.vat_reverse_charge,
        c.email AS customer_email,
        c.company_name AS customer_company,
        tl.vendor_name,
        tl.counterparty_country_code,
        tl.counterparty_vat_number,
        tl.payment_method,
        tl.payment_processor_id,
        tl.net_amount_cents / 100.0 AS net_amount_eur,
        tl.transaction_date,
        tl.accounting_period,
        tl.description,
        tl.document_url,
        tl.created_at
      FROM transaction_log tl
      LEFT JOIN customers c ON tl.customer_id = c.id
      WHERE tl.fiscal_year = $1 AND tl.is_deleted = FALSE
      ORDER BY tl.transaction_date, tl.created_at
    `;

    const result = await this.pool.query(query, [fiscalYear]);

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(`Transactions ${fiscalYear}`);

    // Header
    worksheet.columns = [
      { header: 'Transaction ID', key: 'transaction_id', width: 40 },
      { header: 'Date', key: 'transaction_date', width: 12 },
      { header: 'Period', key: 'accounting_period', width: 10 },
      { header: 'Type', key: 'transaction_type', width: 20 },
      { header: 'Category', key: 'category', width: 15 },
      { header: 'Description', key: 'description', width: 40 },
      { header: 'Customer Email', key: 'customer_email', width: 30 },
      { header: 'Customer Company', key: 'customer_company', width: 25 },
      { header: 'Vendor', key: 'vendor_name', width: 25 },
      { header: 'Amount (EUR)', key: 'amount_eur_converted', width: 15 },
      { header: 'Currency', key: 'currency_code', width: 10 },
      { header: 'Original Amount', key: 'amount_eur', width: 15 },
      { header: 'VAT Rate', key: 'vat_rate', width: 10 },
      { header: 'VAT Amount (EUR)', key: 'vat_amount_eur', width: 15 },
      { header: 'VAT Reverse Charge', key: 'vat_reverse_charge', width: 18 },
      { header: 'Net Amount (EUR)', key: 'net_amount_eur', width: 15 },
      { header: 'Payment Method', key: 'payment_method', width: 20 },
      { header: 'Payment Processor ID', key: 'payment_processor_id', width: 35 },
      { header: 'Country', key: 'counterparty_country_code', width: 10 },
      { header: 'VAT Number', key: 'counterparty_vat_number', width: 20 },
      { header: 'Document URL', key: 'document_url', width: 50 },
    ];

    // Style header row
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFD9EAD3' },
    };

    // Add data
    result.rows.forEach((row: any) => {
      worksheet.addRow({
        ...row,
        transaction_date: format(new Date(row.transaction_date), 'yyyy-MM-dd'),
      });
    });

    // Format number columns
    const numberColumns = ['amount_eur_converted', 'amount_eur', 'vat_amount_eur', 'net_amount_eur'];
    numberColumns.forEach(colKey => {
      const col = worksheet.getColumn(colKey);
      col.numFmt = '#,##0.00';
      col.alignment = { horizontal: 'right' };
    });

    // Add summary row
    const lastRow = worksheet.rowCount + 2;
    worksheet.getCell(`A${lastRow}`).value = 'TOTALS:';
    worksheet.getCell(`A${lastRow}`).font = { bold: true };

    const totalRevenue = result.rows
      .filter((r: any) => ['revenue', 'subscription_charge', 'usage_charge'].includes(r.transaction_type))
      .reduce((sum: number, r: any) => sum + parseFloat(r.amount_eur_converted || 0), 0);

    const totalExpenses = result.rows
      .filter((r: any) => ['expense', 'payment_sent'].includes(r.transaction_type))
      .reduce((sum: number, r: any) => sum + parseFloat(r.amount_eur_converted || 0), 0);

    worksheet.getCell(`J${lastRow}`).value = totalRevenue - totalExpenses;
    worksheet.getCell(`J${lastRow}`).font = { bold: true };
    worksheet.getCell(`J${lastRow}`).numFmt = '#,##0.00';

    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  /**
   * Export quarterly VAT report for e-MTA submission
   * Required for: Estonian e-Tax Board (due within 20 days after quarter end)
   */
  async exportVATReport(fiscalYear: number, quarter: number): Promise<Buffer> {
    const query = `
      SELECT
        tl.accounting_period,
        tl.transaction_type,
        tl.category,
        SUM(tl.amount_eur_cents) / 100.0 AS total_amount_eur,
        SUM(tl.vat_amount_cents) / 100.0 AS total_vat_eur,
        COUNT(*) AS transaction_count,
        COUNT(DISTINCT tl.customer_id) AS unique_customers,
        tl.vat_reverse_charge,
        tl.counterparty_country_code
      FROM transaction_log tl
      WHERE tl.fiscal_year = $1
        AND EXTRACT(QUARTER FROM tl.transaction_date) = $2
        AND tl.is_deleted = FALSE
      GROUP BY tl.accounting_period, tl.transaction_type, tl.category,
               tl.vat_reverse_charge, tl.counterparty_country_code
      ORDER BY tl.accounting_period, tl.transaction_type
    `;

    const result = await this.pool.query(query, [fiscalYear, quarter]);

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(`VAT Q${quarter} ${fiscalYear}`);

    // Company info header (Estonian e-MTA format)
    worksheet.mergeCells('A1:E1');
    worksheet.getCell('A1').value = 'KÄIBEMAKSU DEKLARATSIOON / VAT DECLARATION';
    worksheet.getCell('A1').font = { bold: true, size: 14 };
    worksheet.getCell('A1').alignment = { horizontal: 'center' };

    worksheet.getCell('A2').value = 'Company:';
    worksheet.getCell('B2').value = 'Bel Consulting OÜ';
    worksheet.getCell('A3').value = 'Registry Code:';
    worksheet.getCell('B3').value = '[INSERT_ESTONIAN_REGISTRY_CODE]';
    worksheet.getCell('A4').value = 'Period:';
    worksheet.getCell('B4').value = `Q${quarter} ${fiscalYear}`;

    // VAT summary section
    worksheet.getCell('A6').value = 'VAT SUMMARY';
    worksheet.getCell('A6').font = { bold: true };

    worksheet.getCell('A7').value = 'VAT Collected (Sales):';
    worksheet.getCell('A8').value = 'VAT Paid (Purchases):';
    worksheet.getCell('A9').value = 'VAT Payable to e-MTA:';

    const vatCollected = result.rows
      .filter((r: any) => ['revenue', 'subscription_charge', 'usage_charge'].includes(r.transaction_type))
      .reduce((sum: number, r: any) => sum + parseFloat(r.total_vat_eur || 0), 0);

    const vatPaid = result.rows
      .filter((r: any) => ['expense', 'payment_sent'].includes(r.transaction_type))
      .reduce((sum: number, r: any) => sum + parseFloat(r.total_vat_eur || 0), 0);

    worksheet.getCell('B7').value = vatCollected;
    worksheet.getCell('B7').numFmt = '#,##0.00 €';
    worksheet.getCell('B8').value = vatPaid;
    worksheet.getCell('B8').numFmt = '#,##0.00 €';
    worksheet.getCell('B9').value = vatCollected - vatPaid;
    worksheet.getCell('B9').numFmt = '#,##0.00 €';
    worksheet.getCell('B9').font = { bold: true };

    // Detailed transactions
    worksheet.getCell('A11').value = 'DETAILED TRANSACTIONS';
    worksheet.getCell('A11').font = { bold: true };

    const detailsStartRow = 12;
    worksheet.getRow(detailsStartRow).values = [
      'Period', 'Type', 'Category', 'Amount (EUR)', 'VAT (EUR)',
      'Transactions', 'Customers', 'Reverse Charge', 'Country'
    ];
    worksheet.getRow(detailsStartRow).font = { bold: true };

    result.rows.forEach((row: any, index: number) => {
      worksheet.getRow(detailsStartRow + 1 + index).values = [
        row.accounting_period,
        row.transaction_type,
        row.category,
        parseFloat(row.total_amount_eur),
        parseFloat(row.total_vat_eur),
        row.transaction_count,
        row.unique_customers,
        row.vat_reverse_charge ? 'Yes' : 'No',
        row.counterparty_country_code || 'EE',
      ];
    });

    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  /**
   * Export annual Profit & Loss statement for e-Business Register
   * Required for: Annual report submission by March 31
   */
  async exportAnnualPnL(fiscalYear: number): Promise<Buffer> {
    const query = `SELECT * FROM annual_pnl_statement WHERE fiscal_year = $1`;
    const result = await this.pool.query(query, [fiscalYear]);

    if (result.rows.length === 0) {
      throw new Error(`No data found for fiscal year ${fiscalYear}`);
    }

    const data = result.rows[0];

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(`P&L ${fiscalYear}`);

    // Estonian format header
    worksheet.mergeCells('A1:C1');
    worksheet.getCell('A1').value = 'KASUMIARUANNE / PROFIT & LOSS STATEMENT';
    worksheet.getCell('A1').font = { bold: true, size: 14 };
    worksheet.getCell('A1').alignment = { horizontal: 'center' };

    worksheet.getCell('A2').value = 'Bel Consulting OÜ';
    worksheet.getCell('A3').value = `Fiscal Year: ${fiscalYear}`;
    worksheet.getCell('A4').value = `Generated: ${format(new Date(), 'yyyy-MM-dd HH:mm')}`;

    // P&L Statement
    const rows = [
      { label: '', value: '', bold: true },
      { label: 'REVENUE', value: '', bold: true },
      { label: 'Total Revenue', value: data.total_revenue_eur },
      { label: '', value: '' },
      { label: 'COST OF GOODS SOLD', value: '', bold: true },
      { label: 'Total COGS', value: data.cogs_eur },
      { label: '', value: '' },
      { label: 'GROSS PROFIT', value: data.gross_profit_eur, bold: true },
      { label: '', value: '' },
      { label: 'OPERATING EXPENSES', value: '', bold: true },
      { label: 'Total Operating Expenses', value: data.operating_expenses_eur },
      { label: '', value: '' },
      { label: 'NET PROFIT', value: data.net_profit_eur, bold: true, highlight: true },
      { label: '', value: '' },
      { label: 'PROFIT MARGIN', value: `${data.profit_margin_percent}%`, bold: true },
    ];

    rows.forEach((row, index) => {
      const rowNum = 6 + index;
      worksheet.getCell(`A${rowNum}`).value = row.label;

      if (row.value !== '') {
        worksheet.getCell(`C${rowNum}`).value = typeof row.value === 'number' ? row.value : row.value;
        if (typeof row.value === 'number') {
          worksheet.getCell(`C${rowNum}`).numFmt = '#,##0.00 €';
        }
      }

      if (row.bold) {
        worksheet.getRow(rowNum).font = { bold: true };
      }

      if (row.highlight) {
        worksheet.getRow(rowNum).fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFFFFF00' },
        };
      }
    });

    worksheet.getColumn('A').width = 30;
    worksheet.getColumn('C').width = 20;
    worksheet.getColumn('C').alignment = { horizontal: 'right' };

    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  /**
   * Export cash flow statement
   */
  async exportCashFlowStatement(fiscalYear: number): Promise<Buffer> {
    const query = `SELECT * FROM cash_flow_statement WHERE fiscal_year = $1 ORDER BY accounting_period`;
    const result = await this.pool.query(query, [fiscalYear]);

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(`Cash Flow ${fiscalYear}`);

    worksheet.mergeCells('A1:E1');
    worksheet.getCell('A1').value = 'CASH FLOW STATEMENT';
    worksheet.getCell('A1').font = { bold: true, size: 14 };
    worksheet.getCell('A1').alignment = { horizontal: 'center' };

    worksheet.getCell('A2').value = `Fiscal Year: ${fiscalYear}`;

    const headerRow = 4;
    worksheet.getRow(headerRow).values = [
      'Period', 'Cash from Operations', 'Cash for Operations',
      'Cash from Investing', 'Cash from Financing', 'Net Cash Flow'
    ];
    worksheet.getRow(headerRow).font = { bold: true };

    result.rows.forEach((row: any, index: number) => {
      worksheet.getRow(headerRow + 1 + index).values = [
        row.accounting_period,
        parseFloat(row.cash_from_operations_eur),
        parseFloat(row.cash_for_operations_eur),
        parseFloat(row.cash_from_investing_eur),
        parseFloat(row.cash_from_financing_eur),
        parseFloat(row.net_cash_flow_eur),
      ];
    });

    // Format numbers
    ['B', 'C', 'D', 'E', 'F'].forEach(col => {
      worksheet.getColumn(col).numFmt = '#,##0.00 €';
      worksheet.getColumn(col).alignment = { horizontal: 'right' };
    });

    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  /**
   * Export customer revenue report
   */
  async exportCustomerRevenue(fiscalYear: number): Promise<Buffer> {
    const query = `
      SELECT * FROM customer_revenue_report
      WHERE year = $1
      ORDER BY total_revenue_eur DESC
    `;
    const result = await this.pool.query(query, [fiscalYear]);

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(`Customer Revenue ${fiscalYear}`);

    worksheet.columns = [
      { header: 'Customer Email', key: 'email', width: 35 },
      { header: 'Company', key: 'company_name', width: 30 },
      { header: 'Year', key: 'year', width: 8 },
      { header: 'Month', key: 'month', width: 8 },
      { header: 'Revenue (EUR)', key: 'total_revenue_eur', width: 15 },
      { header: 'VAT (EUR)', key: 'total_vat_eur', width: 15 },
      { header: 'Transactions', key: 'transaction_count', width: 15 },
      { header: 'Avg Transaction (EUR)', key: 'avg_transaction_eur', width: 20 },
    ];

    worksheet.getRow(1).font = { bold: true };

    result.rows.forEach((row: any) => {
      worksheet.addRow(row);
    });

    worksheet.getColumn('total_revenue_eur').numFmt = '#,##0.00';
    worksheet.getColumn('total_vat_eur').numFmt = '#,##0.00';
    worksheet.getColumn('avg_transaction_eur').numFmt = '#,##0.00';

    return Buffer.from(await workbook.xlsx.writeBuffer());
  }
}
