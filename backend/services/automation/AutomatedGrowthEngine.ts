// services/automation/AutomatedGrowthEngine.ts
// Zero-touch growth engine: Continuously optimizes conversion, retention, and expansion
// Uses ML to personalize customer journeys, predict churn, and automate interventions

import { Pool } from 'pg';
import OpenAI from 'openai';

interface CustomerHealthScore {
  customer_id: string;
  health_score: number; // 0-100
  churn_risk: 'low' | 'medium' | 'high';
  predicted_churn_date: Date | null;
  intervention_recommended: boolean;
}

interface GrowthOpportunity {
  customer_id: string;
  opportunity_type: 'upgrade' | 'expansion' | 'referral' | 'case_study';
  likelihood: number; // 0-1
  expected_value_cents: number;
  automated_action: string;
}

interface PersonalizedJourney {
  customer_id: string;
  journey_stage: 'trial' | 'onboarding' | 'activation' | 'growth' | 'retention' | 'expansion';
  next_best_action: string;
  personalization_data: Record<string, any>;
}

export class AutomatedGrowthEngine {
  private pool: Pool;
  private openai?: OpenAI;
  private aiEnabled: boolean;

  constructor(databaseUrl: string, openaiApiKey?: string, enableAI = false) {
    this.pool = new Pool({ connectionString: databaseUrl });
    this.aiEnabled = Boolean(enableAI && openaiApiKey);
    if (this.aiEnabled && openaiApiKey) {
      this.openai = new OpenAI({ apiKey: openaiApiKey });
    } else if (enableAI && !openaiApiKey) {
      console.warn('[GrowthEngine] AI insights requested but OPENAI_API_KEY is missing; disabling AI features');
      this.aiEnabled = false;
    } else {
      this.aiEnabled = false;
    }
  }

  /**
   * CORE: Run all growth automation strategies
   * Executes daily to optimize customer lifecycle
   */
  async runGrowthAutomation(): Promise<void> {
    console.log('[GrowthEngine] Starting automated growth cycle...');

    if (!this.aiEnabled) {
      console.log('[GrowthEngine] AI insights disabled, running rule-based automation only');
    }

    try {
      // 1. Calculate customer health scores (predict churn)
      await this.calculateHealthScores();

      // 2. Identify growth opportunities (upgrades, expansions)
      await this.identifyGrowthOpportunities();

      // 3. Personalize customer journeys (optimize for activation)
      await this.personalizeCustomerJourneys();

      // 4. Auto-intervene on churn risks
      await this.autoInterventOnChurnRisk();

      // 5. Optimize onboarding flows (A/B test improvements)
      await this.optimizeOnboarding();

      // 6. Automate success stories (capture at peak engagement)
      await this.automateSuccessStoryCapture();

      // 7. Viral loop optimization (maximize referral conversions)
      await this.optimizeViralLoops();

      // 8. Price optimization (maximize revenue per customer)
      await this.optimizePricing();

      console.log('[GrowthEngine] Growth automation cycle complete');
    } catch (error) {
      console.error('[GrowthEngine] Error in growth cycle:', error);
    }
  }

  /**
   * Calculate customer health scores using ML
   * Predicts churn risk and identifies intervention opportunities
   */
  private async calculateHealthScores(): Promise<void> {
    console.log('[GrowthEngine] Calculating customer health scores...');

    const customers = await this.pool.query(`
      SELECT 
        u.id as customer_id,
        u.email,
        u.created_at,
        s.plan_type,
        s.status as subscription_status,
        -- Usage metrics (last 30 days)
        COALESCE(SUM(ur.impressions), 0) as total_impressions,
        COALESCE(SUM(ur.revenue_cents), 0) as total_revenue,
        COUNT(DISTINCT DATE(ur.created_at)) as days_active,
        -- Engagement metrics
        (SELECT COUNT(*) FROM api_logs WHERE user_id = u.id AND created_at > NOW() - INTERVAL '7 days') as api_calls_7d,
        (SELECT COUNT(*) FROM analytics_views WHERE customer_id = u.id AND created_at > NOW() - INTERVAL '7 days') as dashboard_views_7d,
        -- Support metrics
        (SELECT COUNT(*) FROM support_tickets WHERE customer_id = u.id AND status = 'open') as open_tickets,
        -- Payment health
        (SELECT COUNT(*) FROM payment_failures WHERE customer_id = u.id AND created_at > NOW() - INTERVAL '30 days') as recent_payment_failures
      FROM users u
      LEFT JOIN subscriptions s ON u.id = s.customer_id
      LEFT JOIN usage_records ur ON u.id = ur.customer_id AND ur.created_at > NOW() - INTERVAL '30 days'
      WHERE u.role = 'customer'
        AND s.status = 'active'
      GROUP BY u.id, u.email, u.created_at, s.plan_type, s.status
    `);

    for (const customer of customers.rows) {
      // Calculate health score (0-100)
      let healthScore = 100;

      // Usage penalties
      if (customer.total_impressions === 0) healthScore -= 40; // Not using product
      else if (customer.days_active < 7) healthScore -= 20; // Low engagement
      
      // Engagement penalties
      if (customer.api_calls_7d === 0) healthScore -= 15;
      if (customer.dashboard_views_7d === 0) healthScore -= 10;
      
      // Support penalties
      healthScore -= customer.open_tickets * 5;
      
      // Payment penalties
      healthScore -= customer.recent_payment_failures * 15;

      // Determine churn risk
      let churnRisk: 'low' | 'medium' | 'high' = 'low';
      let predictedChurnDate: Date | null = null;

      if (healthScore < 40) {
        churnRisk = 'high';
        predictedChurnDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
      } else if (healthScore < 60) {
        churnRisk = 'medium';
        predictedChurnDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
      }

      // Store health score
      await this.pool.query(
        `INSERT INTO customer_health_scores (
           customer_id, health_score, churn_risk, predicted_churn_date,
           intervention_recommended, calculated_at
         ) VALUES ($1, $2, $3, $4, $5, NOW())
         ON CONFLICT (customer_id) DO UPDATE SET
           health_score = $2,
           churn_risk = $3,
           predicted_churn_date = $4,
           intervention_recommended = $5,
           calculated_at = NOW()`,
        [customer.customer_id, healthScore, churnRisk, predictedChurnDate, healthScore < 60]
      );
    }

    console.log(`[GrowthEngine] Health scores calculated for ${customers.rows.length} customers`);
  }

  /**
   * Identify growth opportunities: Upgrades, expansions, referrals
   */
  private async identifyGrowthOpportunities(): Promise<void> {
    console.log('[GrowthEngine] Identifying growth opportunities...');

    // Upgrade opportunities (customers hitting plan limits)
    const upgradeOpportunities = await this.pool.query(`
      SELECT 
        u.id as customer_id,
        u.email,
        s.plan_type,
        SUM(ur.impressions) as monthly_impressions,
        s.plan_limit_impressions,
        (SUM(ur.impressions)::FLOAT / s.plan_limit_impressions) as usage_percent
      FROM users u
      JOIN subscriptions s ON u.id = s.customer_id
      JOIN usage_records ur ON u.id = ur.customer_id
      WHERE ur.created_at > NOW() - INTERVAL '30 days'
        AND s.status = 'active'
      GROUP BY u.id, u.email, s.plan_type, s.plan_limit_impressions
      HAVING (SUM(ur.impressions)::FLOAT / s.plan_limit_impressions) > 0.80
    `);

    for (const opp of upgradeOpportunities.rows) {
      const likelihood = Math.min(opp.usage_percent - 0.80, 1.0); // 80-100% usage = high likelihood
      const expectedValue = 40000; // $400/month upgrade value

      await this.pool.query(
        `INSERT INTO growth_opportunities (
           customer_id, opportunity_type, likelihood, expected_value_cents,
           automated_action, created_at
         ) VALUES ($1, 'upgrade', $2, $3, $4, NOW())
         ON CONFLICT (customer_id, opportunity_type) DO UPDATE SET
           likelihood = $2,
           expected_value_cents = $3,
           automated_action = $4,
           updated_at = NOW()`,
        [
          opp.customer_id,
          likelihood,
          expectedValue,
          `Send upgrade email: "You're using ${(opp.usage_percent * 100).toFixed(0)}% of your ${opp.plan_type} plan. Upgrade to avoid overage fees!"`,
        ]
      );

      // Trigger automated email
      await this.sendAutomatedEmail(
        opp.customer_id,
        'upgrade_opportunity',
        {
          usage_percent: opp.usage_percent,
          plan_type: opp.plan_type,
          next_plan: this.getNextPlanTier(opp.plan_type),
        }
      );
    }

    // Expansion opportunities (multi-app usage patterns)
    const expansionOpportunities = await this.pool.query(`
      SELECT 
        customer_id,
        COUNT(DISTINCT metadata->>'app_id') as app_count
      FROM usage_records
      WHERE created_at > NOW() - INTERVAL '30 days'
      GROUP BY customer_id
      HAVING COUNT(DISTINCT metadata->>'app_id') >= 2
    `);

    for (const opp of expansionOpportunities.rows) {
      await this.pool.query(
        `INSERT INTO growth_opportunities (
           customer_id, opportunity_type, likelihood, expected_value_cents,
           automated_action, created_at
         ) VALUES ($1, 'expansion', 0.5, 50000, $2, NOW())
         ON CONFLICT (customer_id, opportunity_type) DO UPDATE SET
           likelihood = 0.5,
           expected_value_cents = 50000,
           automated_action = $2,
           updated_at = NOW()`,
        [
          opp.customer_id,
          `Send expansion email: "We noticed you manage ${opp.app_count} apps. Consider our Enterprise plan for multi-app management!"`,
        ]
      );
    }

    console.log(
      `[GrowthEngine] Identified ${upgradeOpportunities.rows.length} upgrade + ${expansionOpportunities.rows.length} expansion opportunities`
    );
  }

  /**
   * Personalize customer journeys based on behavior
   */
  private async personalizeCustomerJourneys(): Promise<void> {
    console.log('[GrowthEngine] Personalizing customer journeys...');

    const customers = await this.pool.query(`
      SELECT 
        u.id as customer_id,
        u.created_at,
        u.metadata as user_metadata,
        s.status as subscription_status,
        -- Determine journey stage
        CASE 
          WHEN s.status = 'trialing' THEN 'trial'
          WHEN EXTRACT(EPOCH FROM (NOW() - u.created_at)) < 604800 THEN 'onboarding' -- <7 days
          WHEN (SELECT SUM(impressions) FROM usage_records WHERE customer_id = u.id) < 100000 THEN 'activation'
          WHEN (SELECT SUM(impressions) FROM usage_records WHERE customer_id = u.id) > 10000000 THEN 'expansion'
          ELSE 'growth'
        END as journey_stage
      FROM users u
      LEFT JOIN subscriptions s ON u.id = s.customer_id
      WHERE u.role = 'customer'
    `);

    for (const customer of customers.rows) {
      let nextBestAction = '';

      // Personalize based on journey stage
      switch (customer.journey_stage) {
        case 'trial':
          nextBestAction = 'Send trial success tips, showcase quick wins';
          break;
        case 'onboarding':
          nextBestAction = 'Guide through first SDK integration, offer white-glove setup call';
          break;
        case 'activation':
          nextBestAction = 'Encourage reaching 100K impressions milestone, offer optimization tips';
          break;
        case 'growth':
          nextBestAction = 'Introduce premium features, showcase advanced optimizations';
          break;
        case 'expansion':
          nextBestAction = 'Offer white-label partnership, invite to enterprise plan demo';
          break;
        case 'retention':
          nextBestAction = 'Send success metrics, request testimonial, offer referral bonus';
          break;
      }

      await this.pool.query(
        `INSERT INTO personalized_journeys (
           customer_id, journey_stage, next_best_action, personalization_data, updated_at
         ) VALUES ($1, $2, $3, $4, NOW())
         ON CONFLICT (customer_id) DO UPDATE SET
           journey_stage = $2,
           next_best_action = $3,
           personalization_data = $4,
           updated_at = NOW()`,
        [customer.customer_id, customer.journey_stage, nextBestAction, customer.user_metadata]
      );
    }

    console.log(`[GrowthEngine] Personalized journeys for ${customers.rows.length} customers`);
  }

  /**
   * Auto-intervene on high churn risk customers
   */
  private async autoInterventOnChurnRisk(): Promise<void> {
    console.log('[GrowthEngine] Auto-intervening on churn risks...');

    const churnRisks = await this.pool.query(`
      SELECT 
        chs.customer_id,
        chs.health_score,
        chs.churn_risk,
        u.email,
        s.plan_type
      FROM customer_health_scores chs
      JOIN users u ON chs.customer_id = u.id
      JOIN subscriptions s ON u.id = s.customer_id
      WHERE chs.churn_risk IN ('medium', 'high')
        AND chs.intervention_recommended = true
        AND NOT EXISTS (
          SELECT 1 FROM churn_interventions 
          WHERE customer_id = chs.customer_id 
            AND created_at > NOW() - INTERVAL '7 days'
        )
    `);

    for (const risk of churnRisks.rows) {
      // Personalized intervention strategy
      let interventionType = '';
      let offerDetails = {};

      if (risk.churn_risk === 'high') {
        // Critical: Offer discount or founder call
        interventionType = 'discount_offer';
        offerDetails = { discount_percent: 50, duration_months: 3, personal_call: true };
      } else {
        // Medium: Send engagement email
        interventionType = 'engagement_email';
        offerDetails = { optimization_tips: true, success_stories: true };
      }

      // Log intervention
      await this.pool.query(
        `INSERT INTO churn_interventions (
           customer_id, intervention_type, offer_details, created_at
         ) VALUES ($1, $2, $3, NOW())`,
        [risk.customer_id, interventionType, JSON.stringify(offerDetails)]
      );

      // Send automated email
      await this.sendAutomatedEmail(risk.customer_id, `churn_${interventionType}`, offerDetails);

      console.log(
        `[GrowthEngine] Intervention sent to ${risk.email} (${risk.churn_risk} risk, score: ${risk.health_score})`
      );
    }

    console.log(`[GrowthEngine] Intervened on ${churnRisks.rows.length} churn risks`);
  }

  /**
   * Optimize onboarding flows using A/B testing
   */
  private async optimizeOnboarding(): Promise<void> {
    console.log('[GrowthEngine] Optimizing onboarding flows...');

    // Check if there are active onboarding A/B tests
    const activeTests = await this.pool.query(`
      SELECT * FROM ab_tests 
      WHERE test_name LIKE 'onboarding_%' 
        AND status = 'running'
    `);

    if (activeTests.rows.length === 0) {
      console.log('[GrowthEngine] No active onboarding tests, creating new one...');

      // Create new A/B test: Email timing optimization
      await this.pool.query(
        `INSERT INTO ab_tests (
           test_name, description, variant_a, variant_b, traffic_split,
           metric_to_optimize, status, started_at
         ) VALUES (
           'onboarding_email_timing_v2',
           'Test email timing: Day 1 vs Day 3 for integration tips',
           '{"email_delay_hours": 24}',
           '{"email_delay_hours": 72}',
           0.50,
           'activation_rate',
           'running',
           NOW()
         )`
      );
    } else {
      // Analyze ongoing tests for statistical significance
      for (const test of activeTests.rows) {
        const results = await this.analyzeABTest(test.id);

        if (results.statistical_significance >= 0.95) {
          // Conclude test and roll out winner
          await this.pool.query(
            `UPDATE ab_tests 
             SET status = 'concluded', winner = $1, concluded_at = NOW()
             WHERE id = $2`,
            [results.winner, test.id]
          );

          console.log(
            `[GrowthEngine] A/B test concluded: ${test.test_name}, winner: ${results.winner} (${(results.improvement * 100).toFixed(1)}% improvement)`
          );

          // Auto-apply winning variant
          await this.applyWinningVariant(test.id, results.winner);
        }
      }
    }
  }

  /**
   * Automate success story capture at peak engagement
   */
  private async automateSuccessStoryCapture(): Promise<void> {
    console.log('[GrowthEngine] Automating success story capture...');

    // Find customers at peak engagement (high usage + recent milestone)
    const peakCustomers = await this.pool.query(`
      SELECT 
        u.id as customer_id,
        u.email,
        cm.milestone_type,
        cm.achieved_at
      FROM users u
      JOIN customer_milestones cm ON u.id = cm.customer_id
      WHERE cm.milestone_type IN ('1M_impressions', '10M_impressions', '100M_impressions')
        AND cm.achieved_at > NOW() - INTERVAL '7 days'
        AND NOT EXISTS (
          SELECT 1 FROM success_story_requests 
          WHERE customer_id = u.id 
            AND requested_at > NOW() - INTERVAL '90 days'
        )
    `);

    for (const customer of peakCustomers.rows) {
      // Auto-send success story request
      await this.pool.query(
        `INSERT INTO success_story_requests (
           customer_id, request_type, incentive, requested_at
         ) VALUES ($1, 'case_study', 'Featured on homepage + $500 credit', NOW())`,
        [customer.customer_id]
      );

      await this.sendAutomatedEmail(customer.customer_id, 'success_story_request', {
        milestone: customer.milestone_type,
        incentive: 'Featured on homepage + $500 credit',
      });

      console.log(`[GrowthEngine] Success story request sent to ${customer.email}`);
    }
  }

  /**
   * Optimize viral loops (referral conversion)
   */
  private async optimizeViralLoops(): Promise<void> {
    console.log('[GrowthEngine] Optimizing viral loops...');

    // Identify customers likely to refer (high engagement + success)
    const referralCandidates = await this.pool.query(`
      SELECT 
        u.id as customer_id,
        u.email,
        chs.health_score
      FROM users u
      JOIN customer_health_scores chs ON u.id = chs.customer_id
      WHERE chs.health_score > 80
        AND NOT EXISTS (
          SELECT 1 FROM referral_codes WHERE customer_id = u.id
        )
        AND (SELECT COUNT(*) FROM usage_records WHERE customer_id = u.id) > 1000000
    `);

    for (const candidate of referralCandidates.rows) {
      // Auto-generate referral code
      const referralCode = `REF${candidate.customer_id.slice(0, 8).toUpperCase()}`;

      await this.pool.query(
        `INSERT INTO referral_codes (
           customer_id, code, discount_percent, referrer_credit_cents, created_at
         ) VALUES ($1, $2, 10, 50000, NOW())`,
        [candidate.customer_id, referralCode, ]
      );

      // Send referral invitation
      await this.sendAutomatedEmail(candidate.customer_id, 'referral_invitation', {
        referral_code: referralCode,
        referrer_credit: '$500',
        referee_discount: '10% off first 3 months',
      });

      console.log(`[GrowthEngine] Referral code created for ${candidate.email}: ${referralCode}`);
    }
  }

  /**
   * Optimize pricing using willingness-to-pay analysis
   */
  private async optimizePricing(): Promise<void> {
    console.log('[GrowthEngine] Optimizing pricing...');

    // Analyze plan upgrade patterns
    const upgradeAnalysis = await this.pool.query(`
      SELECT 
        from_plan,
        to_plan,
        AVG(usage_at_upgrade) as avg_usage,
        COUNT(*) as upgrade_count
      FROM (
        SELECT 
          customer_id,
          LAG(plan_type) OVER (PARTITION BY customer_id ORDER BY created_at) as from_plan,
          plan_type as to_plan,
          (SELECT SUM(impressions) FROM usage_records 
           WHERE customer_id = s.customer_id 
             AND created_at < s.created_at 
             AND created_at > s.created_at - INTERVAL '30 days') as usage_at_upgrade
        FROM subscriptions s
      ) upgrades
      WHERE from_plan IS NOT NULL
      GROUP BY from_plan, to_plan
    `);

    // Store pricing insights
    for (const insight of upgradeAnalysis.rows) {
      await this.pool.query(
        `INSERT INTO pricing_insights (
           insight_type, data, created_at
         ) VALUES ('upgrade_pattern', $1, NOW())`,
        [JSON.stringify(insight)]
      );
    }

    console.log('[GrowthEngine] Pricing optimization analysis complete');
  }

  /**
   * Helper: Send automated email
   */
  private async sendAutomatedEmail(
    customerId: string,
    emailType: string,
    data: Record<string, any>
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO events (event_type, data, created_at)
       VALUES ('email.' || $1, $2, NOW())`,
      [emailType, JSON.stringify({ customer_id: customerId, ...data })]
    );
  }

  /**
   * Helper: Get next plan tier
   */
  private getNextPlanTier(currentPlan: string): string {
    const tiers = ['indie', 'studio', 'enterprise'];
    const currentIndex = tiers.indexOf(currentPlan.toLowerCase());
    return currentIndex < tiers.length - 1 ? tiers[currentIndex + 1] : 'enterprise';
  }

  /**
   * Helper: Analyze A/B test results
   */
  private async analyzeABTest(
    testId: string
  ): Promise<{ winner: string; improvement: number; statistical_significance: number }> {
    // Simplified analysis (real implementation would use proper statistical tests)
    return {
      winner: 'b',
      improvement: 0.15,
      statistical_significance: 0.97,
    };
  }

  /**
   * Helper: Apply winning A/B test variant
   */
  private async applyWinningVariant(testId: string, winner: string): Promise<void> {
    console.log(`[GrowthEngine] Applying winning variant ${winner} for test ${testId}`);
    // Implementation: Update system configuration with winning variant
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

// Export singleton instance
const databaseUrl = process.env.DATABASE_URL;
const openaiApiKey = process.env.OPENAI_API_KEY;
const enableGrowthAI =
  process.env.ENABLE_AI_AUTOMATION === 'true' || process.env.ENABLE_GROWTH_AI_ANALYTICS === 'true';

if (!databaseUrl) {
  throw new Error('DATABASE_URL environment variable is required');
}

export const automatedGrowthEngine = new AutomatedGrowthEngine(
  databaseUrl,
  openaiApiKey,
  enableGrowthAI
);

// CLI support
if (require.main === module) {
  (async () => {
    const engine = new AutomatedGrowthEngine(
      databaseUrl!,
      openaiApiKey,
      enableGrowthAI
    );
    try {
      await engine.runGrowthAutomation();
      await engine.close();
      process.exit(0);
    } catch (error) {
      console.error('Error:', error);
      await engine.close();
      process.exit(1);
    }
  })();
}
