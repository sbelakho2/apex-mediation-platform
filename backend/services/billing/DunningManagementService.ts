// services/billing/DunningManagementService.ts
// Automated failed payment retry logic with progressive email sequences

import { Pool } from 'pg';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-10-29.clover',
});

const db = new Pool({
  connectionString: process.env.DATABASE_URL,
});

interface DunningAttempt {
  id: string;
  customer_id: string;
  subscription_id: string;
  invoice_id: string;
  attempt_number: number;
  next_retry_at: Date;
  status: 'pending' | 'retrying' | 'succeeded' | 'failed' | 'suspended';
  created_at: Date;
}

interface DunningConfig {
  max_retries: number;
  retry_schedule_days: number[]; // e.g., [1, 3, 7] = retry after 1, 3, and 7 days
  suspend_after_failures: boolean;
  grace_period_days: number;
}

const DEFAULT_DUNNING_CONFIG: DunningConfig = {
  max_retries: 3,
  retry_schedule_days: [1, 3, 7], // Retry after 1, 3, and 7 days
  suspend_after_failures: true,
  grace_period_days: 3, // 3 days grace before first retry
};

export class DunningManagementService {
  /**
   * Handle failed payment from Stripe webhook
   */
  async handlePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
    console.log(`[Dunning] Payment failed for invoice ${invoice.id}`);

    const customerId = invoice.customer as string;
    const subscriptionId = (invoice as any).subscription as string;

    // Check if we already have a dunning process for this invoice
    const existing = await db.query(
      `SELECT id FROM dunning_attempts WHERE invoice_id = $1`,
      [invoice.id]
    );

    if (existing.rows.length > 0) {
      console.log(`[Dunning] Dunning process already exists for invoice ${invoice.id}`);
      return;
    }

    // Create new dunning attempt
    const nextRetry = new Date();
    nextRetry.setDate(
      nextRetry.getDate() + DEFAULT_DUNNING_CONFIG.grace_period_days
    );

    await db.query(
      `INSERT INTO dunning_attempts 
       (customer_id, subscription_id, invoice_id, attempt_number, next_retry_at, status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
      [customerId, subscriptionId, invoice.id, 0, nextRetry, 'pending']
    );

    // Send immediate payment failed notification
    await this.sendPaymentFailedEmail(customerId, invoice, 0);

    // Update subscription status
    await db.query(
      `UPDATE subscriptions 
       SET status = 'past_due', 
           failed_payment_count = failed_payment_count + 1,
           last_payment_failure_at = NOW()
       WHERE stripe_subscription_id = $1`,
      [subscriptionId]
    );

    console.log(
      `[Dunning] Created dunning attempt for customer ${customerId}, next retry: ${nextRetry}`
    );
  }

  /**
   * Process dunning retries (run daily via cron)
   */
  async processDunningRetries(): Promise<void> {
    console.log('[Dunning] Processing dunning retries...');

    // Get all pending retries that are due
    const dueRetries = await db.query(
      `SELECT 
         id, customer_id, subscription_id, invoice_id, attempt_number
       FROM dunning_attempts
       WHERE status IN ('pending', 'retrying')
         AND next_retry_at <= NOW()
       ORDER BY next_retry_at ASC`
    );

    for (const retry of dueRetries.rows) {
      try {
        await this.retryPayment(retry);
      } catch (error) {
        console.error(`[Dunning] Error processing retry ${retry.id}:`, error);
      }
    }

    console.log(`[Dunning] Processed ${dueRetries.rows.length} dunning retries`);
  }

  /**
   * Retry payment for a specific dunning attempt
   */
  private async retryPayment(attempt: any): Promise<void> {
    console.log(
      `[Dunning] Retrying payment for customer ${attempt.customer_id}, attempt ${attempt.attempt_number + 1}`
    );

    // Update status to retrying
    await db.query(
      `UPDATE dunning_attempts SET status = 'retrying' WHERE id = $1`,
      [attempt.id]
    );

    try {
      // Retrieve the invoice from Stripe
      const invoice = await stripe.invoices.retrieve(attempt.invoice_id);

      if (invoice.status === 'paid') {
        // Invoice was paid outside of dunning process
        console.log(`[Dunning] Invoice ${invoice.id} is already paid`);
        await this.markDunningSuccess(attempt.id);
        return;
      }

      // Attempt to pay the invoice
      const paidInvoice = await stripe.invoices.pay(invoice.id, {
        forgive: false, // Don't forgive the invoice
      });

      if (paidInvoice.status === 'paid') {
        console.log(`[Dunning] Payment successful for invoice ${invoice.id}`);
        await this.markDunningSuccess(attempt.id);
        await this.sendPaymentSucceededEmail(attempt.customer_id, paidInvoice);
        
        // Reactivate subscription
        await db.query(
          `UPDATE subscriptions 
           SET status = 'active',
               failed_payment_count = 0
           WHERE stripe_subscription_id = $1`,
          [attempt.subscription_id]
        );
      } else {
        console.log(`[Dunning] Payment retry failed for invoice ${invoice.id}`);
        await this.handleRetryFailed(attempt);
      }
    } catch (error: any) {
      console.error(`[Dunning] Error retrying payment:`, error.message);
      await this.handleRetryFailed(attempt);
    }
  }

  /**
   * Handle failed retry attempt
   */
  private async handleRetryFailed(attempt: any): Promise<void> {
    const nextAttemptNumber = attempt.attempt_number + 1;

    if (nextAttemptNumber >= DEFAULT_DUNNING_CONFIG.max_retries) {
      // Max retries reached, suspend subscription
      console.log(
        `[Dunning] Max retries reached for customer ${attempt.customer_id}, suspending`
      );

      await db.query(
        `UPDATE dunning_attempts SET status = 'failed' WHERE id = $1`,
        [attempt.id]
      );

      if (DEFAULT_DUNNING_CONFIG.suspend_after_failures) {
        await this.suspendSubscription(attempt.customer_id, attempt.subscription_id);
        await this.sendSubscriptionSuspendedEmail(attempt.customer_id);
      }
    } else {
      // Schedule next retry
      const daysUntilNextRetry =
        DEFAULT_DUNNING_CONFIG.retry_schedule_days[nextAttemptNumber];
      const nextRetry = new Date();
      nextRetry.setDate(nextRetry.getDate() + daysUntilNextRetry);

      await db.query(
        `UPDATE dunning_attempts 
         SET attempt_number = $1,
             next_retry_at = $2,
             status = 'pending'
         WHERE id = $3`,
        [nextAttemptNumber, nextRetry, attempt.id]
      );

      // Send retry notification email
      await this.sendPaymentRetryEmail(
        attempt.customer_id,
        attempt.invoice_id,
        nextAttemptNumber,
        daysUntilNextRetry
      );

      console.log(
        `[Dunning] Scheduled retry ${nextAttemptNumber} for customer ${attempt.customer_id} on ${nextRetry}`
      );
    }
  }

  /**
   * Mark dunning process as successful
   */
  private async markDunningSuccess(dunningId: string): Promise<void> {
    await db.query(
      `UPDATE dunning_attempts SET status = 'succeeded' WHERE id = $1`,
      [dunningId]
    );
  }

  /**
   * Suspend subscription after failed dunning
   */
  private async suspendSubscription(
    customerId: string,
    subscriptionId: string
  ): Promise<void> {
    console.log(`[Dunning] Suspending subscription ${subscriptionId}`);

    // Update in Stripe
    try {
      await stripe.subscriptions.update(subscriptionId, {
        pause_collection: {
          behavior: 'void', // Don't charge during suspension
        },
      });
    } catch (error) {
      console.error('[Dunning] Error suspending subscription in Stripe:', error);
    }

    // Update in database
    await db.query(
      `UPDATE subscriptions 
       SET status = 'suspended',
           suspended_at = NOW()
       WHERE stripe_subscription_id = $1`,
      [subscriptionId]
    );

    // Revoke API access
    await db.query(
      `UPDATE api_keys 
       SET status = 'suspended',
           suspended_at = NOW()
       WHERE user_id = $1 AND status = 'active'`,
      [customerId]
    );

    console.log(`[Dunning] Subscription and API access suspended for customer ${customerId}`);
  }

  /**
   * Reactivate suspended subscription after payment
   */
  async reactivateSubscription(customerId: string, subscriptionId: string): Promise<void> {
    console.log(`[Dunning] Reactivating subscription ${subscriptionId}`);

    // Update in Stripe
    try {
      await stripe.subscriptions.update(subscriptionId, {
        pause_collection: undefined as any,
      });
    } catch (error) {
      console.error('[Dunning] Error reactivating subscription in Stripe:', error);
    }

    // Update in database
    await db.query(
      `UPDATE subscriptions 
       SET status = 'active',
           suspended_at = NULL,
           failed_payment_count = 0
       WHERE stripe_subscription_id = $1`,
      [subscriptionId]
    );

    // Reactivate API keys
    await db.query(
      `UPDATE api_keys 
       SET status = 'active',
           suspended_at = NULL
       WHERE user_id = $1 AND status = 'suspended'`,
      [customerId]
    );

    console.log(`[Dunning] Subscription and API access reactivated for customer ${customerId}`);
  }

  /**
   * Email: Payment failed (immediate notification)
   */
  private async sendPaymentFailedEmail(
    customerId: string,
    invoice: Stripe.Invoice,
    attemptNumber: number
  ): Promise<void> {
    const user = await db.query(`SELECT email FROM users WHERE id = $1`, [customerId]);
    if (user.rows.length === 0) return;

    const email = user.rows[0].email;
    const amountDue = (invoice.amount_due / 100).toFixed(2);

    console.log(`[Dunning] Sending payment failed email to ${email}`);

    // Emit event for email service
    await this.emitEvent('email.payment_failed', {
      to: email,
      customer_id: customerId,
      invoice_id: invoice.id,
      amount_due: amountDue,
      currency: invoice.currency,
      attempt_number: attemptNumber,
      payment_url: invoice.hosted_invoice_url,
    });
  }

  /**
   * Email: Payment retry notification
   */
  private async sendPaymentRetryEmail(
    customerId: string,
    invoiceId: string,
    attemptNumber: number,
    daysUntilRetry: number
  ): Promise<void> {
    const user = await db.query(`SELECT email FROM users WHERE id = $1`, [customerId]);
    if (user.rows.length === 0) return;

    const email = user.rows[0].email;

    console.log(
      `[Dunning] Sending payment retry email to ${email} (attempt ${attemptNumber})`
    );

    await this.emitEvent('email.payment_retry', {
      to: email,
      customer_id: customerId,
      invoice_id: invoiceId,
      attempt_number: attemptNumber,
      days_until_retry: daysUntilRetry,
      max_retries: DEFAULT_DUNNING_CONFIG.max_retries,
    });
  }

  /**
   * Email: Payment succeeded after retry
   */
  private async sendPaymentSucceededEmail(
    customerId: string,
    invoice: Stripe.Invoice
  ): Promise<void> {
    const user = await db.query(`SELECT email FROM users WHERE id = $1`, [customerId]);
    if (user.rows.length === 0) return;

    const email = user.rows[0].email;
    const amountPaid = (invoice.amount_paid / 100).toFixed(2);

    console.log(`[Dunning] Sending payment succeeded email to ${email}`);

    await this.emitEvent('email.payment_succeeded_after_retry', {
      to: email,
      customer_id: customerId,
      invoice_id: invoice.id,
      amount_paid: amountPaid,
      currency: invoice.currency,
    });
  }

  /**
   * Email: Subscription suspended
   */
  private async sendSubscriptionSuspendedEmail(customerId: string): Promise<void> {
    const user = await db.query(`SELECT email FROM users WHERE id = $1`, [customerId]);
    if (user.rows.length === 0) return;

    const email = user.rows[0].email;

    console.log(`[Dunning] Sending subscription suspended email to ${email}`);

    await this.emitEvent('email.subscription_suspended', {
      to: email,
      customer_id: customerId,
      reactivation_url: `https://console.apexmediation.com/billing/reactivate`,
    });
  }

  /**
   * Get dunning status for a customer
   */
  async getDunningStatus(customerId: string): Promise<{
    has_active_dunning: boolean;
    failed_payments: number;
    next_retry_date: Date | null;
    days_until_suspension: number | null;
  }> {
    const subscription = await db.query(
      `SELECT failed_payment_count FROM subscriptions WHERE customer_id = $1`,
      [customerId]
    );

    if (subscription.rows.length === 0) {
      return {
        has_active_dunning: false,
        failed_payments: 0,
        next_retry_date: null,
        days_until_suspension: null,
      };
    }

    const failedPayments = subscription.rows[0].failed_payment_count;

    const activeDunning = await db.query(
      `SELECT next_retry_at, attempt_number 
       FROM dunning_attempts 
       WHERE customer_id = $1 
         AND status IN ('pending', 'retrying')
       ORDER BY created_at DESC
       LIMIT 1`,
      [customerId]
    );

    if (activeDunning.rows.length === 0) {
      return {
        has_active_dunning: false,
        failed_payments: failedPayments,
        next_retry_date: null,
        days_until_suspension: null,
      };
    }

    const dunning = activeDunning.rows[0];
    const nextRetryDate = new Date(dunning.next_retry_at);
    const attemptsRemaining =
      DEFAULT_DUNNING_CONFIG.max_retries - dunning.attempt_number;
    const daysUntilSuspension =
      attemptsRemaining > 0
        ? DEFAULT_DUNNING_CONFIG.retry_schedule_days
            .slice(dunning.attempt_number)
            .reduce((a, b) => a + b, 0)
        : 0;

    return {
      has_active_dunning: true,
      failed_payments: failedPayments,
      next_retry_date: nextRetryDate,
      days_until_suspension: daysUntilSuspension,
    };
  }

  /**
   * Emit event to event bus
   */
  private async emitEvent(eventType: string, data: any): Promise<void> {
    await db.query(
      `INSERT INTO events (event_type, data, created_at)
       VALUES ($1, $2, NOW())`,
      [eventType, JSON.stringify(data)]
    );
  }
}

export const dunningManagementService = new DunningManagementService();
