import { Pool } from 'pg';
import Stripe from 'stripe';
import axios from 'axios';
import { EventEmitter } from 'events';

// Extend Stripe Invoice type to include expanded fields
interface ExpandedStripeInvoice extends Stripe.Invoice {
  payment_intent?: string | Stripe.PaymentIntent;
  charge?: string | Stripe.Charge;
}

/**
 * Payment Reconciliation Service
 * 
 * Automatically matches incoming payments with customer invoices.
 * Supports Stripe, Paddle, and bank transfers.
 * Creates double-entry ledger entries for all transactions.
 * 
 * Estonian Compliance:
 * - Converts all amounts to EUR for accounting
 * - Uses ECB exchange rates for consistency
 * - Maintains audit trail for 7 years
 */

export interface PaymentData {
  customerId: string;
  invoiceId?: string;
  amountCents: number;
  currency: string;
  paymentMethod: string;
  processor: 'stripe' | 'paddle' | 'bank' | 'manual';
  stripePaymentId?: string;
  stripeChargeId?: string;
  paddlePaymentId?: string;
  bankTransactionId?: string;
  metadata?: Record<string, any>;
}

export interface ExchangeRate {
  baseCurrency: string;
  targetCurrency: string;
  rate: number;
  date: string;
}

export class PaymentReconciliationService extends EventEmitter {
  constructor(
    private db: Pool,
    private stripe: Stripe
  ) {
    super();
  }

  /**
   * Handle Stripe webhook events
   */
  async handleStripeWebhook(event: Stripe.Event): Promise<void> {
    console.log(`[PaymentReconciliation] Processing Stripe event: ${event.type}`);

    try {
      switch (event.type) {
        case 'invoice.paid':
          await this.handleStripeinvoicePaid(event.data.object as Stripe.Invoice);
          break;

        case 'payment_intent.succeeded':
          await this.handleStripePaymentIntentSucceeded(event.data.object as Stripe.PaymentIntent);
          break;

        case 'charge.succeeded':
          await this.handleStripeChargeSucceeded(event.data.object as Stripe.Charge);
          break;

        case 'charge.refunded':
          await this.handleStripeChargeRefunded(event.data.object as Stripe.Charge);
          break;

        case 'invoice.payment_failed':
          await this.handleStripeInvoicePaymentFailed(event.data.object as Stripe.Invoice);
          break;

        default:
          console.log(`[PaymentReconciliation] Unhandled event type: ${event.type}`);
      }
    } catch (error) {
      console.error(`[PaymentReconciliation] Error processing webhook:`, error);
      throw error;
    }
  }

  /**
   * Handle successful Stripe invoice payment
   */
  private async handleStripeinvoicePaid(invoice: ExpandedStripeInvoice): Promise<void> {
    const customerId = await this.getCustomerIdFromStripe(invoice.customer as string);

    await this.recordPayment({
      customerId,
      amountCents: invoice.amount_paid,
      currency: invoice.currency.toUpperCase(),
      paymentMethod: this.extractPaymentMethod(invoice),
      processor: 'stripe',
      stripePaymentId: typeof invoice.payment_intent === 'string' ? invoice.payment_intent : invoice.payment_intent?.id,
      stripeChargeId: typeof invoice.charge === 'string' ? invoice.charge : invoice.charge?.id,
      metadata: {
        stripeInvoiceId: invoice.id,
        billingReason: invoice.billing_reason,
      },
    });
  }

  /**
   * Handle successful payment intent
   */
  private async handleStripePaymentIntentSucceeded(paymentIntent: Stripe.PaymentIntent): Promise<void> {
    // Only process if not already handled by invoice.paid
    const existingPayment = await this.db.query(
      'SELECT id FROM payments WHERE stripe_payment_id = $1',
      [paymentIntent.id]
    );

    if (existingPayment.rows.length > 0) {
      console.log(`[PaymentReconciliation] Payment already recorded: ${paymentIntent.id}`);
      return;
    }

    const customerId = await this.getCustomerIdFromStripe(paymentIntent.customer as string);

    await this.recordPayment({
      customerId,
      amountCents: paymentIntent.amount_received,
      currency: paymentIntent.currency.toUpperCase(),
      paymentMethod: this.extractPaymentMethodFromPaymentIntent(paymentIntent),
      processor: 'stripe',
      stripePaymentId: paymentIntent.id,
      metadata: {
        description: paymentIntent.description,
      },
    });
  }

  /**
   * Handle successful charge
   */
  private async handleStripeChargeSucceeded(charge: Stripe.Charge): Promise<void> {
    // Update payment record if exists
    const result = await this.db.query(
      `UPDATE payments 
       SET stripe_charge_id = $1, 
           status = 'completed',
           updated_at = NOW()
       WHERE stripe_payment_id = $2
       RETURNING id`,
      [charge.id, charge.payment_intent]
    );

    if (result.rows.length === 0) {
      console.log(`[PaymentReconciliation] No payment found for charge: ${charge.id}`);
    }
  }

  /**
   * Handle charge refund
   */
  private async handleStripeChargeRefunded(charge: Stripe.Charge): Promise<void> {
    const payment = await this.db.query(
      'SELECT * FROM payments WHERE stripe_charge_id = $1',
      [charge.id]
    );

    if (payment.rows.length === 0) {
      console.warn(`[PaymentReconciliation] No payment found for refunded charge: ${charge.id}`);
      return;
    }

    const paymentData = payment.rows[0];

    // Update payment status
    await this.db.query(
      `UPDATE payments 
       SET status = 'refunded', updated_at = NOW()
       WHERE id = $1`,
      [paymentData.id]
    );

    // Create reversal ledger entries
    await this.createRefundLedgerEntries(paymentData, charge.amount_refunded);

    // Update invoice status
    if (paymentData.invoice_id) {
      await this.db.query(
        `UPDATE invoices 
         SET status = 'cancelled', updated_at = NOW()
         WHERE id = $1`,
        [paymentData.invoice_id]
      );
    }

    this.emit('payment.refunded', { paymentId: paymentData.id, amountCents: charge.amount_refunded });
  }

  /**
   * Handle failed Stripe invoice payment
   */
  private async handleStripeInvoicePaymentFailed(invoice: ExpandedStripeInvoice): Promise<void> {
    const customerId = await this.getCustomerIdFromStripe(invoice.customer as string);

    // Record failed payment attempt
    await this.db.query(
      `INSERT INTO payments (
        customer_id, amount_cents, currency, amount_eur_cents,
        payment_method, payment_processor, stripe_payment_id,
        status, failure_code, failure_message, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        customerId,
        invoice.amount_due,
        invoice.currency.toUpperCase(),
        await this.convertToEur(invoice.amount_due, invoice.currency.toUpperCase()),
        this.extractPaymentMethod(invoice),
        'stripe',
        invoice.payment_intent,
        'failed',
        (invoice as any).last_payment_error?.code,
        (invoice as any).last_payment_error?.message,
        JSON.stringify({ stripeInvoiceId: invoice.id }),
      ]
    );

    // Update subscription failed payment count
    await this.db.query(
      `UPDATE subscriptions 
       SET failed_payment_count = failed_payment_count + 1,
           last_failed_payment_at = NOW()
       WHERE stripe_customer_id = $1`,
      [invoice.customer]
    );

    this.emit('payment.failed', { customerId, invoiceId: invoice.id });
  }

  /**
   * Record a payment and create ledger entries
   */
  async recordPayment(data: PaymentData): Promise<string> {
    const client = await this.db.connect();

    try {
      await client.query('BEGIN');

      // 1. Convert to EUR if needed
      const amountEurCents = await this.convertToEur(data.amountCents, data.currency);
      const exchangeRate = data.currency === 'EUR' ? null : await this.getExchangeRate(data.currency, 'EUR');

      // 2. Find matching invoice (if not provided)
      let invoiceId = data.invoiceId;
      if (!invoiceId) {
        const matchedInvoiceId = await this.findMatchingInvoice(client, data.customerId, amountEurCents);
        invoiceId = matchedInvoiceId ?? undefined;
      }

      // 3. Create payment record
      const paymentResult = await client.query(
        `INSERT INTO payments (
          customer_id, invoice_id, amount_cents, currency, amount_eur_cents,
          exchange_rate, payment_method, payment_processor,
          stripe_payment_id, stripe_charge_id, paddle_payment_id, bank_transaction_id,
          status, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        RETURNING id`,
        [
          data.customerId,
          invoiceId,
          data.amountCents,
          data.currency,
          amountEurCents,
          exchangeRate?.rate,
          data.paymentMethod,
          data.processor,
          data.stripePaymentId,
          data.stripeChargeId,
          data.paddlePaymentId,
          data.bankTransactionId,
          'completed',
          JSON.stringify(data.metadata || {}),
        ]
      );

      const paymentId = paymentResult.rows[0].id;

      // 4. Update invoice status
      if (invoiceId) {
        await client.query(
          `UPDATE invoices 
           SET status = 'paid', paid_at = NOW(), payment_reference = $1, updated_at = NOW()
           WHERE id = $2`,
          [data.stripePaymentId || data.bankTransactionId, invoiceId]
        );

        // Get invoice details for ledger entries
        const invoiceResult = await client.query(
          'SELECT * FROM invoices WHERE id = $1',
          [invoiceId]
        );
        const invoice = invoiceResult.rows[0];

        // 5. Create ledger entries (double-entry bookkeeping)
        await this.createPaymentLedgerEntries(client, paymentId, invoice, data);
      }

      // 6. Mark payment as reconciled
      await client.query(
        `UPDATE payments 
         SET reconciled_at = NOW(), reconciliation_notes = $1
         WHERE id = $2`,
        ['Automatically reconciled', paymentId]
      );

      await client.query('COMMIT');

      console.log(`[PaymentReconciliation] Payment recorded: ${paymentId}`);
      this.emit('payment.recorded', { paymentId, invoiceId, amountCents: data.amountCents });

      return paymentId;
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('[PaymentReconciliation] Error recording payment:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Create double-entry ledger entries for a payment
   */
  private async createPaymentLedgerEntries(
    client: any,
    paymentId: string,
    invoice: any,
    paymentData: PaymentData
  ): Promise<void> {
    const transactionId = this.generateTransactionId();
    const entryDate = new Date().toISOString().split('T')[0];

    // Calculate VAT and net amounts
    const totalCents = invoice.amount_eur_cents;
    const vatCents = invoice.vat_cents;
    const netCents = invoice.subtotal_cents;

    // Determine bank account based on payment processor
    const bankAccount = this.getBankAccountCode(paymentData.processor);

    // Entry 1: Debit Bank Account (Asset increases)
    await client.query(
      `INSERT INTO ledger_entries (
        transaction_id, entry_date, account_code, account_name, account_type,
        debit_cents, credit_cents, description, reference_type, reference_id
      ) VALUES ($1, $2, $3, $4, $5, $6, NULL, $7, $8, $9)`,
      [
        transactionId,
        entryDate,
        bankAccount,
        this.getBankAccountName(paymentData.processor),
        'asset',
        totalCents,
        `Payment received from customer ${invoice.customer_id}`,
        'payment',
        paymentId,
      ]
    );

    // Entry 2: Credit Revenue (Income increases)
    await client.query(
      `INSERT INTO ledger_entries (
        transaction_id, entry_date, account_code, account_name, account_type,
        debit_cents, credit_cents, description, reference_type, reference_id
      ) VALUES ($1, $2, $3, $4, $5, NULL, $6, $7, $8, $9)`,
      [
        transactionId,
        entryDate,
        '4100',
        'Subscription Revenue',
        'revenue',
        netCents,
        `Subscription payment - Invoice ${invoice.invoice_number}`,
        'invoice',
        invoice.id,
      ]
    );

    // Entry 3: Credit VAT Liability (Liability increases)
    if (vatCents > 0) {
      await client.query(
        `INSERT INTO ledger_entries (
          transaction_id, entry_date, account_code, account_name, account_type,
          debit_cents, credit_cents, description, reference_type, reference_id
        ) VALUES ($1, $2, $3, $4, $5, NULL, $6, $7, $8, $9)`,
        [
          transactionId,
          entryDate,
          '2200',
          'VAT Payable',
          'liability',
          vatCents,
          `VAT collected - Invoice ${invoice.invoice_number}`,
          'invoice',
          invoice.id,
        ]
      );
    }

    console.log(`[PaymentReconciliation] Created ledger entries for transaction: ${transactionId}`);
  }

  /**
   * Create reversal ledger entries for refunds
   */
  private async createRefundLedgerEntries(payment: any, refundAmountCents: number): Promise<void> {
    const client = await this.db.connect();

    try {
      await client.query('BEGIN');

      const transactionId = this.generateTransactionId();
      const entryDate = new Date().toISOString().split('T')[0];

      // Get invoice details to calculate VAT
      const invoice = await client.query('SELECT * FROM invoices WHERE id = $1', [payment.invoice_id]);
      const invoiceData = invoice.rows[0];

      const vatRate = invoiceData.vat_rate;
      const vatCents = Math.round(refundAmountCents * vatRate);
      const netCents = refundAmountCents - vatCents;

      const bankAccount = this.getBankAccountCode(payment.payment_processor);

      // Reverse Entry 1: Credit Bank Account (Asset decreases)
      await client.query(
        `INSERT INTO ledger_entries (
          transaction_id, entry_date, account_code, account_name, account_type,
          debit_cents, credit_cents, description, reference_type, reference_id
        ) VALUES ($1, $2, $3, $4, $5, NULL, $6, $7, $8, $9)`,
        [
          transactionId,
          entryDate,
          bankAccount,
          this.getBankAccountName(payment.payment_processor),
          'asset',
          refundAmountCents,
          `Refund issued to customer ${payment.customer_id}`,
          'payment',
          payment.id,
        ]
      );

      // Reverse Entry 2: Debit Revenue (Income decreases)
      await client.query(
        `INSERT INTO ledger_entries (
          transaction_id, entry_date, account_code, account_name, account_type,
          debit_cents, credit_cents, description, reference_type, reference_id
        ) VALUES ($1, $2, $3, $4, $5, $6, NULL, $7, $8, $9)`,
        [
          transactionId,
          entryDate,
          '4100',
          'Subscription Revenue',
          'revenue',
          netCents,
          `Refund - Invoice ${invoiceData.invoice_number}`,
          'payment',
          payment.id,
        ]
      );

      // Reverse Entry 3: Debit VAT Liability (Liability decreases)
      if (vatCents > 0) {
        await client.query(
          `INSERT INTO ledger_entries (
            transaction_id, entry_date, account_code, account_name, account_type,
            debit_cents, credit_cents, description, reference_type, reference_id
          ) VALUES ($1, $2, $3, $4, $5, $6, NULL, $7, $8, $9)`,
          [
            transactionId,
            entryDate,
            '2200',
            'VAT Payable',
            'liability',
            vatCents,
            `VAT refund - Invoice ${invoiceData.invoice_number}`,
            'payment',
            payment.id,
          ]
        );
      }

      await client.query('COMMIT');
      console.log(`[PaymentReconciliation] Created refund ledger entries: ${transactionId}`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Find matching invoice for a payment
   */
  private async findMatchingInvoice(
    client: any,
    customerId: string,
    amountEurCents: number
  ): Promise<string | null> {
    // Look for issued invoices within ±2% of payment amount
    const tolerance = 0.02;
    const minAmount = Math.floor(amountEurCents * (1 - tolerance));
    const maxAmount = Math.ceil(amountEurCents * (1 + tolerance));

    const result = await client.query(
      `SELECT id FROM invoices
       WHERE customer_id = $1
         AND status IN ('issued', 'sent')
         AND amount_eur_cents BETWEEN $2 AND $3
       ORDER BY issue_date DESC
       LIMIT 1`,
      [customerId, minAmount, maxAmount]
    );

    if (result.rows.length > 0) {
      return result.rows[0].id;
    }

    console.warn(`[PaymentReconciliation] No matching invoice found for customer ${customerId}, amount ${amountEurCents}`);
    return null;
  }

  /**
   * Convert amount to EUR using ECB exchange rates
   */
  private async convertToEur(amountCents: number, currency: string): Promise<number> {
    if (currency === 'EUR') {
      return amountCents;
    }

    const exchangeRate = await this.getExchangeRate(currency, 'EUR');
    return Math.round(amountCents * exchangeRate.rate);
  }

  /**
   * Get exchange rate from European Central Bank
   */
  private async getExchangeRate(fromCurrency: string, toCurrency: string): Promise<ExchangeRate> {
    // In production, use ECB API: https://www.ecb.europa.eu/stats/eurofxref/
    // For now, using a simplified approach
    const response = await axios.get(
      `https://api.exchangerate.host/latest?base=${fromCurrency}&symbols=${toCurrency}`
    );

    const rate = response.data.rates[toCurrency];

    return {
      baseCurrency: fromCurrency,
      targetCurrency: toCurrency,
      rate,
      date: response.data.date,
    };
  }

  /**
   * Get customer ID from Stripe customer ID
   */
  private async getCustomerIdFromStripe(stripeCustomerId: string): Promise<string> {
    const result = await this.db.query(
      'SELECT id FROM users WHERE stripe_customer_id = $1',
      [stripeCustomerId]
    );

    if (result.rows.length === 0) {
      throw new Error(`No customer found for Stripe ID: ${stripeCustomerId}`);
    }

    return result.rows[0].id;
  }

  /**
   * Extract payment method from Stripe invoice
   */
  private extractPaymentMethod(invoice: ExpandedStripeInvoice): string {
    if (invoice.payment_intent) {
      const paymentIntent = typeof invoice.payment_intent === 'string' ? null : invoice.payment_intent;
      if (paymentIntent?.payment_method) {
        const pm = paymentIntent.payment_method as Stripe.PaymentMethod;
        return pm.type || 'card';
      }
    }
    return 'unknown';
  }

  /**
   * Extract payment method from payment intent
   */
  private extractPaymentMethodFromPaymentIntent(paymentIntent: Stripe.PaymentIntent): string {
    if (paymentIntent.payment_method) {
      const pm = paymentIntent.payment_method as Stripe.PaymentMethod;
      return pm.type || 'card';
    }
    return 'unknown';
  }

  /**
   * Get bank account code based on payment processor
   */
  private getBankAccountCode(processor: string): string {
    const codes: Record<string, string> = {
      stripe: '1110',
      paddle: '1110',
      bank: '1120',
      manual: '1120',
    };
    return codes[processor] || '1100';
  }

  /**
   * Get bank account name based on payment processor
   */
  private getBankAccountName(processor: string): string {
    const names: Record<string, string> = {
      stripe: 'Bank - Stripe',
      paddle: 'Bank - Stripe',
      bank: 'Bank - Wise',
      manual: 'Bank - Wise',
    };
    return names[processor] || 'Bank Accounts';
  }

  /**
   * Generate unique transaction ID for ledger entries
   */
  private generateTransactionId(): string {
    return `TXN-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}
