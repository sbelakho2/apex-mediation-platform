import { Pool } from 'pg';
import PDFDocument from 'pdfkit';
import type PDFKit from 'pdfkit';
import { XMLBuilder } from 'fast-xml-parser';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import crypto from 'crypto';
import { addDays, format } from 'date-fns';
import type { BankAccountDetails } from '../../src/config/banking';
import { getPaymentInstructions } from '../../src/config/banking';

/**
 * Invoice Generator Service
 * 
 * Generates invoices with e-invoicing support for Estonian compliance.
 * Outputs:
 * - PDF (human-readable, emailed to customer)
 * - XML (e-invoicing standard: UBL 2.1)
 * 
 * Compliance:
 * - Sequential invoice numbering (no gaps)
 * - 7-year retention in S3 with Object Lock
 * - VAT calculation per Estonian law
 * - E-invoicing ready (UBL 2.1 / Peppol BIS Billing 3.0)
 */

export interface InvoiceLineItem {
  description: string;
  quantity: number;
  unitPriceCents: number;
  amountCents: number;
  vatRate?: number;
}

export interface CustomerInfo {
  id: string;
  email: string;
  name: string;
  companyName?: string;
  address?: string;
  city?: string;
  postalCode?: string;
  country?: string;
  vatId?: string;
}

export interface InvoiceData {
  customerId: string;
  subscriptionId?: string;
  lineItems: InvoiceLineItem[];
  notes?: string;
  dueInDays?: number; // Default: 14
}

const EU_COUNTRIES = [
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR',
  'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL',
  'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE',
];

export class InvoiceGeneratorService {
  private s3Client: S3Client;

  constructor(
    private db: Pool,
    private s3Bucket: string = process.env.S3_ACCOUNTING_BUCKET || 'rivalapexmediation-accounting'
  ) {
    this.s3Client = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });
  }

  /**
   * Generate invoice with PDF and XML
   */
  async generateInvoice(data: InvoiceData): Promise<string> {
    const client = await this.db.connect();

    try {
      await client.query('BEGIN');

      // 1. Get customer information
      const customer = await this.getCustomerInfo(client, data.customerId);

      // 2. Calculate amounts
      const subtotalCents = data.lineItems.reduce((sum, item) => sum + item.amountCents, 0);
      const vatRate = this.getVatRate(customer);
      const vatCents = Math.round(subtotalCents * vatRate);
      const totalCents = subtotalCents + vatCents;

      // 3. Get next invoice number
      const invoiceNumber = await this.getNextInvoiceNumber(client);

      // 4. Create invoice record
      const issueDate = new Date();
      const dueDate = addDays(issueDate, data.dueInDays || 14);

      const invoiceResult = await client.query(
        `INSERT INTO invoices (
          invoice_number, customer_id, subscription_id,
          issue_date, due_date,
          subtotal_cents, vat_rate, vat_cents, total_cents, currency,
          amount_eur_cents, exchange_rate,
          line_items, notes, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        RETURNING id`,
        [
          invoiceNumber,
          data.customerId,
          data.subscriptionId,
          issueDate,
          dueDate,
          subtotalCents,
          vatRate,
          vatCents,
          totalCents,
          'EUR',
          totalCents, // Already in EUR
          null,
          JSON.stringify(data.lineItems),
          data.notes,
          'issued',
        ]
      );

      const invoiceId = invoiceResult.rows[0].id;

      // 5. Generate PDF
      const pdfBuffer = await this.generatePDF({
        invoiceNumber,
        customer,
        issueDate,
        dueDate,
        lineItems: data.lineItems,
        subtotalCents,
        vatRate,
        vatCents,
        totalCents,
        notes: data.notes,
      });

      // 6. Generate XML (e-invoicing)
      const xmlContent = await this.generateXML({
        invoiceNumber,
        customer,
        issueDate,
        dueDate,
        lineItems: data.lineItems,
        subtotalCents,
        vatRate,
        vatCents,
        totalCents,
      });

      // 7. Upload to S3 with 7-year retention
      const pdfKey = `invoices/${issueDate.getFullYear()}/${invoiceNumber}.pdf`;
      const xmlKey = `invoices/${issueDate.getFullYear()}/${invoiceNumber}.xml`;

      await this.uploadToS3(pdfKey, pdfBuffer, 'application/pdf');
      await this.uploadToS3(xmlKey, xmlContent, 'application/xml');

      // 8. Store document metadata
      await this.storeDocumentMetadata(client, invoiceId, pdfKey, pdfBuffer, 'invoice');
      await this.storeDocumentMetadata(client, invoiceId, xmlKey, xmlContent, 'invoice');

      // 9. Update invoice with S3 URLs
      const pdfUrl = `https://${this.s3Bucket}.s3.amazonaws.com/${pdfKey}`;
      const xmlUrl = `https://${this.s3Bucket}.s3.amazonaws.com/${xmlKey}`;

      await client.query(
        `UPDATE invoices 
         SET pdf_url = $1, xml_url = $2, updated_at = NOW()
         WHERE id = $3`,
        [pdfUrl, xmlUrl, invoiceId]
      );

      await client.query('COMMIT');

      console.log(`[InvoiceGenerator] Invoice created: ${invoiceNumber}`);
      return invoiceId;
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('[InvoiceGenerator] Error generating invoice:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Generate PDF invoice
   */
  private async generatePDF(data: {
    invoiceNumber: string;
    customer: CustomerInfo;
    issueDate: Date;
    dueDate: Date;
    lineItems: InvoiceLineItem[];
    subtotalCents: number;
    vatRate: number;
    vatCents: number;
    totalCents: number;
    notes?: string;
  }): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({ size: 'A4', margin: 50 });
        const chunks: Buffer[] = [];

        doc.on('data', (chunk: Buffer) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        // Colors
        const primaryColor = '#1a202c';
        const accentColor = '#3b82f6';

        // Header
        doc.fillColor(primaryColor)
          .fontSize(28)
          .text('INVOICE', 400, 50, { align: 'right' });

        doc.fontSize(10)
          .fillColor('#6b7280')
          .text(`Invoice #: ${data.invoiceNumber}`, 400, 85, { align: 'right' })
          .text(`Date: ${format(data.issueDate, 'dd.MM.yyyy')}`, { align: 'right' })
          .text(`Due: ${format(data.dueDate, 'dd.MM.yyyy')}`, { align: 'right' });

        // Seller information (Bel Consulting OÜ)
        doc.fillColor(primaryColor)
          .fontSize(12)
          .font('Helvetica-Bold')
          .text('Bel Consulting OÜ', 50, 50);

        doc.fontSize(9)
          .font('Helvetica')
          .fillColor('#6b7280')
          .text('Registry code: 16736399', 50, 68)
          .text('VAT number: EE102736890', 50, 80)
          .text('Address: Harju maakond, Tallinn', 50, 92)
          .text('Kesklinna linnaosa, Narva mnt 5', 50, 104)
          .text('10117, Estonia', 50, 116);

        // Buyer information
        doc.fillColor(primaryColor)
          .fontSize(11)
          .font('Helvetica-Bold')
          .text('Bill To:', 50, 160);

        doc.fontSize(9)
          .font('Helvetica')
          .fillColor(primaryColor)
          .text(data.customer.companyName || data.customer.name, 50, 178);

        if (data.customer.address) {
          doc.text(data.customer.address, 50, 190);
        }
        if (data.customer.city && data.customer.postalCode) {
          doc.text(`${data.customer.postalCode} ${data.customer.city}`, 50, 202);
        }
        if (data.customer.country) {
          doc.text(data.customer.country, 50, 214);
        }
        if (data.customer.vatId) {
          doc.text(`VAT ID: ${data.customer.vatId}`, 50, 226);
        }

        // Line items table
        const tableTop = 280;
        const col1X = 50; // Description
        const col2X = 350; // Quantity
        const col3X = 420; // Unit Price
        const col4X = 490; // Amount

        // Table header
        doc.fillColor(accentColor)
          .fontSize(9)
          .font('Helvetica-Bold')
          .text('Description', col1X, tableTop)
          .text('Qty', col2X, tableTop)
          .text('Unit Price', col3X, tableTop)
          .text('Amount', col4X, tableTop);

        // Draw header line
        doc.moveTo(50, tableTop + 15)
          .lineTo(550, tableTop + 15)
          .strokeColor('#e5e7eb')
          .stroke();

        // Table rows
        let yPosition = tableTop + 25;
        doc.fillColor(primaryColor)
          .fontSize(9)
          .font('Helvetica');

        data.lineItems.forEach(item => {
          doc.text(item.description, col1X, yPosition, { width: 290 });
          doc.text(item.quantity.toString(), col2X, yPosition);
          doc.text(`€${(item.unitPriceCents / 100).toFixed(2)}`, col3X, yPosition);
          doc.text(`€${(item.amountCents / 100).toFixed(2)}`, col4X, yPosition);
          yPosition += 25;
        });

        // Draw line before totals
        yPosition += 10;
        doc.moveTo(350, yPosition)
          .lineTo(550, yPosition)
          .strokeColor('#e5e7eb')
          .stroke();

        // Totals
        yPosition += 20;
        doc.fontSize(9)
          .text('Subtotal:', 350, yPosition)
          .text(`€${(data.subtotalCents / 100).toFixed(2)}`, 490, yPosition, { align: 'right', width: 60 });

        yPosition += 20;
        const vatPercentage = (data.vatRate * 100).toFixed(0);
        doc.text(`VAT (${vatPercentage}%):`, 350, yPosition)
          .text(`€${(data.vatCents / 100).toFixed(2)}`, 490, yPosition, { align: 'right', width: 60 });

        yPosition += 25;
        doc.fontSize(11)
          .font('Helvetica-Bold')
          .fillColor(accentColor)
          .text('Total:', 350, yPosition)
          .text(`€${(data.totalCents / 100).toFixed(2)}`, 490, yPosition, { align: 'right', width: 60 });

        // Payment information
        yPosition += 50;
        doc.fillColor(primaryColor)
          .fontSize(10)
          .font('Helvetica-Bold')
          .text('Payment Information', 50, yPosition);

        yPosition += 20;
        doc.fontSize(9)
          .font('Helvetica')
          .text(`Payment due: ${format(data.dueDate, 'dd.MM.yyyy')}`, 50, yPosition, { continued: false });

        const instructions = getPaymentInstructions();
        instructions.forEach((instruction) => {
          yPosition += 20;
          doc.fontSize(9)
            .font('Helvetica-Bold')
            .fillColor(primaryColor)
            .text(instruction.heading, 50, yPosition);

          yPosition += 14;
          doc.font('Helvetica')
            .fillColor('#4b5563')
            .text(instruction.description, 50, yPosition, { width: 460 });

          yPosition += 24;
          yPosition = this.writeBankAccountDetails(doc, instruction.account, data.invoiceNumber, yPosition);
        });

        // Notes
        if (data.notes) {
          yPosition += 90;
          doc.fontSize(9)
            .font('Helvetica-Bold')
            .text('Notes:', 50, yPosition);

          yPosition += 15;
          doc.fontSize(8)
            .font('Helvetica')
            .fillColor('#6b7280')
            .text(data.notes, 50, yPosition, { width: 500 });
        }

        // Footer
        doc.fontSize(7)
          .fillColor('#9ca3af')
          .text(
            'This invoice was generated automatically by RivalApexMediation. For questions, contact accounting@apexmediation.ee',
            50,
            750,
            { align: 'center', width: 500 }
          );

        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Generate XML invoice (UBL 2.1 format for e-invoicing)
   */
  private writeBankAccountDetails(
    doc: PDFKit.PDFDocument,
    account: BankAccountDetails,
    invoiceNumber: string,
    yPosition: number
  ): number {
    const detailPairs: Array<[string, string | undefined]> = [
      ['Account Name', account.accountName],
      ['Bank', account.bankName],
      ['IBAN', account.iban],
      ['Account #', account.accountNumber],
      ['Routing #', account.routingNumber],
      ['BIC/SWIFT', account.bic || account.swift],
      ['Account Type', account.accountType],
      ['Bank Address', account.bankAddress],
    ];

    doc.font('Helvetica')
      .fontSize(9)
      .fillColor('#111827');

    detailPairs
      .filter(([, value]) => Boolean(value))
      .forEach(([label, value]) => {
        doc.text(`${label}: ${value}`, 50, yPosition);
        yPosition += 14;
      });

    doc.text(`Reference: ${invoiceNumber}`, 50, yPosition);
    yPosition += 16;

    if (account.notes) {
      doc.font('Helvetica-Oblique')
        .fillColor('#6b7280')
        .text(account.notes, 50, yPosition, { width: 460 });
      yPosition += 18;
    }

    doc.fillColor('#111827');
    return yPosition + 6;
  }

  /**
   * Generate XML invoice (UBL 2.1 format for e-invoicing)
   */
  private async generateXML(data: {
    invoiceNumber: string;
    customer: CustomerInfo;
    issueDate: Date;
    dueDate: Date;
    lineItems: InvoiceLineItem[];
    subtotalCents: number;
    vatRate: number;
    vatCents: number;
    totalCents: number;
  }): Promise<string> {
    const builder = new XMLBuilder({
      format: true,
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
    });

    const invoiceXml = {
      '?xml': { '@_version': '1.0', '@_encoding': 'UTF-8' },
      Invoice: {
        '@_xmlns': 'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2',
        '@_xmlns:cac': 'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2',
        '@_xmlns:cbc': 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2',

        'cbc:ID': data.invoiceNumber,
        'cbc:IssueDate': format(data.issueDate, 'yyyy-MM-dd'),
        'cbc:DueDate': format(data.dueDate, 'yyyy-MM-dd'),
        'cbc:InvoiceTypeCode': '380', // Commercial invoice
        'cbc:DocumentCurrencyCode': 'EUR',

        'cac:AccountingSupplierParty': {
          'cac:Party': {
            'cac:PartyName': {
              'cbc:Name': 'Bel Consulting OÜ',
            },
            'cac:PostalAddress': {
              'cbc:StreetName': 'Narva mnt 5',
              'cbc:CityName': 'Tallinn',
              'cbc:PostalZone': '10117',
              'cac:Country': {
                'cbc:IdentificationCode': 'EE',
              },
            },
            'cac:PartyTaxScheme': {
              'cbc:CompanyID': 'EE102736890',
              'cac:TaxScheme': {
                'cbc:ID': 'VAT',
              },
            },
            'cac:PartyLegalEntity': {
              'cbc:RegistrationName': 'Bel Consulting OÜ',
              'cbc:CompanyID': '16736399',
            },
          },
        },

        'cac:AccountingCustomerParty': {
          'cac:Party': {
            'cac:PartyName': {
              'cbc:Name': data.customer.companyName || data.customer.name,
            },
            'cac:PostalAddress': {
              'cbc:StreetName': data.customer.address || '',
              'cbc:CityName': data.customer.city || '',
              'cbc:PostalZone': data.customer.postalCode || '',
              'cac:Country': {
                'cbc:IdentificationCode': data.customer.country || '',
              },
            },
            ...(data.customer.vatId && {
              'cac:PartyTaxScheme': {
                'cbc:CompanyID': data.customer.vatId,
                'cac:TaxScheme': {
                  'cbc:ID': 'VAT',
                },
              },
            }),
          },
        },

        'cac:PaymentMeans': {
          'cbc:PaymentMeansCode': '30', // Credit transfer
          'cac:PayeeFinancialAccount': {
            'cbc:ID': 'EE907700771234567890',
            'cac:FinancialInstitutionBranch': {
              'cbc:ID': 'TRWIBEB1XXX',
            },
          },
        },

        'cac:TaxTotal': {
          'cbc:TaxAmount': {
            '@_currencyID': 'EUR',
            '#text': (data.vatCents / 100).toFixed(2),
          },
          'cac:TaxSubtotal': {
            'cbc:TaxableAmount': {
              '@_currencyID': 'EUR',
              '#text': (data.subtotalCents / 100).toFixed(2),
            },
            'cbc:TaxAmount': {
              '@_currencyID': 'EUR',
              '#text': (data.vatCents / 100).toFixed(2),
            },
            'cac:TaxCategory': {
              'cbc:ID': data.vatRate === 0 ? 'E' : 'S', // E = Exempt, S = Standard
              'cbc:Percent': (data.vatRate * 100).toFixed(0),
              'cac:TaxScheme': {
                'cbc:ID': 'VAT',
              },
            },
          },
        },

        'cac:LegalMonetaryTotal': {
          'cbc:LineExtensionAmount': {
            '@_currencyID': 'EUR',
            '#text': (data.subtotalCents / 100).toFixed(2),
          },
          'cbc:TaxExclusiveAmount': {
            '@_currencyID': 'EUR',
            '#text': (data.subtotalCents / 100).toFixed(2),
          },
          'cbc:TaxInclusiveAmount': {
            '@_currencyID': 'EUR',
            '#text': (data.totalCents / 100).toFixed(2),
          },
          'cbc:PayableAmount': {
            '@_currencyID': 'EUR',
            '#text': (data.totalCents / 100).toFixed(2),
          },
        },

        'cac:InvoiceLine': data.lineItems.map((item, index) => ({
          'cbc:ID': (index + 1).toString(),
          'cbc:InvoicedQuantity': {
            '@_unitCode': 'EA',
            '#text': item.quantity.toString(),
          },
          'cbc:LineExtensionAmount': {
            '@_currencyID': 'EUR',
            '#text': (item.amountCents / 100).toFixed(2),
          },
          'cac:Item': {
            'cbc:Description': item.description,
            'cbc:Name': item.description,
          },
          'cac:Price': {
            'cbc:PriceAmount': {
              '@_currencyID': 'EUR',
              '#text': (item.unitPriceCents / 100).toFixed(2),
            },
          },
        })),
      },
    };

    return builder.build(invoiceXml);
  }

  /**
   * Upload file to S3 with 7-year retention and Object Lock
   */
  private async uploadToS3(key: string, content: Buffer | string, contentType: string): Promise<void> {
    const command = new PutObjectCommand({
      Bucket: this.s3Bucket,
      Key: key,
      Body: typeof content === 'string' ? Buffer.from(content) : content,
      ContentType: contentType,
      ObjectLockMode: 'COMPLIANCE',
      ObjectLockRetainUntilDate: new Date(Date.now() + 7 * 365 * 24 * 60 * 60 * 1000), // 7 years
      ServerSideEncryption: 'AES256',
      Metadata: {
        'generated-at': new Date().toISOString(),
        'retention-years': '7',
      },
    });

    await this.s3Client.send(command);
  }

  /**
   * Store document metadata in database
   */
  private async storeDocumentMetadata(
    client: any,
    invoiceId: string,
    s3Key: string,
    content: Buffer | string,
    documentType: string
  ): Promise<void> {
    const buffer = typeof content === 'string' ? Buffer.from(content) : content;
    const hash = crypto.createHash('sha256').update(buffer).digest('hex');
    const retentionUntil = new Date(Date.now() + 7 * 365 * 24 * 60 * 60 * 1000); // 7 years

    await client.query(
      `INSERT INTO financial_documents (
        document_type, document_number, title,
        s3_bucket, s3_key, file_size_bytes, content_type,
        sha256_hash, retention_until, is_locked,
        related_entity_type, related_entity_id, fiscal_year
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
        documentType,
        s3Key.split('/').pop()?.split('.')[0], // Extract filename without extension
        `Invoice ${s3Key.split('/').pop()}`,
        this.s3Bucket,
        s3Key,
        buffer.length,
        s3Key.endsWith('.pdf') ? 'application/pdf' : 'application/xml',
        hash,
        retentionUntil,
        true,
        'invoice',
        invoiceId,
        new Date().getFullYear(),
      ]
    );
  }

  /**
   * Get customer information
   */
  private async getCustomerInfo(client: any, customerId: string): Promise<CustomerInfo> {
    const result = await client.query(
      `SELECT id, email, name, company_name, address, city, postal_code, country, vat_id
       FROM users
       WHERE id = $1`,
      [customerId]
    );

    if (result.rows.length === 0) {
      throw new Error(`Customer not found: ${customerId}`);
    }

    const row = result.rows[0];
    return {
      id: row.id,
      email: row.email,
      name: row.name,
      companyName: row.company_name,
      address: row.address,
      city: row.city,
      postalCode: row.postal_code,
      country: row.country,
      vatId: row.vat_id,
    };
  }

  /**
   * Get VAT rate based on customer location
   */
  private getVatRate(customer: CustomerInfo): number {
    // Estonia: 20% standard rate
    if (customer.country === 'EE') {
      return 0.20;
    }

    // EU B2B reverse charge: 0% (if valid VAT ID)
    if (customer.country && EU_COUNTRIES.includes(customer.country) && customer.vatId) {
      return 0.00;
    }

    // Non-EU: 0% (out of scope for Estonian VAT)
    return 0.00;
  }

  /**
   * Get next sequential invoice number
   */
  private async getNextInvoiceNumber(client: any): Promise<string> {
    // Lock to prevent race conditions
    await client.query('LOCK TABLE invoices IN EXCLUSIVE MODE');

    const result = await client.query(
      `SELECT invoice_number FROM invoices
       ORDER BY created_at DESC
       LIMIT 1`
    );

    let nextNumber = 1;
    if (result.rows.length > 0) {
      const lastNumber = result.rows[0].invoice_number;
      const match = lastNumber.match(/INV-(\d+)/);
      if (match) {
        nextNumber = parseInt(match[1], 10) + 1;
      }
    }

    return `INV-${nextNumber.toString().padStart(6, '0')}`;
  }
}
