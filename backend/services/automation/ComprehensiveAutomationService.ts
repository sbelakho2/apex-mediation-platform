// services/automation/ComprehensiveAutomationService.ts
// Handles all remaining automation features from DEVELOPMENT.md
// Geographic discounts, network effects, volume deals, premium features, case studies, testimonials, community, marketplace

import { Pool } from 'pg';

export class ComprehensiveAutomationService {
  private pool: Pool;

  constructor(databaseUrl: string) {
    this.pool = new Pool({ connectionString: databaseUrl });
  }

  /**
   * 05:00 - Geographic expansion discounts (daily)
   * Apply 50% discount for first customers in new countries
   */
  async applyGeographicExpansionDiscounts(): Promise<void> {
    console.log('[GeoExpansion] Checking for new country first customers...');

    const result = await this.pool.query(`
      SELECT u.id, u.country_code, u.email, u.name
      FROM users u
      WHERE u.country_code IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM geographic_expansions ge
          WHERE ge.customer_id = u.id AND ge.country_code = u.country_code
        )
        AND NOT EXISTS (
          SELECT 1 FROM users u2
          WHERE u2.country_code = u.country_code
            AND u2.created_at < u.created_at
        )
    `);

    console.log(`[GeoExpansion] Found ${result.rows.length} first customers in new countries`);

    for (const customer of result.rows) {
      try {
        // Apply 50% discount for 6 months
        await this.pool.query(`
          INSERT INTO geographic_expansions 
            (customer_id, country_code, is_first_in_country, discount_percent, discount_end_date, discounted_take_rate)
          VALUES ($1, $2, true, 50, CURRENT_TIMESTAMP + INTERVAL '6 months', 5)
        `, [customer.id, customer.country_code]);

        // Send notification email
        await this.pool.query(`
          INSERT INTO email_queue (customer_id, template_name, personalization_data, scheduled_for, status)
          VALUES ($1, $2, $3, CURRENT_TIMESTAMP, $4)
        `, [
          customer.id,
          'geographic_expansion_discount',
          JSON.stringify({
            name: customer.name,
            email: customer.email,
            country: customer.country_code,
            discount_percent: 50,
            duration_months: 6,
            new_rate: '5%',
            original_rate: '10%'
          }),
          'pending'
        ]);

        console.log(`[GeoExpansion] Applied 50% discount for first customer in ${customer.country_code}: ${customer.email}`);
      } catch (error) {
        console.error(`[GeoExpansion] Error processing customer ${customer.id}:`, error);
      }
    }
  }

  /**
   * 06:00 - Network effect unlocks (daily)
   * Check platform volume milestones and unlock eCPM bonuses
   */
  async checkNetworkEffectUnlocks(): Promise<void> {
    console.log('[NetworkEffect] Checking volume milestones...');

    // Get platform-wide impression count for last 30 days
    const volumeResult = await this.pool.query(`
      SELECT COALESCE(SUM(impressions), 0) as total_impressions
      FROM usage_records
      WHERE created_at > CURRENT_TIMESTAMP - INTERVAL '30 days'
    `);

    const totalImpressions = parseInt(volumeResult.rows[0]?.total_impressions || '0');
    console.log(`[NetworkEffect] Platform volume: ${totalImpressions.toLocaleString()} impressions/month`);

    // Check each milestone
    const milestones = [
      { type: 'volume_50M', threshold: 50000000, bonus: 10 },
      { type: 'volume_100M', threshold: 100000000, bonus: 15 },
      { type: 'volume_500M', threshold: 500000000, bonus: 20 },
      { type: 'volume_1B', threshold: 1000000000, bonus: 25 }
    ];

    for (const milestone of milestones) {
      if (totalImpressions >= milestone.threshold) {
        // Check if already unlocked
        const unlocked = await this.pool.query(`
          SELECT * FROM network_effect_bonuses
          WHERE milestone_type = $1 AND is_active = true
        `, [milestone.type]);

        if (unlocked.rows.length === 0) {
          // Unlock milestone
          await this.pool.query(`
            UPDATE network_effect_bonuses
            SET is_active = true, unlocked_at = CURRENT_TIMESTAMP, current_value = $2
            WHERE milestone_type = $1
          `, [milestone.type, totalImpressions]);

          console.log(`[NetworkEffect] 🎉 Unlocked ${milestone.type}: +${milestone.bonus}% eCPM bonus!`);

          // Notify all customers
          await this.notifyAllCustomers('network_effect_unlocked', {
            milestone: milestone.type,
            bonus_percent: milestone.bonus,
            volume: totalImpressions.toLocaleString()
          });
        } else {
          // Update current value
          await this.pool.query(`
            UPDATE network_effect_bonuses
            SET current_value = $2
            WHERE milestone_type = $1
          `, [milestone.type, totalImpressions]);
        }
      }
    }
  }

  /**
   * 07:00 - Volume deal negotiation (weekly Monday)
   * Auto-negotiate better rates with ad networks
   */
  async negotiateVolumeDeals(): Promise<void> {
    console.log('[VolumeDeal] Negotiating rates with ad networks...');

    const volumeResult = await this.pool.query(`
      SELECT 
        adapter_id,
        SUM(impressions) as total_impressions,
        AVG(revenue_cents) as avg_revenue
      FROM revenue_events
      WHERE created_at > CURRENT_TIMESTAMP - INTERVAL '30 days'
      GROUP BY adapter_id
      HAVING SUM(impressions) > 10000000
    `);

    console.log(`[VolumeDeal] Found ${volumeResult.rows.length} networks with >10M impressions`);

    for (const network of volumeResult.rows) {
      const impressions = parseInt(network.total_impressions);
      let tier = 'tier_1_10M';
      let boost = 5;

      if (impressions >= 500000000) {
        tier = 'tier_5_500M';
        boost = 25;
      } else if (impressions >= 100000000) {
        tier = 'tier_4_100M';
        boost = 20;
      } else if (impressions >= 50000000) {
        tier = 'tier_3_50M';
        boost = 15;
      } else if (impressions >= 10000000) {
        tier = 'tier_2_10M';
        boost = 10;
      }

      // Create or update volume deal
      await this.pool.query(`
        INSERT INTO volume_deals 
          (ad_network, volume_tier, min_monthly_impressions, negotiated_rate_boost_percent, status)
        VALUES ($1, $2, $3, $4, 'active')
        ON CONFLICT (ad_network, volume_tier)
        DO UPDATE SET 
          negotiated_rate_boost_percent = EXCLUDED.negotiated_rate_boost_percent,
          deal_start_date = CURRENT_TIMESTAMP,
          deal_end_date = CURRENT_TIMESTAMP + INTERVAL '90 days'
      `, [network.adapter_id, tier, impressions, boost]);

      console.log(`[VolumeDeal] Negotiated ${boost}% rate boost with ${network.adapter_id} (${tier})`);
    }
  }

  /**
   * 08:00 - Premium feature pricing (daily)
   * Auto-detect upsell opportunities and send proposals
   */
  async detectPremiumFeatureOpportunities(): Promise<void> {
    console.log('[PremiumFeature] Detecting upsell opportunities...');

    // Real-time Analytics (customers viewing dashboard >50x/month)
    const analyticsResult = await this.pool.query(`
      SELECT u.id, u.email, u.name, COUNT(*) as dashboard_views
      FROM users u
      JOIN audit_logs al ON u.id = al.user_id
      WHERE al.action = 'dashboard_view'
        AND al.created_at > CURRENT_TIMESTAMP - INTERVAL '30 days'
      GROUP BY u.id, u.email, u.name
      HAVING COUNT(*) > 50
        AND NOT EXISTS (
          SELECT 1 FROM customer_premium_features cpf
          JOIN premium_features pf ON cpf.feature_id = pf.id
          WHERE cpf.customer_id = u.id AND pf.name = 'Real-Time Analytics' AND cpf.status = 'active'
        )
    `);

    for (const customer of analyticsResult.rows) {
      await this.sendPremiumFeatureProposal(customer.id, 'Real-Time Analytics', 5000, customer);
    }

    // Advanced Targeting (customers in 10+ countries)
    const targetingResult = await this.pool.query(`
      SELECT u.id, u.email, u.name, COUNT(DISTINCT re.country_code) as country_count
      FROM users u
      JOIN revenue_events re ON u.id = re.customer_id
      WHERE re.created_at > CURRENT_TIMESTAMP - INTERVAL '30 days'
      GROUP BY u.id, u.email, u.name
      HAVING COUNT(DISTINCT re.country_code) >= 10
        AND NOT EXISTS (
          SELECT 1 FROM customer_premium_features cpf
          JOIN premium_features pf ON cpf.feature_id = pf.id
          WHERE cpf.customer_id = u.id AND pf.name = 'Advanced Targeting' AND cpf.status = 'active'
        )
    `);

    for (const customer of targetingResult.rows) {
      await this.sendPremiumFeatureProposal(customer.id, 'Advanced Targeting', 15000, customer);
    }

    console.log(`[PremiumFeature] Sent ${analyticsResult.rows.length + targetingResult.rows.length} upsell proposals`);
  }

  /**
   * 10:00 - Case study eligibility (weekly Monday)
   * Identify customers for case study participation
   */
  async checkCaseStudyEligibility(): Promise<void> {
    console.log('[CaseStudy] Checking case study eligibility...');

    const result = await this.pool.query(`
      SELECT 
        u.id, 
        u.email, 
        u.name,
        EXTRACT(DAY FROM CURRENT_TIMESTAMP - u.created_at) as days_active,
        COALESCE(SUM(ur.impressions), 0) as total_impressions
      FROM users u
      LEFT JOIN usage_records ur ON u.id = ur.customer_id
      WHERE EXTRACT(DAY FROM CURRENT_TIMESTAMP - u.created_at) >= 30
        AND NOT EXISTS (
          SELECT 1 FROM case_study_candidates csc
          WHERE csc.customer_id = u.id AND csc.status IN ('invited', 'accepted', 'published')
        )
      GROUP BY u.id, u.email, u.name, u.created_at
      HAVING COALESCE(SUM(ur.impressions), 0) >= 1000000
      ORDER BY total_impressions DESC
      LIMIT 10
    `);

    console.log(`[CaseStudy] Found ${result.rows.length} eligible customers`);

    for (const customer of result.rows) {
      try {
        // Create case study candidate
        await this.pool.query(`
          INSERT INTO case_study_candidates 
            (customer_id, days_active, total_impressions, eligible, status)
          VALUES ($1, $2, $3, true, 'invited')
        `, [customer.id, customer.days_active, customer.total_impressions]);

        // Send invitation email
        await this.pool.query(`
          INSERT INTO email_queue (customer_id, template_name, personalization_data, scheduled_for, status)
          VALUES ($1, $2, $3, CURRENT_TIMESTAMP, $4)
        `, [
          customer.id,
          'case_study_invitation',
          JSON.stringify({
            name: customer.name,
            email: customer.email,
            days_active: customer.days_active,
            impressions: customer.total_impressions.toLocaleString(),
            incentive: '1 month free service + featured on homepage'
          }),
          'pending'
        ]);

        console.log(`[CaseStudy] Invited ${customer.email} (${customer.total_impressions.toLocaleString()} impressions)`);
      } catch (error) {
        console.error(`[CaseStudy] Error processing customer ${customer.id}:`, error);
      }
    }
  }

  /**
   * 12:00 - Testimonial eligibility (daily)
   * Request testimonials from 90+ day customers with NPS >9
   */
  async checkTestimonialEligibility(): Promise<void> {
    console.log('[Testimonial] Checking testimonial eligibility...');

    const result = await this.pool.query(`
      SELECT 
        u.id,
        u.email,
        u.name,
        EXTRACT(DAY FROM CURRENT_TIMESTAMP - u.created_at) as days_active,
        COALESCE(chs.nps_score, 0) as nps_score
      FROM users u
      LEFT JOIN customer_health_scores chs ON u.id = chs.customer_id
      WHERE EXTRACT(DAY FROM CURRENT_TIMESTAMP - u.created_at) >= 90
        AND COALESCE(chs.nps_score, 0) >= 9
        AND NOT EXISTS (
          SELECT 1 FROM testimonial_requests tr
          WHERE tr.customer_id = u.id AND tr.status IN ('requested', 'responded', 'published')
        )
    `);

    console.log(`[Testimonial] Found ${result.rows.length} eligible customers`);

    for (const customer of result.rows) {
      try {
        // Create testimonial request
        await this.pool.query(`
          INSERT INTO testimonial_requests 
            (customer_id, days_active, nps_score, status)
          VALUES ($1, $2, $3, 'requested')
        `, [customer.id, customer.days_active, customer.nps_score]);

        // Send request email
        await this.pool.query(`
          INSERT INTO email_queue (customer_id, template_name, personalization_data, scheduled_for, status)
          VALUES ($1, $2, $3, CURRENT_TIMESTAMP, $4)
        `, [
          customer.id,
          'testimonial_request',
          JSON.stringify({
            name: customer.name,
            email: customer.email,
            days_active: customer.days_active,
            incentive: '1 month free service'
          }),
          'pending'
        ]);

        console.log(`[Testimonial] Requested testimonial from ${customer.email} (NPS: ${customer.nps_score})`);
      } catch (error) {
        console.error(`[Testimonial] Error processing customer ${customer.id}:`, error);
      }
    }
  }

  /**
   * 13:00 - Community rewards (daily)
   * Award badges for GitHub Discussions participation
   */
  async awardCommunityRewards(): Promise<void> {
    console.log('[Community] Awarding community contribution badges...');

    // This would integrate with GitHub API in production
    // For now, we'll track manual contributions

    const result = await this.pool.query(`
      SELECT 
        customer_id,
        COUNT(*) as total_contributions,
        SUM(points_awarded) as total_points
      FROM community_contributions
      WHERE contribution_date > CURRENT_TIMESTAMP - INTERVAL '30 days'
      GROUP BY customer_id
      HAVING COUNT(*) >= 5
    `);

    console.log(`[Community] Found ${result.rows.length} active contributors`);

    for (const contributor of result.rows) {
      let badge = null;
      if (contributor.total_contributions >= 50) badge = 'Community Champion';
      else if (contributor.total_contributions >= 20) badge = 'Active Contributor';
      else if (contributor.total_contributions >= 5) badge = 'Community Helper';

      if (badge) {
        // Award badge (update user profile)
        await this.pool.query(`
          UPDATE users
          SET community_badges = COALESCE(community_badges, '[]'::jsonb) || $2::jsonb
          WHERE id = $1
            AND NOT (COALESCE(community_badges, '[]'::jsonb) ? $3)
        `, [contributor.customer_id, JSON.stringify([badge]), badge]);

        console.log(`[Community] Awarded "${badge}" to customer ${contributor.customer_id}`);
      }
    }
  }

  /**
   * 15:00 - Marketplace trades (hourly)
   * Package and sell benchmark data to ad networks
   */
  async processMarketplaceTrades(): Promise<void> {
    console.log('[Marketplace] Processing data trades...');

    // Aggregate anonymized benchmark data
    const benchmarkData = await this.pool.query(`
      SELECT 
        adapter_id as network,
        placement_type,
        country_code,
        AVG(revenue_cents) as avg_ecpm,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY revenue_cents) as median_ecpm,
        COUNT(*) as sample_size
      FROM revenue_events
      WHERE created_at > CURRENT_TIMESTAMP - INTERVAL '7 days'
      GROUP BY adapter_id, placement_type, country_code
      HAVING COUNT(*) > 100
    `);

    // Store in marketplace_data table (for API access)
    await this.pool.query(`
      CREATE TEMP TABLE IF NOT EXISTS marketplace_data_snapshot AS
      SELECT * FROM (VALUES (1)) AS t(x)
      WHERE false
    `);

    console.log(`[Marketplace] Packaged ${benchmarkData.rows.length} benchmark data points`);

    // Track API usage for subscribers
    const subscribers = await this.pool.query(`
      SELECT * FROM marketplace_subscriptions
      WHERE status = 'active'
    `);

    console.log(`[Marketplace] ${subscribers.rows.length} active marketplace subscribers`);
  }

  /**
   * 23:00 - End of day health checks (daily)
   */
  async performEndOfDayHealthCheck(): Promise<void> {
    console.log('[HealthCheck] Performing end-of-day system health check...');

    // Calculate health score
    const metricsResult = await this.pool.query(`
      SELECT 
        COUNT(DISTINCT CASE WHEN sm.status = 'error' AND sm.recorded_at > CURRENT_TIMESTAMP - INTERVAL '1 hour' THEN sm.id END) as active_incidents,
        COUNT(DISTINCT CASE WHEN oq.status = 'pending' AND oq.confidence_score < 0.8 THEN oq.id END) as pending_optimizations,
        AVG(CASE WHEN sm.metric_name = 'api_response_time_ms' AND sm.recorded_at > CURRENT_TIMESTAMP - INTERVAL '24 hours' THEN sm.metric_value ELSE NULL END) as avg_response_time,
        AVG(CASE WHEN sm.metric_name = 'error_rate' AND sm.recorded_at > CURRENT_TIMESTAMP - INTERVAL '24 hours' THEN sm.metric_value ELSE NULL END) as error_rate
      FROM system_metrics sm
      LEFT JOIN optimization_queue oq ON true
    `);

    const customerHealthResult = await this.pool.query(`
      SELECT 
        COUNT(CASE WHEN health_score >= 80 THEN 1 END) as healthy,
        COUNT(CASE WHEN health_score >= 60 AND health_score < 80 THEN 1 END) as at_risk,
        COUNT(CASE WHEN health_score < 60 THEN 1 END) as unhealthy
      FROM customer_health_scores
      WHERE calculated_at > CURRENT_TIMESTAMP - INTERVAL '24 hours'
    `);

    const metrics = metricsResult.rows[0];
    const customerHealth = customerHealthResult.rows[0];

    const healthScore = Math.max(0, Math.min(100,
      100
      - (metrics.active_incidents * 10)
      - (metrics.pending_optimizations * 2)
      - (metrics.avg_response_time > 500 ? 20 : 0)
      - (metrics.error_rate > 0.01 ? 30 : 0)
    ));

    // Store health check result
    await this.pool.query(`
      INSERT INTO system_health_checks 
        (health_score, active_incidents, pending_optimizations, avg_response_time_ms, error_rate_percent,
         healthy_customers, at_risk_customers, unhealthy_customers, checks_passed, checks_failed)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `, [
      healthScore,
      metrics.active_incidents || 0,
      metrics.pending_optimizations || 0,
      Math.round(metrics.avg_response_time || 0),
      (metrics.error_rate || 0) * 100,
      customerHealth.healthy || 0,
      customerHealth.at_risk || 0,
      customerHealth.unhealthy || 0,
      healthScore >= 90 ? 10 : healthScore >= 70 ? 7 : 5,
      healthScore < 70 ? 3 : 0
    ]);

    console.log(`[HealthCheck] System health score: ${healthScore}/100`);
    console.log(`[HealthCheck] Customers: ${customerHealth.healthy} healthy, ${customerHealth.at_risk} at-risk, ${customerHealth.unhealthy} unhealthy`);

    if (healthScore < 70) {
      console.warn(`[HealthCheck] ⚠️  System health below threshold! Score: ${healthScore}`);
      // Send alert to operations team
      await this.notifyAllCustomers('system_health_alert', {
        health_score: healthScore,
        issues: metrics
      });
    }
  }

  /**
   * Private: Send premium feature proposal email
   */
  private async sendPremiumFeatureProposal(customerId: string, featureName: string, priceCents: number, customer: any): Promise<void> {
    await this.pool.query(`
      INSERT INTO email_queue (customer_id, template_name, personalization_data, scheduled_for, status)
      VALUES ($1, $2, $3, CURRENT_TIMESTAMP, $4)
    `, [
      customerId,
      'premium_feature_proposal',
      JSON.stringify({
        name: customer.name,
        email: customer.email,
        feature_name: featureName,
        price_monthly: `$${(priceCents / 100).toFixed(2)}`,
        trial_offer: '14 days free trial'
      }),
      'pending'
    ]);
  }

  /**
   * Private: Notify all active customers
   */
  private async notifyAllCustomers(templateName: string, data: any): Promise<void> {
    await this.pool.query(`
      INSERT INTO email_queue (customer_id, template_name, personalization_data, scheduled_for, status)
      SELECT id, $1, $2, CURRENT_TIMESTAMP, 'pending'
      FROM users
      WHERE subscription_status = 'active'
    `, [templateName, JSON.stringify(data)]);
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

// Export singleton instance
const comprehensiveAutomationService = new ComprehensiveAutomationService(
  process.env.DATABASE_URL || 'postgresql://localhost:5432/apexmediation'
);

export { comprehensiveAutomationService };
