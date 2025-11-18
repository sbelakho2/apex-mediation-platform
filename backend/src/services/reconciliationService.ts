/**
 * Reconciliation Service
 * Compares internal usage records against Stripe billing records
 */

import { Pool } from 'pg';
import Stripe from 'stripe';
import logger from '../utils/logger';

let stripeClient: Stripe | null = null;

const getStripeClient = (): Stripe => {
  if (stripeClient) {
    return stripeClient;
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error('Stripe secret key not configured');
  }

  stripeClient = new Stripe(secretKey, {
    apiVersion: '2025-10-29.clover',
  });

  return stripeClient;
};

const db = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export interface ReconciliationResult {
  reconciliation_id: string;
  timestamp: string;
  total_subscriptions_checked: number;
  discrepancies: Array<{
    customer_id: string;
    stripe_customer_id: string;
    internal_usage: number;
    stripe_usage: number;
    difference: number;
    difference_percentage: number;
  }>;
  total_discrepancy_cents: number;
  max_tolerated_discrepancy_percentage: number;
  within_tolerance: boolean;
}

export class ReconciliationService {
  private readonly MAX_DISCREPANCY_PERCENTAGE = 0.5; // 0.5% tolerance

  /**
   * Check if idempotency key has been used
   */
  async checkIdempotencyKey(key: string): Promise<ReconciliationResult | null> {
    const result = await db.query(
      `SELECT result_data FROM billing_idempotency 
       WHERE idempotency_key = $1 AND created_at > NOW() - INTERVAL '24 hours'`,
      [key]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0].result_data;
  }

  /**
   * Store idempotency key with result
   */
  async storeIdempotencyKey(key: string, result: ReconciliationResult): Promise<void> {
    await db.query(
      `INSERT INTO billing_idempotency (idempotency_key, result_data, created_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (idempotency_key) DO NOTHING`,
      [key, JSON.stringify(result)]
    );
  }

  /**
   * Perform reconciliation between internal records and Stripe
   */
  async reconcile(): Promise<ReconciliationResult> {
    const reconciliationId = `recon_${Date.now()}`;
    const timestamp = new Date().toISOString();

    logger.info('Starting billing reconciliation', { reconciliationId });

  const stripe = getStripeClient();

    // Get all active subscriptions with Stripe IDs
    const subscriptions = await db.query(
      `SELECT 
         s.id as subscription_id,
         s.customer_id,
         s.stripe_subscription_id,
         s.stripe_customer_id,
         s.current_period_start,
         s.current_period_end
       FROM subscriptions s
       WHERE s.status = 'active'
         AND s.stripe_subscription_id IS NOT NULL`
    );

    const discrepancies: ReconciliationResult['discrepancies'] = [];
    let totalDiscrepancyCents = 0;

    for (const sub of subscriptions.rows) {
      try {
        // Get internal usage for current period
        const internalUsage = await db.query(
          `SELECT 
             COALESCE(SUM(quantity), 0) as total_usage
           FROM usage_records
           WHERE customer_id = $1
             AND recorded_at >= $2
             AND recorded_at <= $3
             AND metric_type = 'impressions'`,
          [sub.customer_id, sub.current_period_start, sub.current_period_end]
        );

        const internalTotal = parseInt(internalUsage.rows[0].total_usage, 10);

        // Get Stripe usage (via subscription usage records)
        const stripeSubscription = await stripe.subscriptions.retrieve(
          sub.stripe_subscription_id,
          { expand: ['items'] }
        );

        // Find metered usage item
        let stripeTotal = 0;
        for (const item of stripeSubscription.items.data) {
          if (item.price.recurring?.usage_type === 'metered') {
            try {
              // Guard: older/newer Stripe SDKs may expose different shapes; prefer typed method if available (FIX-11: 700)
              const anyStripe = stripe as any;
              if (anyStripe.subscriptionItems?.listUsageRecordSummaries) {
                const usageRecords = await anyStripe.subscriptionItems.listUsageRecordSummaries(item.id, { limit: 100 });
                stripeTotal += usageRecords.data.reduce((sum: number, record: any) => sum + (record.total_usage ?? 0), 0);
              } else if (anyStripe.subscriptionItems?.listUsageRecordSummariesAsync) {
                const usageRecords = await anyStripe.subscriptionItems.listUsageRecordSummariesAsync(item.id, { limit: 100 });
                stripeTotal += usageRecords.data.reduce((sum: number, record: any) => sum + (record.total_usage ?? 0), 0);
              } else {
                logger.warn('Stripe SDK does not support usage summaries; skipping item', { subscriptionItemId: item.id });
              }
            } catch (error) {
              logger.warn('Could not fetch Stripe usage records', {
                subscriptionItemId: item.id,
                error,
              });
            }
          }
        }

        // Compare and record discrepancies
        const difference = Math.abs(internalTotal - stripeTotal);
        const avgUsage = (internalTotal + stripeTotal) / 2;
        const differencePercentage = avgUsage > 0 ? (difference / avgUsage) * 100 : 0;

        if (differencePercentage > this.MAX_DISCREPANCY_PERCENTAGE) {
          discrepancies.push({
            customer_id: sub.customer_id,
            stripe_customer_id: sub.stripe_customer_id,
            internal_usage: internalTotal,
            stripe_usage: stripeTotal,
            difference,
            difference_percentage: differencePercentage,
          });

          // Calculate cents difference (simplified - assumes $0.10 per 1000 impressions)
          totalDiscrepancyCents += Math.ceil(difference / 1000) * 10;

          logger.warn('Usage discrepancy detected', {
            customer_id: sub.customer_id,
            internal_usage: internalTotal,
            stripe_usage: stripeTotal,
            difference_percentage: differencePercentage,
          });
        }
      } catch (error) {
        logger.error('Error reconciling subscription', {
          subscription_id: sub.subscription_id,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    const result: ReconciliationResult = {
      reconciliation_id: reconciliationId,
      timestamp,
      total_subscriptions_checked: subscriptions.rows.length,
      discrepancies,
      total_discrepancy_cents: totalDiscrepancyCents,
      max_tolerated_discrepancy_percentage: this.MAX_DISCREPANCY_PERCENTAGE,
      within_tolerance: discrepancies.length === 0,
    };

    // Log to audit trail
    await db.query(
      `INSERT INTO billing_audit (
        event_type,
        actor,
        data,
        created_at
      ) VALUES ($1, $2, $3, NOW())`,
      ['reconciliation', 'system', JSON.stringify(result)]
    );

    // If discrepancies exceed threshold, emit alert
    if (!result.within_tolerance && totalDiscrepancyCents > 100000) {
      // > $1000
      logger.error('Critical billing discrepancy detected', {
        total_discrepancy_cents: totalDiscrepancyCents,
        discrepancy_count: discrepancies.length,
      });

      // Emit alert event
      await db.query(
        `INSERT INTO events (event_type, data, created_at)
         VALUES ($1, $2, NOW())`,
        [
          'billing.critical_discrepancy',
          JSON.stringify({
            reconciliation_id: reconciliationId,
            total_discrepancy_cents: totalDiscrepancyCents,
            discrepancies: discrepancies.slice(0, 10), // First 10 for email
          }),
        ]
      );
    }

    logger.info('Billing reconciliation complete', {
      reconciliationId,
      subscriptions_checked: subscriptions.rows.length,
      discrepancies_found: discrepancies.length,
      within_tolerance: result.within_tolerance,
    });

    return result;
  }

  /**
   * Get reconciliation history
   */
  async getReconciliationHistory(limit: number = 20): Promise<ReconciliationResult[]> {
    const result = await db.query(
      `SELECT data
       FROM billing_audit
       WHERE event_type = 'reconciliation'
       ORDER BY created_at DESC
       LIMIT $1`,
      [limit]
    );

    return result.rows.map((row) => row.data);
  }
}

export const reconciliationService = new ReconciliationService();
