import { Pool } from 'pg';
import axios from 'axios';
import { XMLBuilder, XMLParser } from 'fast-xml-parser';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { addMonths, format, startOfQuarter, endOfQuarter, addDays } from 'date-fns';

/**
 * VAT Reporting Service for Estonian Tax Compliance
 * 
 * Estonian VAT Requirements:
 * - Quarterly filing (due 20th of 2nd month after quarter end)
 * - Standard rate: 20%
 * - EU B2B: Reverse charge (0% with valid VIES VAT ID)
 * - Non-EU: Out of scope (0%)
 * - Filing via e-MTA (X-Road or web portal)
 * 
 * Legal Reference:
 * - Käibemaksuseadus (Value Added Tax Act)
 * - § 14: Tax rate
 * - § 37: Tax return filing deadline
 * - § 38: Tax payment deadline
 */

export interface VATReportData {
  year: number;
  quarter: number;
  totalSalesCents: number;
  vatCollectedCents: number;
  totalPurchasesCents: number;
  vatPaidCents: number;
  netVATPayableCents: number;
  sales20PercentCents: number;
  sales0PercentCents: number;
}

export interface EMTACredentials {
  personalCode: string; // Estonian personal ID code
  certificatePath?: string; // Path to ID card certificate
  mobileIdPhone?: string; // Mobile-ID phone number
}

/**
 * Estonian Tax and Customs Board (Maksu- ja Tolliamet - MTA)
 * Integration via X-Road or web portal
 */
export class VATReportingService {
  private s3Client: S3Client;

  constructor(
    private db: Pool,
    private emtaCredentials?: EMTACredentials,
    private s3Bucket: string = process.env.S3_ACCOUNTING_BUCKET || 'rivalapexmediation-accounting'
  ) {
    this.s3Client = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });
  }

  /**
   * Generate quarterly VAT report
   */
  async generateQuarterlyReport(year: number, quarter: number): Promise<string> {
    if (quarter < 1 || quarter > 4) {
      throw new Error('Quarter must be between 1 and 4');
    }

    console.log(`[VATReporting] Generating report for ${year} Q${quarter}`);

    const client = await this.db.connect();

    try {
      await client.query('BEGIN');

      // 1. Calculate period dates
      const startDate = startOfQuarter(new Date(year, (quarter - 1) * 3, 1));
      const endDate = endOfQuarter(startDate);
      const dueDate = this.calculateVATDueDate(year, quarter);

      // 2. Calculate VAT collected from sales
      const salesData = await this.calculateVATFromSales(client, startDate, endDate);

      // 3. Calculate VAT paid on purchases
      const purchaseData = await this.calculateVATFromPurchases(client, startDate, endDate);

      // 4. Calculate net VAT payable (can be negative = refund)
      const netVATPayableCents = salesData.vatCollectedCents - purchaseData.vatPaidCents;

      // 5. Check if report already exists
      const existingReport = await client.query(
        'SELECT id FROM vat_reports WHERE year = $1 AND quarter = $2',
        [year, quarter]
      );

      let reportId: string;

      if (existingReport.rows.length > 0) {
        // Update existing report
        reportId = existingReport.rows[0].id;
        await client.query(
          `UPDATE vat_reports SET
            start_date = $1, end_date = $2, due_date = $3,
            total_sales_cents = $4, vat_collected_cents = $5,
            total_purchases_cents = $6, vat_paid_cents = $7,
            net_vat_payable_cents = $8,
            sales_20_percent_cents = $9, sales_0_percent_cents = $10,
            updated_at = NOW()
           WHERE id = $11`,
          [
            startDate,
            endDate,
            dueDate,
            salesData.totalSalesCents,
            salesData.vatCollectedCents,
            purchaseData.totalPurchasesCents,
            purchaseData.vatPaidCents,
            netVATPayableCents,
            salesData.sales20PercentCents,
            salesData.sales0PercentCents,
            reportId,
          ]
        );
      } else {
        // Create new report
        const result = await client.query(
          `INSERT INTO vat_reports (
            year, quarter, start_date, end_date, due_date,
            total_sales_cents, vat_collected_cents,
            total_purchases_cents, vat_paid_cents,
            net_vat_payable_cents,
            sales_20_percent_cents, sales_0_percent_cents,
            status
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
          RETURNING id`,
          [
            year,
            quarter,
            startDate,
            endDate,
            dueDate,
            salesData.totalSalesCents,
            salesData.vatCollectedCents,
            purchaseData.totalPurchasesCents,
            purchaseData.vatPaidCents,
            netVATPayableCents,
            salesData.sales20PercentCents,
            salesData.sales0PercentCents,
            'draft',
          ]
        );
        reportId = result.rows[0].id;
      }

      // 6. Generate report PDF
      const reportPDF = await this.generateReportPDF({
        year,
        quarter,
        startDate,
        endDate,
        dueDate,
        ...salesData,
        ...purchaseData,
        netVATPayableCents,
      });

      // 7. Upload to S3
      const s3Key = `vat-reports/${year}/Q${quarter}-VAT-Report.pdf`;
      await this.uploadToS3(s3Key, reportPDF, 'application/pdf');

      const reportUrl = `https://${this.s3Bucket}.s3.amazonaws.com/${s3Key}`;

      // 8. Update report with URL
      await client.query(
        'UPDATE vat_reports SET report_url = $1 WHERE id = $2',
        [reportUrl, reportId]
      );

      await client.query('COMMIT');

      console.log(`[VATReporting] Report generated: ${reportId}`);
      return reportId;
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('[VATReporting] Error generating report:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Submit VAT report to e-MTA
   * 
   * IMPORTANT: This requires:
   * 1. Estonian ID card with digital signature capability, OR
   * 2. Mobile-ID with Estonian phone number, OR
   * 3. Smart-ID
   * 
   * Integration options:
   * A) X-Road (recommended for automated systems)
   *    - Requires X-Road Security Server installation
   *    - Or use X-Road service provider
   * B) e-MTA Web Portal (manual)
   *    - https://www.emta.ee
   *    - Login with ID card/Mobile-ID
   *    - Manual form submission
   * C) e-MTA API (if available via X-Road)
   */
  async submitToEMTA(reportId: string): Promise<void> {
    const report = await this.db.query(
      'SELECT * FROM vat_reports WHERE id = $1',
      [reportId]
    );

    if (report.rows.length === 0) {
      throw new Error(`VAT report not found: ${reportId}`);
    }

    const reportData = report.rows[0];

    if (reportData.status === 'submitted') {
      console.log(`[VATReporting] Report already submitted: ${reportId}`);
      return;
    }

    // Check if automated submission is enabled
    if (!this.emtaCredentials) {
      throw new Error(
        'e-MTA credentials not configured. Please submit manually at https://www.emta.ee or configure X-Road integration.'
      );
    }

    console.log(`[VATReporting] Submitting report ${reportId} to e-MTA`);

    try {
      // Option A: X-Road submission (requires setup)
      if (process.env.XROAD_ENABLED === 'true') {
        await this.submitViaXRoad(reportData);
      } else {
        // For now, throw error requiring manual submission
        throw new Error(
          `Automated e-MTA submission not configured.
           
           Manual submission steps:
           1. Go to https://www.emta.ee
           2. Login with ID card or Mobile-ID
           3. Navigate to: Deklaratsioonid → KMD (VAT return)
           4. Fill in the form with values from report ${reportId}:
              - Total sales: €${(reportData.total_sales_cents / 100).toFixed(2)}
              - VAT collected: €${(reportData.vat_collected_cents / 100).toFixed(2)}
              - VAT paid: €${(reportData.vat_paid_cents / 100).toFixed(2)}
              - Net VAT payable: €${(reportData.net_vat_payable_cents / 100).toFixed(2)}
           5. Submit and note the submission reference number
           6. Update the report with: UPDATE vat_reports SET status='submitted', submission_id='REF' WHERE id='${reportId}'
           
           To enable automated submission, configure X-Road integration.`
        );
      }

      // Update report status
      await this.db.query(
        `UPDATE vat_reports 
         SET status = 'submitted', submitted_at = NOW()
         WHERE id = $1`,
        [reportId]
      );

      console.log(`[VATReporting] Report submitted successfully: ${reportId}`);
    } catch (error) {
      console.error('[VATReporting] Submission error:', error);
      throw error;
    }
  }

  /**
   * Submit via X-Road (Estonian data exchange layer)
   * 
   * X-Road Setup Requirements:
   * 1. Register as X-Road member (apply via RIA - Riigi Infosüsteemi Amet)
   * 2. Install X-Road Security Server OR use service provider
   * 3. Obtain credentials from e-MTA for API access
   * 4. Configure TLS certificates
   * 
   * Service Providers:
   * - Aktors OÜ: https://www.aktors.ee
   * - Cybernetica AS: https://cyber.ee
   * - Nortal AS: https://nortal.com
   * 
   * X-Road Documentation:
   * - https://x-road.global
   * - https://www.ria.ee/x-tee
   */
  private async submitViaXRoad(reportData: any): Promise<void> {
    const xroadConfig = {
      securityServer: process.env.XROAD_SECURITY_SERVER || '',
      clientId: process.env.XROAD_CLIENT_ID || '', // Format: EE/COM/12345678/rivalapexmediation
      serviceId: 'EE/GOV/70000740/emta/vat-filing', // e-MTA VAT service
      userId: this.emtaCredentials?.personalCode || '',
    };

    // Build X-Road SOAP request
    const soapRequest = this.buildVATSubmissionSOAP(reportData, xroadConfig);

    // Send to X-Road Security Server
    const response = await axios.post(
      `${xroadConfig.securityServer}/cgi-bin/consumer_proxy`,
      soapRequest,
      {
        headers: {
          'Content-Type': 'text/xml; charset=utf-8',
          'SOAPAction': 'submitVATReturn',
        },
        timeout: 30000,
      }
    );

    // Parse response
    const parser = new XMLParser();
    const responseData = parser.parse(response.data);

    // Check for success
    if (responseData['SOAP-ENV:Envelope']?.['SOAP-ENV:Body']?.['ns1:submitVATReturnResponse']?.success) {
      const submissionId = responseData['SOAP-ENV:Envelope']['SOAP-ENV:Body']['ns1:submitVATReturnResponse'].submissionId;
      
      await this.db.query(
        'UPDATE vat_reports SET submission_id = $1 WHERE id = $2',
        [submissionId, reportData.id]
      );

      console.log(`[VATReporting] X-Road submission successful: ${submissionId}`);
    } else {
      throw new Error('X-Road submission failed: ' + JSON.stringify(responseData));
    }
  }

  /**
   * Build SOAP request for X-Road VAT submission
   */
  private buildVATSubmissionSOAP(reportData: any, xroadConfig: any): string {
    const builder = new XMLBuilder({ format: true });

    return builder.build({
      'SOAP-ENV:Envelope': {
        '@_xmlns:SOAP-ENV': 'http://schemas.xmlsoap.org/soap/envelope/',
        '@_xmlns:xrd': 'http://x-road.eu/xsd/xroad.xsd',
        '@_xmlns:id': 'http://x-road.eu/xsd/identifiers',
        'SOAP-ENV:Header': {
          'xrd:client': { '@_id:objectType': 'SUBSYSTEM', '#text': xroadConfig.clientId },
          'xrd:service': { '@_id:objectType': 'SERVICE', '#text': xroadConfig.serviceId },
          'xrd:userId': xroadConfig.userId,
          'xrd:id': `VAT-${reportData.year}-Q${reportData.quarter}-${Date.now()}`,
          'xrd:protocolVersion': '4.0',
        },
        'SOAP-ENV:Body': {
          'ns1:submitVATReturn': {
            '@_xmlns:ns1': 'http://emta.ee/xroad/vat/v1',
            period: `${reportData.year}Q${reportData.quarter}`,
            companyCode: process.env.ESTONIAN_COMPANY_CODE || '16736399',
            vatNumber: process.env.ESTONIAN_VAT_NUMBER || 'EE102736890',
            totalSales: (reportData.total_sales_cents / 100).toFixed(2),
            vatCollected: (reportData.vat_collected_cents / 100).toFixed(2),
            totalPurchases: (reportData.total_purchases_cents / 100).toFixed(2),
            vatPaid: (reportData.vat_paid_cents / 100).toFixed(2),
            netVATPayable: (reportData.net_vat_payable_cents / 100).toFixed(2),
            salesBreakdown: {
              rate20Percent: (reportData.sales_20_percent_cents / 100).toFixed(2),
              rate0Percent: (reportData.sales_0_percent_cents / 100).toFixed(2),
            },
          },
        },
      },
    });
  }

  /**
   * Calculate VAT from sales (invoices)
   */
  private async calculateVATFromSales(client: any, startDate: Date, endDate: Date) {
    const result = await client.query(
      `SELECT
        SUM(subtotal_cents) as total_sales_cents,
        SUM(vat_cents) as vat_collected_cents,
        SUM(CASE WHEN vat_rate = 0.20 THEN subtotal_cents ELSE 0 END) as sales_20_percent_cents,
        SUM(CASE WHEN vat_rate = 0.00 THEN subtotal_cents ELSE 0 END) as sales_0_percent_cents
       FROM invoices
       WHERE issue_date >= $1 AND issue_date <= $2
         AND status = 'paid'`,
      [startDate, endDate]
    );

    const row = result.rows[0];
    return {
      totalSalesCents: parseInt(row.total_sales_cents || '0', 10),
      vatCollectedCents: parseInt(row.vat_collected_cents || '0', 10),
      sales20PercentCents: parseInt(row.sales_20_percent_cents || '0', 10),
      sales0PercentCents: parseInt(row.sales_0_percent_cents || '0', 10),
    };
  }

  /**
   * Calculate VAT from purchases (expenses)
   */
  private async calculateVATFromPurchases(client: any, startDate: Date, endDate: Date) {
    const result = await client.query(
      `SELECT
        SUM(amount_eur_cents) as total_purchases_cents,
        SUM(CASE WHEN is_vat_deductible THEN vat_cents ELSE 0 END) as vat_paid_cents
       FROM expenses
       WHERE expense_date >= $1 AND expense_date <= $2
         AND status = 'paid'`,
      [startDate, endDate]
    );

    const row = result.rows[0];
    return {
      totalPurchasesCents: parseInt(row.total_purchases_cents || '0', 10),
      vatPaidCents: parseInt(row.vat_paid_cents || '0', 10),
    };
  }

  /**
   * Calculate VAT due date (20th of 2nd month after quarter end)
   */
  private calculateVATDueDate(year: number, quarter: number): Date {
    const quarterEndMonth = quarter * 3;
    const dueMonth = (quarterEndMonth + 2) % 12 || 12;
    const dueYear = quarterEndMonth + 2 > 12 ? year + 1 : year;
    return new Date(dueYear, dueMonth - 1, 20);
  }

  /**
   * Generate PDF report
   */
  private async generateReportPDF(data: VATReportData & { startDate: Date; endDate: Date; dueDate: Date }): Promise<Buffer> {
    // Simplified PDF generation (in production, use pdfkit or similar)
    const content = `
VAT REPORT
==========

Period: ${data.year} Q${data.quarter}
From: ${format(data.startDate, 'dd.MM.yyyy')}
To: ${format(data.endDate, 'dd.MM.yyyy')}
Due Date: ${format(data.dueDate, 'dd.MM.yyyy')}

SALES
-----
Total Sales (20%): €${(data.sales20PercentCents / 100).toFixed(2)}
Total Sales (0%): €${(data.sales0PercentCents / 100).toFixed(2)}
Total Sales: €${(data.totalSalesCents / 100).toFixed(2)}
VAT Collected: €${(data.vatCollectedCents / 100).toFixed(2)}

PURCHASES
---------
Total Purchases: €${(data.totalPurchasesCents / 100).toFixed(2)}
VAT Paid (Deductible): €${(data.vatPaidCents / 100).toFixed(2)}

NET VAT
-------
Net VAT Payable: €${(data.netVATPayableCents / 100).toFixed(2)}
${data.netVATPayableCents < 0 ? '(Refund Due)' : '(Payment Due)'}

---
Generated: ${format(new Date(), 'dd.MM.yyyy HH:mm')}
Bel Consulting OÜ (EE102736890)
    `;

    return Buffer.from(content);
  }

  /**
   * Upload to S3
   */
  private async uploadToS3(key: string, content: Buffer, contentType: string): Promise<void> {
    const command = new PutObjectCommand({
      Bucket: this.s3Bucket,
      Key: key,
      Body: content,
      ContentType: contentType,
      ServerSideEncryption: 'AES256',
    });

    await this.s3Client.send(command);
  }

  /**
   * Get report status
   */
  async getReportStatus(year: number, quarter: number): Promise<any> {
    const result = await this.db.query(
      'SELECT * FROM vat_reports WHERE year = $1 AND quarter = $2',
      [year, quarter]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0];
  }

  /**
   * Mark report as paid
   */
  async markReportAsPaid(reportId: string, paymentReference: string): Promise<void> {
    await this.db.query(
      `UPDATE vat_reports 
       SET status = 'paid', paid_at = NOW(), payment_reference = $1
       WHERE id = $2`,
      [paymentReference, reportId]
    );

    console.log(`[VATReporting] Report marked as paid: ${reportId}`);
  }
}
