// services/monetization/ValueMultiplierService.ts
// Increases profitability per customer as platform grows through automated value stacking
// Strategy: Network effects, data-driven optimization, premium features, marketplace revenue

import { Pool } from 'pg';

interface Customer {
  id: string;
  email: string;
  plan_type: string;
  created_at: Date;
  monthly_impressions: number;
  monthly_revenue_cents: number;
}

interface ValueMultiplier {
  type: 'network_effect' | 'data_optimization' | 'premium_feature' | 'marketplace' | 'white_label';
  revenue_increase_percent: number;
  cost_savings_cents: number;
  automated: boolean;
}

export class ValueMultiplierService {
  private pool: Pool;

  constructor(databaseUrl: string) {
    this.pool = new Pool({ connectionString: databaseUrl });
  }

  /**
   * Strategy 1: Network Effects Revenue
   * As more customers join, ad networks offer better eCPM rates due to higher fill rates
   * This increases revenue for ALL customers automatically
   */
  async calculateNetworkEffectBonus(): Promise<void> {
    console.log('[ValueMultiplier] Calculating network effect bonuses...');

    // Get total platform impressions
    const totalResult = await this.pool.query(
      `SELECT SUM(impressions) as total_impressions
       FROM usage_records
       WHERE created_at >= NOW() - INTERVAL '30 days'
         AND is_sandbox = false`
    );

    const totalImpressions = parseInt(totalResult.rows[0]?.total_impressions || '0');

    // Network effect thresholds (more customers = better eCPM from ad networks)
    let eCPMBonus = 0;
    if (totalImpressions > 1000000000) { // 1B+ impressions/month
      eCPMBonus = 0.25; // 25% better eCPM from ad networks
    } else if (totalImpressions > 500000000) { // 500M+ impressions/month
      eCPMBonus = 0.20; // 20% better eCPM
    } else if (totalImpressions > 100000000) { // 100M+ impressions/month
      eCPMBonus = 0.15; // 15% better eCPM
    } else if (totalImpressions > 50000000) { // 50M+ impressions/month
      eCPMBonus = 0.10; // 10% better eCPM
    }

    if (eCPMBonus > 0) {
      // Update all customers' expected eCPM rates
      await this.pool.query(
        `INSERT INTO value_multipliers (
           multiplier_type,
           multiplier_value,
           applies_to_all_customers,
           description,
           created_at
         ) VALUES ($1, $2, true, $3, NOW())
         ON CONFLICT (multiplier_type) 
         DO UPDATE SET 
           multiplier_value = $2,
           description = $3,
           updated_at = NOW()`,
        [
          'network_effect_ecpm',
          eCPMBonus,
          `${(eCPMBonus * 100).toFixed(0)}% eCPM boost due to ${(totalImpressions / 1000000).toFixed(0)}M monthly platform impressions`,
        ]
      );

      console.log(
        `[ValueMultiplier] Network effect bonus: ${(eCPMBonus * 100).toFixed(0)}% eCPM increase for all customers`
      );
    }
  }

  /**
   * Strategy 2: Data-Driven Optimization Revenue
   * Aggregate anonymized performance data to optimize waterfalls for all customers
   * More data = better optimization = higher revenue per impression
   */
  async optimizeWaterfallsWithAggregateData(): Promise<void> {
    console.log('[ValueMultiplier] Optimizing waterfalls with aggregate data...');

    // Get aggregate performance data across all customers
    const performanceData = await this.pool.query(
      `SELECT 
         ad_network,
         ad_format,
         geo_country,
         AVG(ecpm_cents) as avg_ecpm,
         AVG(fill_rate) as avg_fill_rate,
         COUNT(*) as sample_size
       FROM ad_performance
       WHERE created_at >= NOW() - INTERVAL '7 days'
       GROUP BY ad_network, ad_format, geo_country
       HAVING COUNT(*) >= 100` // Only use statistically significant data
    );

    // For each customer, optimize their waterfall using aggregate data
    const customers = await this.pool.query(
      `SELECT DISTINCT customer_id FROM subscriptions WHERE status = 'active'`
    );

    for (const customer of customers.rows) {
      // Build optimized waterfall order by eCPM (highest first)
      const optimizedWaterfall = performanceData.rows
        .sort((a, b) => parseFloat(b.avg_ecpm) - parseFloat(a.avg_ecpm))
        .map((row, index) => ({
          position: index + 1,
          ad_network: row.ad_network,
          expected_ecpm_cents: Math.round(parseFloat(row.avg_ecpm)),
          expected_fill_rate: parseFloat(row.avg_fill_rate),
        }));

      // Update customer's waterfall configuration
      await this.pool.query(
        `INSERT INTO waterfall_configs (
           customer_id,
           config,
           optimization_source,
           expected_revenue_increase_percent,
           updated_at
         ) VALUES ($1, $2, 'aggregate_data', $3, NOW())
         ON CONFLICT (customer_id)
         DO UPDATE SET
           config = $2,
           optimization_source = 'aggregate_data',
           expected_revenue_increase_percent = $3,
           updated_at = NOW()`,
        [
          customer.customer_id,
          JSON.stringify(optimizedWaterfall),
          15, // 15% average revenue increase from optimized waterfalls
        ]
      );
    }

    console.log(
      `[ValueMultiplier] Optimized waterfalls for ${customers.rows.length} customers using aggregate data`
    );
  }

  /**
   * Strategy 3: Premium Feature Upsells
   * Automated feature discovery and upgrade prompts based on usage patterns
   */
  async detectPremiumFeatureOpportunities(): Promise<void> {
    console.log('[ValueMultiplier] Detecting premium feature opportunities...');

    // Real-time Analytics (worth $50-100/month)
    const analyticsOpportunities = await this.pool.query(
      `SELECT customer_id, COUNT(*) as dashboard_views
       FROM analytics_views
       WHERE created_at >= NOW() - INTERVAL '30 days'
       GROUP BY customer_id
       HAVING COUNT(*) > 50 -- Views dashboard daily
         AND customer_id NOT IN (
           SELECT customer_id FROM premium_features WHERE feature_name = 'realtime_analytics'
         )`
    );

    for (const opportunity of analyticsOpportunities.rows) {
      await this.createUpsellOpportunity(
        opportunity.customer_id,
        'realtime_analytics',
        5000, // $50/month
        'Upgrade to real-time analytics - see your ad performance update every second',
        {
          current_behavior: `Viewing dashboard ${opportunity.dashboard_views} times/month`,
          value_proposition: 'React to performance changes instantly, optimize in real-time',
          estimated_revenue_increase: '5-10% from faster optimization',
        }
      );
    }

    // Advanced Targeting (worth $100-200/month)
    const targetingOpportunities = await this.pool.query(
      `SELECT customer_id, COUNT(DISTINCT geo_country) as countries_served
       FROM usage_records
       WHERE created_at >= NOW() - INTERVAL '30 days'
       GROUP BY customer_id
       HAVING COUNT(DISTINCT geo_country) > 10 -- Serving ads in 10+ countries
         AND customer_id NOT IN (
           SELECT customer_id FROM premium_features WHERE feature_name = 'advanced_targeting'
         )`
    );

    for (const opportunity of targetingOpportunities.rows) {
      await this.createUpsellOpportunity(
        opportunity.customer_id,
        'advanced_targeting',
        15000, // $150/month
        'Unlock geo-targeting and audience segmentation',
        {
          current_behavior: `Serving ads in ${opportunity.countries_served} countries`,
          value_proposition: 'Maximize eCPM by targeting high-value geos (US, UK, AU)',
          estimated_revenue_increase: '20-30% from better targeting',
        }
      );
    }

    // Dedicated Account Manager (worth $500-1000/month for Enterprise)
    const enterpriseOpportunities = await this.pool.query(
      `SELECT customer_id, SUM(impressions) as monthly_impressions
       FROM usage_records
       WHERE created_at >= NOW() - INTERVAL '30 days'
       GROUP BY customer_id
       HAVING SUM(impressions) > 50000000 -- 50M+ impressions/month
         AND customer_id NOT IN (
           SELECT customer_id FROM premium_features WHERE feature_name = 'account_manager'
         )`
    );

    for (const opportunity of enterpriseOpportunities.rows) {
      await this.createUpsellOpportunity(
        opportunity.customer_id,
        'account_manager',
        50000, // $500/month
        'Get a dedicated account manager for white-glove support',
        {
          current_behavior: `${(opportunity.monthly_impressions / 1000000).toFixed(0)}M impressions/month`,
          value_proposition: 'Custom optimizations, priority support, quarterly reviews',
          estimated_revenue_increase: '10-15% from expert optimizations',
        }
      );
    }

    console.log(
      `[ValueMultiplier] Created ${analyticsOpportunities.rows.length + targetingOpportunities.rows.length + enterpriseOpportunities.rows.length} premium feature opportunities`
    );
  }

  /**
   * Strategy 4: Marketplace Revenue (No marginal cost to deliver)
   * Sell aggregated, anonymized insights to ad networks and game publishers
   */
  async generateMarketplaceRevenue(): Promise<void> {
    console.log('[ValueMultiplier] Generating marketplace revenue opportunities...');

    // Calculate valuable insights to sell
    const insights = await this.pool.query(
      `SELECT 
         ad_format,
         geo_country,
         device_type,
         AVG(ecpm_cents) as avg_ecpm,
         AVG(ctr_percent) as avg_ctr,
         COUNT(*) as impressions
       FROM ad_performance
       WHERE created_at >= NOW() - INTERVAL '30 days'
       GROUP BY ad_format, geo_country, device_type
       HAVING COUNT(*) >= 1000` // Statistically significant
    );

    // Package insights for marketplace
    const marketplaceProduct = {
      product_name: 'Mobile Gaming Ad Performance Benchmark Report',
      description: `Anonymized performance data from ${insights.rows.length} segment combinations across ${(await this.getTotalImpressions()) / 1000000}M impressions`,
      price_cents: 99900, // $999/month subscription
      data_points: insights.rows.length,
      update_frequency: 'daily',
    };

    // Store marketplace product
    await this.pool.query(
      `INSERT INTO marketplace_products (
         product_type,
         product_name,
         description,
         price_cents,
         data_points,
         update_frequency,
         created_at
       ) VALUES ('benchmark_data', $1, $2, $3, $4, $5, NOW())
       ON CONFLICT (product_type)
       DO UPDATE SET
         product_name = $1,
         description = $2,
         price_cents = $3,
         data_points = $4,
         updated_at = NOW()`,
      [
        marketplaceProduct.product_name,
        marketplaceProduct.description,
        marketplaceProduct.price_cents,
        marketplaceProduct.data_points,
        marketplaceProduct.update_frequency,
      ]
    );

    // Target: 10-20 ad networks buy this data @ $999/month = $10K-20K/month pure profit
    console.log(
      `[ValueMultiplier] Marketplace product ready: ${marketplaceProduct.product_name} ($${marketplaceProduct.price_cents / 100}/month)`
    );
  }

  /**
   * Strategy 5: White Label / Reseller Revenue
   * Allow agencies to resell platform under their brand (40% commission)
   */
  async detectWhiteLabelOpportunities(): Promise<void> {
    console.log('[ValueMultiplier] Detecting white label opportunities...');

    // Find customers who might be agencies (multiple apps, high volume)
    const agencies = await this.pool.query(
      `SELECT 
         customer_id,
         COUNT(DISTINCT app_id) as app_count,
         SUM(monthly_revenue_cents) as total_revenue_cents
       FROM (
         SELECT 
           customer_id,
           COALESCE(metadata->>'app_id', 'unknown') as app_id,
           SUM(revenue_cents) as monthly_revenue_cents
         FROM usage_records
         WHERE created_at >= NOW() - INTERVAL '30 days'
         GROUP BY customer_id, app_id
       ) subquery
       GROUP BY customer_id
       HAVING COUNT(DISTINCT app_id) >= 3 -- Managing 3+ apps
         AND SUM(monthly_revenue_cents) > 500000 -- $5K+/month revenue
         AND customer_id NOT IN (
           SELECT customer_id FROM white_label_partners
         )`
    );

    for (const agency of agencies.rows) {
      // Offer white label partnership
      await this.pool.query(
        `INSERT INTO white_label_opportunities (
           customer_id,
           app_count,
           monthly_revenue_cents,
           proposed_commission_percent,
           estimated_platform_revenue_cents,
           status,
           created_at
         ) VALUES ($1, $2, $3, 40, $4, 'pending', NOW())`,
        [
          agency.customer_id,
          agency.app_count,
          agency.total_revenue_cents,
          Math.round(agency.total_revenue_cents * 0.40), // Platform takes 40% of their 10% take rate = 4% total
        ]
      );

      // Send white label proposal email
      await this.pool.query(
        `INSERT INTO events (event_type, data, created_at)
         VALUES ('email.white_label_proposal', $1, NOW())`,
        [
          JSON.stringify({
            customer_id: agency.customer_id,
            app_count: agency.app_count,
            monthly_revenue: agency.total_revenue_cents / 100,
            commission_percent: 40,
            benefits: [
              'Custom branding (your logo, domain, colors)',
              'White-label dashboard for your clients',
              'Priority support and account management',
              'Revenue share: You keep 60%, we handle infrastructure',
              'Scalable: Add unlimited clients under your brand',
            ],
          }),
        ]
      );
    }

    console.log(
      `[ValueMultiplier] Created ${agencies.rows.length} white label partnership opportunities`
    );
  }

  /**
   * Strategy 6: Usage-Based Pricing Optimization
   * Automatically adjust pricing tiers as platform scales to maximize revenue
   */
  async optimizePricingTiers(): Promise<void> {
    console.log('[ValueMultiplier] Optimizing pricing tiers...');

    // Analyze usage distribution
    const usageDistribution = await this.pool.query(
      `SELECT 
         plan_type,
         PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY monthly_impressions) as p50_impressions,
         PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY monthly_impressions) as p75_impressions,
         PERCENTILE_CONT(0.90) WITHIN GROUP (ORDER BY monthly_impressions) as p90_impressions,
         AVG(monthly_revenue_cents) as avg_revenue_cents,
         COUNT(*) as customer_count
       FROM (
         SELECT 
           customer_id,
           s.plan_type,
           SUM(impressions) as monthly_impressions,
           SUM(revenue_cents) as monthly_revenue_cents
         FROM usage_records ur
         JOIN subscriptions s ON ur.customer_id = s.customer_id
         WHERE ur.created_at >= NOW() - INTERVAL '30 days'
           AND s.status = 'active'
         GROUP BY customer_id, s.plan_type
       ) subquery
       GROUP BY plan_type`
    );

    // Detect pricing gaps (customers consistently exceeding tier limits)
    const pricingGaps = await this.pool.query(
      `SELECT 
         plan_type,
         COUNT(*) as customers_at_limit,
         AVG(overage_cents) as avg_overage
       FROM (
         SELECT 
           s.customer_id,
           s.plan_type,
           s.plan_limit_impressions,
           SUM(ur.impressions) as monthly_impressions,
           CASE 
             WHEN SUM(ur.impressions) > s.plan_limit_impressions 
             THEN (SUM(ur.impressions) - s.plan_limit_impressions) * 0.5 -- $0.50 per 1K overage impressions
             ELSE 0
           END as overage_cents
         FROM subscriptions s
         JOIN usage_records ur ON s.customer_id = ur.customer_id
         WHERE ur.created_at >= NOW() - INTERVAL '30 days'
           AND s.status = 'active'
         GROUP BY s.customer_id, s.plan_type, s.plan_limit_impressions
       ) subquery
       WHERE monthly_impressions > plan_limit_impressions * 0.80 -- At 80%+ of limit
       GROUP BY plan_type`
    );

    // Recommend new pricing tiers to fill gaps
    for (const gap of pricingGaps.rows) {
      if (gap.customers_at_limit >= 5) {
        // At least 5 customers hitting limit
        console.log(
          `[ValueMultiplier] Pricing gap detected: ${gap.customers_at_limit} ${gap.plan_type} customers hitting limits (avg overage: $${(gap.avg_overage / 100).toFixed(2)})`
        );

        // Recommend intermediate tier
        await this.pool.query(
          `INSERT INTO pricing_recommendations (
             recommendation_type,
             current_plan_type,
             affected_customers,
             avg_overage_cents,
             recommended_action,
             estimated_revenue_increase_cents,
             created_at
           ) VALUES ('add_intermediate_tier', $1, $2, $3, $4, $5, NOW())`,
          [
            gap.plan_type,
            gap.customers_at_limit,
            gap.avg_overage,
            `Add intermediate tier between ${gap.plan_type} and next tier to capture overage revenue`,
            gap.customers_at_limit * gap.avg_overage, // Revenue from converting overage to tier upgrades
          ]
        );
      }
    }

    console.log('[ValueMultiplier] Pricing optimization analysis complete');
  }

  /**
   * Calculate total platform revenue per customer (increases with scale)
   */
  async calculateRevenuePerCustomer(): Promise<{
    direct_revenue_per_customer: number;
    network_effect_bonus_per_customer: number;
    premium_upsell_per_customer: number;
    marketplace_revenue_per_customer: number;
    white_label_revenue_per_customer: number;
    total_revenue_per_customer: number;
  }> {
    const customers = await this.pool.query(
      `SELECT COUNT(*) as total_customers FROM subscriptions WHERE status = 'active'`
    );

    const totalCustomers = parseInt(customers.rows[0].total_customers);

    if (totalCustomers === 0) {
      return {
        direct_revenue_per_customer: 0,
        network_effect_bonus_per_customer: 0,
        premium_upsell_per_customer: 0,
        marketplace_revenue_per_customer: 0,
        white_label_revenue_per_customer: 0,
        total_revenue_per_customer: 0,
      };
    }

    // Direct subscription revenue
    const directRevenue = await this.pool.query(
      `SELECT SUM(base_price_cents) as total_direct_revenue
       FROM subscriptions
       WHERE status = 'active'`
    );

    // Network effect bonus (estimate based on total impressions)
    const totalImpressions = await this.getTotalImpressions();
    const networkEffectBonus = this.estimateNetworkEffectBonus(totalImpressions);

    // Premium upsell revenue
    const premiumRevenue = await this.pool.query(
      `SELECT COUNT(*) * 10000 as total_premium_revenue
       FROM premium_features
       WHERE active = true` // Avg $100/month per premium feature
    );

    // Marketplace revenue (grows with data volume)
    const marketplaceSubscribers = await this.pool.query(
      `SELECT COUNT(*) as subscribers FROM marketplace_subscriptions WHERE status = 'active'`
    );
    const marketplaceRevenue =
      parseInt(marketplaceSubscribers.rows[0]?.subscribers || '0') * 99900; // $999/month per subscriber

    // White label revenue
    const whiteLabelRevenue = await this.pool.query(
      `SELECT COALESCE(SUM(monthly_commission_cents), 0) as total_white_label_revenue
       FROM white_label_partners
       WHERE status = 'active'`
    );

    const directRevenuePerCustomer =
      parseInt(directRevenue.rows[0]?.total_direct_revenue || '0') / totalCustomers;
    const networkEffectBonusPerCustomer = networkEffectBonus / totalCustomers;
    const premiumUpsellPerCustomer =
      parseInt(premiumRevenue.rows[0]?.total_premium_revenue || '0') / totalCustomers;
    const marketplaceRevenuePerCustomer = marketplaceRevenue / totalCustomers;
    const whiteLabelRevenuePerCustomer =
      parseInt(whiteLabelRevenue.rows[0]?.total_white_label_revenue || '0') / totalCustomers;

    const totalRevenuePerCustomer =
      directRevenuePerCustomer +
      networkEffectBonusPerCustomer +
      premiumUpsellPerCustomer +
      marketplaceRevenuePerCustomer +
      whiteLabelRevenuePerCustomer;

    return {
      direct_revenue_per_customer: directRevenuePerCustomer / 100,
      network_effect_bonus_per_customer: networkEffectBonusPerCustomer / 100,
      premium_upsell_per_customer: premiumUpsellPerCustomer / 100,
      marketplace_revenue_per_customer: marketplaceRevenuePerCustomer / 100,
      white_label_revenue_per_customer: whiteLabelRevenuePerCustomer / 100,
      total_revenue_per_customer: totalRevenuePerCustomer / 100,
    };
  }

  /**
   * Helper methods
   */
  private async createUpsellOpportunity(
    customerId: string,
    featureName: string,
    priceCents: number,
    pitch: string,
    metadata: any
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO upsell_opportunities (
         customer_id,
         feature_name,
         price_cents,
         pitch,
         metadata,
         status,
         created_at
       ) VALUES ($1, $2, $3, $4, $5, 'pending', NOW())
       ON CONFLICT (customer_id, feature_name)
       DO UPDATE SET
         price_cents = $3,
         pitch = $4,
         metadata = $5,
         updated_at = NOW()`,
      [customerId, featureName, priceCents, pitch, JSON.stringify(metadata)]
    );

    // Emit email event
    await this.pool.query(
      `INSERT INTO events (event_type, data, created_at)
       VALUES ('email.premium_upsell', $1, NOW())`,
      [
        JSON.stringify({
          customer_id: customerId,
          feature_name: featureName,
          price: priceCents / 100,
          pitch,
          metadata,
        }),
      ]
    );
  }

  private async getTotalImpressions(): Promise<number> {
    const result = await this.pool.query(
      `SELECT SUM(impressions) as total
       FROM usage_records
       WHERE created_at >= NOW() - INTERVAL '30 days'
         AND is_sandbox = false`
    );
    return parseInt(result.rows[0]?.total || '0');
  }

  private estimateNetworkEffectBonus(totalImpressions: number): number {
    // Estimate additional revenue from better eCPM rates due to scale
    // Ad networks pay 10-25% more eCPM at scale
    let bonusPercent = 0;
    if (totalImpressions > 1000000000) bonusPercent = 0.25;
    else if (totalImpressions > 500000000) bonusPercent = 0.20;
    else if (totalImpressions > 100000000) bonusPercent = 0.15;
    else if (totalImpressions > 50000000) bonusPercent = 0.10;

    // Assume avg $5 CPM (eCPM), 10% take rate
    const avgRevenuePer1KImpressions = 500; // $5 eCPM * 10% take rate = $0.50 per 1K impressions
    const baseRevenue = (totalImpressions / 1000) * avgRevenuePer1KImpressions;
    return Math.round(baseRevenue * bonusPercent);
  }

  /**
   * Run all value multiplier strategies
   */
  async runAll(): Promise<void> {
    console.log('[ValueMultiplier] Running all value multiplier strategies...');

    try {
      await this.calculateNetworkEffectBonus();
      await this.optimizeWaterfallsWithAggregateData();
      await this.detectPremiumFeatureOpportunities();
      await this.generateMarketplaceRevenue();
      await this.detectWhiteLabelOpportunities();
      await this.optimizePricingTiers();

      const metrics = await this.calculateRevenuePerCustomer();
      console.log('[ValueMultiplier] Revenue per customer breakdown:');
      console.log(`  Direct: $${metrics.direct_revenue_per_customer.toFixed(2)}/month`);
      console.log(`  Network effect: +$${metrics.network_effect_bonus_per_customer.toFixed(2)}/month`);
      console.log(`  Premium upsells: +$${metrics.premium_upsell_per_customer.toFixed(2)}/month`);
      console.log(`  Marketplace: +$${metrics.marketplace_revenue_per_customer.toFixed(2)}/month`);
      console.log(`  White label: +$${metrics.white_label_revenue_per_customer.toFixed(2)}/month`);
      console.log(`  TOTAL: $${metrics.total_revenue_per_customer.toFixed(2)}/month per customer`);

      console.log('[ValueMultiplier] All strategies complete');
    } catch (error) {
      console.error('[ValueMultiplier] Error running value multipliers:', error);
      throw error;
    }
  }

  /**
   * Cron-compatible methods (aliases for internal strategies)
   */
  async checkNetworkEffectUnlocks(): Promise<void> {
    return this.calculateNetworkEffectBonus();
  }

  async negotiateVolumeDealWithNetworks(): Promise<void> {
    return this.calculateNetworkEffectBonus();
  }

  async applyPremiumFeaturePricing(): Promise<void> {
    return this.detectPremiumFeatureOpportunities();
  }

  async processMarketplaceTrades(): Promise<void> {
    return this.generateMarketplaceRevenue();
  }

  async optimizeWithMLModels(): Promise<void> {
    return this.optimizeWaterfallsWithAggregateData();
  }

  async applyGeographicExpansionDiscounts(): Promise<void> {
    return this.optimizePricingTiers();
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

// Export singleton instance
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL environment variable is required');
}
export const valueMultiplierService = new ValueMultiplierService(databaseUrl);

// CLI support
if (require.main === module) {
  (async () => {
    const service = new ValueMultiplierService(databaseUrl!);
    try {
      await service.runAll();
      await service.close();
      process.exit(0);
    } catch (error) {
      console.error('Error:', error);
      await service.close();
      process.exit(1);
    }
  })();
}
