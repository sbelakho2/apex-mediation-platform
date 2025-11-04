// services/billing/UsageMeteringService.ts
// Tracks SDK usage (impressions, API calls, data transfer) and syncs to Stripe for billing

import { Pool } from 'pg';
import Stripe from 'stripe';
import { createClient } from '@clickhouse/client';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-10-29.clover',
});

const db = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const clickhouse = createClient({
  host: process.env.CLICKHOUSE_HOST || 'http://localhost:8123',
  username: process.env.CLICKHOUSE_USER || 'default',
  password: process.env.CLICKHOUSE_PASSWORD || '',
  database: process.env.CLICKHOUSE_DATABASE || 'apexmediation',
});

interface UsageMetrics {
  customer_id: string;
  impressions: number;
  api_calls: number;
  data_transfer_gb: number;
  period_start: Date;
  period_end: Date;
}

interface PlanLimits {
  plan_type: string;
  included_impressions: number;
  included_api_calls: number;
  included_data_transfer_gb: number;
  overage_price_impressions_cents: number; // per 1000
  overage_price_api_calls_cents: number; // per 1000
  overage_price_data_transfer_cents: number; // per GB
}

const PLAN_LIMITS: Record<string, PlanLimits> = {
  indie: {
    plan_type: 'indie',
    included_impressions: 1_000_000,
    included_api_calls: 100_000,
    included_data_transfer_gb: 50,
    overage_price_impressions_cents: 10, // $0.10 per 1K
    overage_price_api_calls_cents: 5, // $0.05 per 1K
    overage_price_data_transfer_cents: 10, // $0.10 per GB
  },
  studio: {
    plan_type: 'studio',
    included_impressions: 10_000_000,
    included_api_calls: 1_000_000,
    included_data_transfer_gb: 500,
    overage_price_impressions_cents: 8, // $0.08 per 1K
    overage_price_api_calls_cents: 4, // $0.04 per 1K
    overage_price_data_transfer_cents: 8, // $0.08 per GB
  },
  enterprise: {
    plan_type: 'enterprise',
    included_impressions: 100_000_000,
    included_api_calls: 10_000_000,
    included_data_transfer_gb: 5000,
    overage_price_impressions_cents: 5, // $0.05 per 1K
    overage_price_api_calls_cents: 2, // $0.02 per 1K
    overage_price_data_transfer_cents: 5, // $0.05 per GB
  },
};

export class UsageMeteringService {
  /**
   * Record usage event (called by SDK telemetry endpoint)
   */
  async recordUsage(
    customerId: string,
    metricType: 'impressions' | 'api_calls' | 'data_transfer',
    quantity: number,
    metadata?: Record<string, any>
  ): Promise<void> {
    // Insert into PostgreSQL for durability
    await db.query(
      `INSERT INTO usage_records (customer_id, metric_type, quantity, metadata, recorded_at)
       VALUES ($1, $2, $3, $4, NOW())`,
      [customerId, metricType, quantity, JSON.stringify(metadata || {})]
    );

    // Also insert into ClickHouse for fast analytics
    await clickhouse.insert({
      table: 'usage_events',
      values: [
        {
          customer_id: customerId,
          metric_type: metricType,
          quantity: quantity,
          metadata: JSON.stringify(metadata || {}),
          timestamp: Math.floor(Date.now() / 1000),
        },
      ],
      format: 'JSONEachRow',
    });
  }

  /**
   * Get current billing period usage for a customer
   */
  async getCurrentPeriodUsage(customerId: string): Promise<UsageMetrics> {
    const subscription = await db.query(
      `SELECT current_period_start, current_period_end, plan_type
       FROM subscriptions
       WHERE customer_id = $1 AND status = 'active'`,
      [customerId]
    );

    if (subscription.rows.length === 0) {
      throw new Error(`No active subscription found for customer ${customerId}`);
    }

    const { current_period_start, current_period_end } = subscription.rows[0];

    // Aggregate usage from PostgreSQL
    const usage = await db.query(
      `SELECT 
         metric_type,
         SUM(quantity) as total
       FROM usage_records
       WHERE customer_id = $1
         AND recorded_at >= $2
         AND recorded_at <= $3
       GROUP BY metric_type`,
      [customerId, current_period_start, current_period_end]
    );

    const metrics: UsageMetrics = {
      customer_id: customerId,
      impressions: 0,
      api_calls: 0,
      data_transfer_gb: 0,
      period_start: current_period_start,
      period_end: current_period_end,
    };

    for (const row of usage.rows) {
      if (row.metric_type === 'impressions') {
        metrics.impressions = parseInt(row.total);
      } else if (row.metric_type === 'api_calls') {
        metrics.api_calls = parseInt(row.total);
      } else if (row.metric_type === 'data_transfer') {
        metrics.data_transfer_gb = parseFloat(row.total);
      }
    }

    return metrics;
  }

  /**
   * Calculate overage charges for current period
   */
  async calculateOverages(customerId: string): Promise<{
    impressions_overage: number;
    impressions_overage_cost_cents: number;
    api_calls_overage: number;
    api_calls_overage_cost_cents: number;
    data_transfer_overage_gb: number;
    data_transfer_overage_cost_cents: number;
    total_overage_cost_cents: number;
  }> {
    const subscription = await db.query(
      `SELECT plan_type FROM subscriptions WHERE customer_id = $1 AND status = 'active'`,
      [customerId]
    );

    if (subscription.rows.length === 0) {
      throw new Error(`No active subscription for customer ${customerId}`);
    }

    const planType = subscription.rows[0].plan_type;
    const limits = PLAN_LIMITS[planType];

    if (!limits) {
      throw new Error(`Unknown plan type: ${planType}`);
    }

    const usage = await this.getCurrentPeriodUsage(customerId);

    // Calculate overages
    const impressions_overage = Math.max(0, usage.impressions - limits.included_impressions);
    const api_calls_overage = Math.max(0, usage.api_calls - limits.included_api_calls);
    const data_transfer_overage_gb = Math.max(
      0,
      usage.data_transfer_gb - limits.included_data_transfer_gb
    );

    // Calculate costs (impressions and API calls are priced per 1000)
    const impressions_overage_cost_cents =
      Math.ceil(impressions_overage / 1000) * limits.overage_price_impressions_cents;
    const api_calls_overage_cost_cents =
      Math.ceil(api_calls_overage / 1000) * limits.overage_price_api_calls_cents;
    const data_transfer_overage_cost_cents =
      Math.ceil(data_transfer_overage_gb) * limits.overage_price_data_transfer_cents;

    const total_overage_cost_cents =
      impressions_overage_cost_cents +
      api_calls_overage_cost_cents +
      data_transfer_overage_cost_cents;

    return {
      impressions_overage,
      impressions_overage_cost_cents,
      api_calls_overage,
      api_calls_overage_cost_cents,
      data_transfer_overage_gb,
      data_transfer_overage_cost_cents,
      total_overage_cost_cents,
    };
  }

  /**
   * Sync usage to Stripe for metered billing
   * Run this daily via cron
   */
  async syncUsageToStripe(): Promise<void> {
    console.log('[UsageMetering] Starting daily Stripe usage sync...');

    // Get all active subscriptions
    const subscriptions = await db.query(
      `SELECT 
         s.id,
         s.customer_id,
         s.stripe_subscription_id,
         s.current_period_start,
         s.current_period_end,
         s.plan_type
       FROM subscriptions s
       WHERE s.status = 'active'
         AND s.stripe_subscription_id IS NOT NULL`
    );

    for (const sub of subscriptions.rows) {
      try {
        // Get yesterday's usage (idempotent - Stripe handles duplicates)
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        yesterday.setHours(0, 0, 0, 0);

        const yesterdayEnd = new Date(yesterday);
        yesterdayEnd.setHours(23, 59, 59, 999);

        const usage = await db.query(
          `SELECT 
             metric_type,
             SUM(quantity) as total
           FROM usage_records
           WHERE customer_id = $1
             AND recorded_at >= $2
             AND recorded_at <= $3
           GROUP BY metric_type`,
          [sub.customer_id, yesterday, yesterdayEnd]
        );

        // Get Stripe subscription items
        const stripeSubscription = await stripe.subscriptions.retrieve(
          sub.stripe_subscription_id,
          { expand: ['items'] }
        );

        // Find metered items (these have usage_type: 'metered' in Stripe)
        for (const item of stripeSubscription.items.data) {
          const price = item.price;
          if (!price.recurring?.usage_type || price.recurring.usage_type !== 'metered') {
            continue;
          }

          // Match metric type from price metadata
          const metricType = price.metadata?.metric_type;
          if (!metricType) continue;

          const metricUsage = usage.rows.find((r) => r.metric_type === metricType);
          if (!metricUsage) continue;

          const quantity = parseInt(metricUsage.total);

          // Report usage to Stripe (usage records API)
          await (stripe.billing.meterEvents as any).create({
            event_name: metricType,
            payload: {
              value: quantity.toString(),
              stripe_customer_id: sub.customer_id,
            },
            timestamp: Math.floor(yesterday.getTime() / 1000),
          });

          console.log(
            `[UsageMetering] Synced ${quantity} ${metricType} for customer ${sub.customer_id}`
          );
        }
      } catch (error) {
        console.error(
          `[UsageMetering] Error syncing usage for customer ${sub.customer_id}:`,
          error
        );
        // Continue with other customers
      }
    }

    console.log('[UsageMetering] Stripe usage sync complete');
  }

  /**
   * Check for customers approaching limits and send alerts
   * Run this daily via cron
   */
  async checkUsageLimits(): Promise<void> {
    console.log('[UsageMetering] Checking usage limits...');

    const subscriptions = await db.query(
      `SELECT customer_id, plan_type, included_impressions
       FROM subscriptions
       WHERE status = 'active'`
    );

    for (const sub of subscriptions.rows) {
      try {
        const usage = await this.getCurrentPeriodUsage(sub.customer_id);
        const limits = PLAN_LIMITS[sub.plan_type];

        if (!limits) continue;

        const impressionsPct = (usage.impressions / limits.included_impressions) * 100;

        // Send alerts at 80%, 90%, 100%, 110%
        if (impressionsPct >= 80 && impressionsPct < 90) {
          await this.sendUsageAlert(sub.customer_id, 80, usage.impressions, limits);
        } else if (impressionsPct >= 90 && impressionsPct < 100) {
          await this.sendUsageAlert(sub.customer_id, 90, usage.impressions, limits);
        } else if (impressionsPct >= 100 && impressionsPct < 110) {
          await this.sendUsageAlert(sub.customer_id, 100, usage.impressions, limits);
        } else if (impressionsPct >= 110) {
          await this.sendUsageAlert(sub.customer_id, 110, usage.impressions, limits);
        }
      } catch (error) {
        console.error(
          `[UsageMetering] Error checking limits for customer ${sub.customer_id}:`,
          error
        );
      }
    }

    console.log('[UsageMetering] Usage limit checks complete');
  }

  /**
   * Send usage alert email
   */
  private async sendUsageAlert(
    customerId: string,
    percentUsed: number,
    currentUsage: number,
    limits: PlanLimits
  ): Promise<void> {
    // Check if we've already sent this alert
    const existingAlert = await db.query(
      `SELECT id FROM usage_alerts
       WHERE customer_id = $1
         AND alert_type = $2
         AND created_at >= NOW() - INTERVAL '24 hours'`,
      [customerId, `usage_${percentUsed}`]
    );

    if (existingAlert.rows.length > 0) {
      return; // Already sent this alert today
    }

    // Record alert
    await db.query(
      `INSERT INTO usage_alerts (customer_id, alert_type, usage_amount, limit_amount, created_at)
       VALUES ($1, $2, $3, $4, NOW())`,
      [customerId, `usage_${percentUsed}`, currentUsage, limits.included_impressions]
    );

    // Get user email
    const user = await db.query(`SELECT email FROM users WHERE id = $1`, [customerId]);

    if (user.rows.length === 0) return;

    const email = user.rows[0].email;

    // TODO: Send email via Resend/SES
    // For now, emit event for email service
    console.log(`[UsageMetering] Alert: ${email} at ${percentUsed}% usage`);

    // Emit event (to be handled by EmailService)
    await this.emitEvent('usage.alert', {
      customer_id: customerId,
      email: email,
      percent_used: percentUsed,
      current_usage: currentUsage,
      limit: limits.included_impressions,
      plan_type: limits.plan_type,
    });
  }

  /**
   * Get usage analytics for customer dashboard
   */
  async getUsageAnalytics(
    customerId: string,
    days: number = 30
  ): Promise<{
    daily_usage: Array<{ date: string; impressions: number; api_calls: number }>;
    total_impressions: number;
    total_api_calls: number;
    avg_daily_impressions: number;
  }> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Query ClickHouse for fast analytics
    const query = `
      SELECT 
        toDate(toDateTime(timestamp)) as date,
        metric_type,
        sum(quantity) as total
      FROM usage_events
      WHERE customer_id = {customer_id:String}
        AND timestamp >= toUnixTimestamp({start_date:DateTime})
      GROUP BY date, metric_type
      ORDER BY date ASC
    `;

    const result = await clickhouse.query({
      query,
      query_params: {
        customer_id: customerId,
        start_date: startDate.toISOString(),
      },
      format: 'JSONEachRow',
    });

    const rows = await result.json();

    // Aggregate by date
    const dailyUsageMap = new Map<
      string,
      { date: string; impressions: number; api_calls: number }
    >();

    for (const row of rows as any[]) {
      const dateStr = row.date;
      if (!dailyUsageMap.has(dateStr)) {
        dailyUsageMap.set(dateStr, { date: dateStr, impressions: 0, api_calls: 0 });
      }

      const dayData = dailyUsageMap.get(dateStr)!;
      if (row.metric_type === 'impressions') {
        dayData.impressions = row.total;
      } else if (row.metric_type === 'api_calls') {
        dayData.api_calls = row.total;
      }
    }

    const daily_usage = Array.from(dailyUsageMap.values());

    const total_impressions = daily_usage.reduce((sum, day) => sum + day.impressions, 0);
    const total_api_calls = daily_usage.reduce((sum, day) => sum + day.api_calls, 0);
    const avg_daily_impressions = total_impressions / days;

    return {
      daily_usage,
      total_impressions,
      total_api_calls,
      avg_daily_impressions,
    };
  }

  /**
   * Emit event to event bus (for email service, webhooks, etc.)
   */
  private async emitEvent(eventType: string, data: any): Promise<void> {
    // Simple implementation: insert into events table
    // In production, use Redis Pub/Sub, Kafka, or RabbitMQ
    await db.query(
      `INSERT INTO events (event_type, data, created_at)
       VALUES ($1, $2, NOW())`,
      [eventType, JSON.stringify(data)]
    );
  }
}

export const usageMeteringService = new UsageMeteringService();
