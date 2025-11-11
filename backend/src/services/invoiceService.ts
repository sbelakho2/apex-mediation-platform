/**
 * Invoice Service
 * Handles invoice generation, retrieval, PDF generation, and Stripe integration
 */

import { Pool } from 'pg';
import Stripe from 'stripe';
import PDFDocument from 'pdfkit';
import crypto from 'crypto';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2025-10-29.clover',
});

const db = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export interface Invoice {
  id: string;
  invoice_number: string;
  customer_id: string;
  subscription_id: string | null;
  invoice_date: string;
  due_date: string;
  amount_cents: number;
  tax_amount_cents: number;
  total_amount_cents: number;
  currency: string;
  status: 'pending' | 'paid' | 'overdue' | 'cancelled' | 'refunded';
  paid_at: string | null;
  stripe_invoice_id: string | null;
  pdf_url: string | null;
  line_items: Array<{
    description: string;
    quantity: number;
    unit_price_cents: number;
    total_cents: number;
  }>;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export class InvoiceService {
  /**
   * List invoices for a customer with pagination and filtering
   */
  async listInvoices(
    customerId: string,
    page: number,
    limit: number,
    filters?: {
      status?: string;
      from?: string;
      to?: string;
    }
  ): Promise<{ invoices: Invoice[]; total: number }> {
    let query = `
      SELECT *
      FROM invoices
      WHERE customer_id = $1
    `;
    const params: any[] = [customerId];
    let paramIndex = 2;

    if (filters?.status) {
      query += ` AND status = $${paramIndex}`;
      params.push(filters.status);
      paramIndex++;
    }

    if (filters?.from) {
      query += ` AND invoice_date >= $${paramIndex}`;
      params.push(filters.from);
      paramIndex++;
    }

    if (filters?.to) {
      query += ` AND invoice_date <= $${paramIndex}`;
      params.push(filters.to);
      paramIndex++;
    }

    // Get total count
    const countQuery = query.replace('SELECT *', 'SELECT COUNT(*) as count');
    const countResult = await db.query(countQuery, params);
    const total = parseInt(countResult.rows[0].count, 10);

    // Get paginated results
    query += ` ORDER BY invoice_date DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, (page - 1) * limit);

    const result = await db.query(query, params);

    return {
      invoices: result.rows as Invoice[],
      total,
    };
  }

  /**
   * Get a specific invoice
   */
  async getInvoice(invoiceId: string, customerId: string): Promise<Invoice | null> {
    const result = await db.query(
      `SELECT * FROM invoices WHERE id = $1 AND customer_id = $2`,
      [invoiceId, customerId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0] as Invoice;
  }

  /**
   * Generate ETag for invoice (for caching)
   */
  generateInvoiceETag(invoice: Invoice): string {
    const data = `${invoice.id}-${invoice.updated_at}`;
    return crypto.createHash('md5').update(data).digest('hex');
  }

  /**
   * Generate invoice PDF
   */
  async generateInvoicePDF(invoice: Invoice): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50 });
      const buffers: Buffer[] = [];

      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      // Header
      doc
        .fontSize(20)
        .text('INVOICE', { align: 'right' })
        .fontSize(10)
        .text(`Invoice #: ${invoice.invoice_number}`, { align: 'right' })
        .text(`Date: ${new Date(invoice.invoice_date).toLocaleDateString()}`, {
          align: 'right',
        })
        .text(`Due Date: ${new Date(invoice.due_date).toLocaleDateString()}`, {
          align: 'right',
        })
        .moveDown();

      // Company info
      doc
        .fontSize(12)
        .text('ApexMediation', 50, 150)
        .fontSize(10)
        .text('Bel Consulting OÜ', 50, 165)
        .text('Registry Code: [TBD]', 50, 180)
        .text('VAT: [TBD]', 50, 195)
        .moveDown();

      // Customer info (fetch from database)
      doc
        .fontSize(12)
        .text('Bill To:', 300, 150)
        .fontSize(10)
        .text('[Customer Name]', 300, 165)
        .text('[Customer Address]', 300, 180)
        .moveDown();

      // Line items table
      doc.moveDown(2);
      const tableTop = 280;
      
      doc
        .fontSize(10)
        .text('Description', 50, tableTop, { width: 250 })
        .text('Qty', 320, tableTop, { width: 50 })
        .text('Price', 380, tableTop, { width: 80, align: 'right' })
        .text('Total', 470, tableTop, { width: 80, align: 'right' });

      doc
        .moveTo(50, tableTop + 15)
        .lineTo(550, tableTop + 15)
        .stroke();

      let yPosition = tableTop + 25;

      for (const item of invoice.line_items) {
        doc
          .fontSize(9)
          .text(item.description, 50, yPosition, { width: 250 })
          .text(item.quantity.toString(), 320, yPosition, { width: 50 })
          .text(`$${(item.unit_price_cents / 100).toFixed(2)}`, 380, yPosition, {
            width: 80,
            align: 'right',
          })
          .text(`$${(item.total_cents / 100).toFixed(2)}`, 470, yPosition, {
            width: 80,
            align: 'right',
          });
        yPosition += 20;
      }

      // Totals
      yPosition += 20;
      doc
        .moveTo(350, yPosition)
        .lineTo(550, yPosition)
        .stroke();

      yPosition += 10;
      doc
        .fontSize(10)
        .text('Subtotal:', 350, yPosition)
        .text(`$${(invoice.amount_cents / 100).toFixed(2)}`, 470, yPosition, {
          width: 80,
          align: 'right',
        });

      yPosition += 20;
      doc
        .text('Tax:', 350, yPosition)
        .text(`$${(invoice.tax_amount_cents / 100).toFixed(2)}`, 470, yPosition, {
          width: 80,
          align: 'right',
        });

      yPosition += 20;
      doc
        .fontSize(12)
        .text('Total:', 350, yPosition)
        .text(`$${(invoice.total_amount_cents / 100).toFixed(2)}`, 470, yPosition, {
          width: 80,
          align: 'right',
        });

      // Payment status
      yPosition += 40;
      if (invoice.status === 'paid') {
        doc
          .fontSize(14)
          .fillColor('green')
          .text('PAID', 250, yPosition, { align: 'center' })
          .fillColor('black');
      } else {
        doc
          .fontSize(14)
          .fillColor('red')
          .text(`Status: ${invoice.status.toUpperCase()}`, 250, yPosition, {
            align: 'center',
          })
          .fillColor('black');
      }

      // Notes
      if (invoice.notes) {
        yPosition += 40;
        doc.fontSize(8).text('Notes:', 50, yPosition).text(invoice.notes, 50, yPosition + 15);
      }

      // Footer
      doc
        .fontSize(8)
        .text(
          'Thank you for your business!',
          50,
          doc.page.height - 50,
          { align: 'center' }
        );

      doc.end();
    });
  }

  /**
   * Create invoice via Stripe
   */
  async createStripeInvoice(
    customerId: string,
    subscriptionId: string,
    lineItems: Array<{
      description: string;
      amount_cents: number;
    }>
  ): Promise<string> {
    // Get Stripe customer ID
    const customer = await db.query(
      `SELECT stripe_customer_id FROM users WHERE id = $1`,
      [customerId]
    );

    if (!customer.rows[0]?.stripe_customer_id) {
      throw new Error('Customer does not have Stripe customer ID');
    }

    const stripeCustomerId = customer.rows[0].stripe_customer_id;

    // Create invoice in Stripe
    const invoice = await stripe.invoices.create({
      customer: stripeCustomerId,
      auto_advance: true,
      collection_method: 'charge_automatically',
      metadata: {
        subscription_id: subscriptionId,
      },
    });

    // Add line items
    for (const item of lineItems) {
      await stripe.invoiceItems.create({
        customer: stripeCustomerId,
        invoice: invoice.id,
        description: item.description,
        amount: item.amount_cents,
        currency: 'usd',
      });
    }

    // Finalize invoice
    await stripe.invoices.finalizeInvoice(invoice.id);

    return invoice.id;
  }

  /**
   * Sync invoice from Stripe to database
   */
  async syncInvoiceFromStripe(stripeInvoiceId: string): Promise<void> {
    const stripeInvoice = await stripe.invoices.retrieve(stripeInvoiceId);

    const lineItems = stripeInvoice.lines.data.map((line: any) => ({
      description: line.description || '',
      quantity: line.quantity || 1,
      unit_price_cents: line.price?.unit_amount || 0,
      total_cents: line.amount,
    }));

    await db.query(
      `INSERT INTO invoices (
        customer_id,
        invoice_number,
        invoice_date,
        due_date,
        amount_cents,
        tax_amount_cents,
        total_amount_cents,
        currency,
        status,
        paid_at,
        stripe_invoice_id,
        line_items
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      ON CONFLICT (stripe_invoice_id) DO UPDATE SET
        status = EXCLUDED.status,
        paid_at = EXCLUDED.paid_at,
        updated_at = NOW()`,
      [
        stripeInvoice.metadata?.customer_id || null,
        stripeInvoice.number,
        new Date(stripeInvoice.created * 1000),
        new Date(stripeInvoice.due_date! * 1000),
        stripeInvoice.subtotal,
        (stripeInvoice as any).tax || 0,
        stripeInvoice.total,
        stripeInvoice.currency,
        stripeInvoice.status === 'paid' ? 'paid' : 'pending',
        stripeInvoice.status_transitions?.paid_at
          ? new Date(stripeInvoice.status_transitions.paid_at * 1000)
          : null,
        stripeInvoice.id,
        JSON.stringify(lineItems),
      ]
    );
  }
}

export const invoiceService = new InvoiceService();
