// services/sales/InfluenceBasedSalesService.ts
// Automated sales using Cialdini's 6 Principles of Influence
// Zero-touch conversion optimization

import { Pool } from 'pg';
import OpenAI from 'openai';

interface SalesCampaign {
  id: string;
  name: string;
  campaign_type: string;
  target_segment: any;
  conversion_goal: string;
}

interface JourneyStage {
  id: string;
  customer_id: string;
  current_stage: string;
  days_in_stage: number;
  engagement_score: number;
  conversion_probability: number;
  milestone_count: number;
}

interface Touchpoint {
  id: string;
  sequence_number: number;
  trigger_condition: string;
  channel: string;
  subject_line: string;
  content_text: string;
  cta_text: string;
  primary_principle: string;
  personalization_tokens: any;
}

interface ConversionResult {
  conversions: number;
  revenue_impact: number;
  conversion_rate: number;
}

export class InfluenceBasedSalesService {
  private pool: Pool;
  private openai: OpenAI | null = null;
  private enableAIOptimization: boolean;

  constructor(databaseUrl: string, openaiApiKey?: string, enableAIOptimization = false) {
    this.pool = new Pool({ connectionString: databaseUrl });
    this.enableAIOptimization = Boolean(enableAIOptimization && openaiApiKey);
    if (this.enableAIOptimization && openaiApiKey) {
      this.openai = new OpenAI({ apiKey: openaiApiKey });
    } else if (enableAIOptimization && !openaiApiKey) {
      console.warn('[Sales] AI optimisation requested but OPENAI_API_KEY is missing; skipping AI step');
      this.enableAIOptimization = false;
    }
  }

  /**
   * CORE: Run daily sales automation
   * Processes all active customers, sends touchpoints, advances journey stages
   */
  async runSalesAutomation(): Promise<void> {
    console.log('[Sales] Starting automated sales cycle...');

    try {
      // 1. Process trial customers (Day 0-14)
      await this.processTrialNurtureCampaign();

      // 2. Send daily touchpoints based on customer stage
      await this.sendScheduledTouchpoints();

      // 3. Update journey stages based on behavior
      await this.advanceJourneyStages();

      // 4. Trigger scarcity messages for ending trials
      await this.triggerTrialEndingUrgency();

      // 5. Process conversion events
      await this.trackAndAttributeConversions();

      // 6. Optimize campaigns with A/B test results
      await this.optimizeCampaignsWithAI();

      console.log('[Sales] Sales automation cycle complete');
    } catch (error) {
      console.error('[Sales] Error in sales automation:', error);
      throw error;
    }
  }

  /**
   * PRINCIPLE 1: RECIPROCITY
   * Give valuable gifts to customers BEFORE asking for payment
   */
  private async processTrialNurtureCampaign(): Promise<void> {
    console.log('[Sales] Processing trial nurture campaign...');

    // Get all trial customers by signup date
    const trialCustomers = await this.pool.query(`
      SELECT 
        p.id,
        contact.email,
        p.company_name,
        EXTRACT(DAY FROM NOW() - p.created_at)::INTEGER as days_since_signup,
        cjs.current_stage,
        cjs.engagement_score,
        cjs.conversion_probability
      FROM publishers p
      JOIN LATERAL (
        SELECT u.id, u.email
        FROM users u
        WHERE u.publisher_id = p.id
        ORDER BY u.created_at ASC
        LIMIT 1
      ) contact ON true
      JOIN subscriptions s ON s.customer_id = contact.id
      LEFT JOIN customer_journey_stages cjs ON cjs.customer_id = p.id
      WHERE s.status = 'trial'
        AND s.created_at > NOW() - INTERVAL '14 days'
      ORDER BY p.created_at DESC
    `);

    for (const customer of trialCustomers.rows) {
      const daysSinceSignup = customer.days_since_signup;

      // Day 0: Welcome + Immediate Value (Reciprocity)
      if (daysSinceSignup === 0) {
        await this.sendWelcomeGift(customer.id);
      }

      // Day 1: Custom Analysis Report (Reciprocity + Authority)
      if (daysSinceSignup === 1) {
        await this.sendCustomBenchmarkReport(customer.id);
      }

      // Day 3: Surprise Bonus (Reciprocity)
      if (daysSinceSignup === 3) {
        await this.unlockSurpriseBonus(customer.id);
      }

      // Day 6: Premium Feature Preview (Reciprocity + Commitment)
      if (daysSinceSignup === 6) {
        await this.unlockPremiumFeatures(customer.id);
      }

      // Day 8: Case Study (Social Proof)
      if (daysSinceSignup === 8) {
        await this.sendRelevantCaseStudy(customer.id);
      }

      // Day 11: Trial Ending Warning (Scarcity)
      if (daysSinceSignup === 11) {
        await this.sendTrialEndingWarning(customer.id, 3);
      }

      // Day 13: Final Day Urgency (Scarcity + All Principles)
      if (daysSinceSignup === 13) {
        await this.sendFinalDayConversionPush(customer.id);
      }
    }

    console.log(`[Sales] Processed ${trialCustomers.rows.length} trial customers`);
  }

  /**
   * Day 0: Welcome with immediate value gift
   */
  private async sendWelcomeGift(customerId: string): Promise<void> {
    // Record reciprocity gift
    await this.pool.query(`
      INSERT INTO reciprocity_gifts (
        customer_id,
        gift_type,
        gift_value_usd,
        description,
        delivered_at
      ) VALUES ($1, $2, $3, $4, NOW())
    `, [
      customerId,
      'free_optimization',
      500,
      'Free waterfall optimization + custom roadmap'
    ]);

    // Send touchpoint
    await this.sendTouchpoint({
      customerId,
      channel: 'email',
      subject: '🎁 Your Custom Ad Monetization Roadmap',
      principle: 'reciprocity',
      template: 'welcome_gift',
      triggerCondition: 'day_0'
    });

    console.log(`[Sales] Sent welcome gift to customer ${customerId}`);
  }

  /**
   * Day 1: Send personalized benchmark report (Authority + Reciprocity)
   */
  private async sendCustomBenchmarkReport(customerId: string): Promise<void> {
    // Get publisher profile, primary app, and segment (if any)
    const customerProfile = await this.pool.query(`
      SELECT 
        p.company_name,
        app_info.app_name,
        cs.app_category
      FROM publishers p
      LEFT JOIN LATERAL (
        SELECT a.name as app_name
        FROM apps a
        WHERE a.publisher_id = p.id
        ORDER BY a.created_at ASC
        LIMIT 1
      ) app_info ON true
      LEFT JOIN customer_segments cs ON cs.customer_id = p.id
      WHERE p.id = $1
      LIMIT 1
    `, [customerId]);

    if (customerProfile.rows.length === 0) return;

    const customer = customerProfile.rows[0];

    // Aggregate usage for the last 30 days
    const usageResult = await this.pool.query(`
      SELECT COALESCE(SUM(ur.quantity), 0) as total_impressions
      FROM users u
      JOIN usage_records ur ON ur.customer_id = u.id
      WHERE u.publisher_id = $1
        AND ur.metric_type = 'impressions'
        AND ur.recorded_at > NOW() - INTERVAL '30 days'
    `, [customerId]);

    // Average revenue for the same period
    const revenueResult = await this.pool.query(`
      SELECT COALESCE(AVG(revenue), 0) as avg_revenue
      FROM revenue_events
      WHERE publisher_id = $1
        AND event_date >= CURRENT_DATE - INTERVAL '30 days'
    `, [customerId]);

    // Global benchmarks (fallback when segment-specific data is unavailable)
    const benchmarks = await this.pool.query(`
      SELECT 
        AVG(revenue) as category_avg_revenue,
        PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY revenue) as top_10_percent_revenue
      FROM revenue_events
      WHERE event_date >= CURRENT_DATE - INTERVAL '30 days'
    `);

    const usageStats = usageResult.rows[0] || { total_impressions: 0 };
    const revenueStats = revenueResult.rows[0] || { avg_revenue: 0 };
    const categoryAverage = Number(benchmarks.rows[0]?.category_avg_revenue) || 0;
    const topPerformers = Number(benchmarks.rows[0]?.top_10_percent_revenue) || 0;
    const customerRevenue = Number(revenueStats.avg_revenue) || 0;

    // Create personalized report
    const report = {
      app_name: customer.app_name,
      category: customer.app_category || 'general',
      total_impressions: Number(usageStats.total_impressions) || 0,
      your_revenue: customerRevenue,
      category_average: categoryAverage,
      top_performers: topPerformers,
      gap_to_average: categoryAverage - customerRevenue,
      recommendations: [
        'Optimize waterfall with our AI engine',
        'Enable real-time bidding',
        'Try advanced targeting features'
      ]
    };

    // Record gift
    await this.pool.query(`
      INSERT INTO reciprocity_gifts (
        customer_id,
        gift_type,
        gift_value_usd,
        description,
        delivered_at
      ) VALUES ($1, $2, $3, $4, NOW())
    `, [
      customerId,
      'report',
      500,
      `Custom benchmark report: ${customer.app_name} vs. ${customer.category} category`
    ]);

    // Record authority signal
    await this.pool.query(`
      INSERT INTO authority_signals (
        customer_id,
        signal_type,
        signal_content,
        credibility_score,
        shown_at
      ) VALUES ($1, $2, $3, $4, NOW())
    `, [
      customerId,
      'data_citation',
      JSON.stringify(report),
      95 // High credibility - real data from our platform
    ]);

    // Send email
    await this.sendTouchpoint({
      customerId,
      channel: 'email',
      subject: `📊 Your Custom Report: ${customer.app_name} Benchmark Analysis`,
      principle: 'authority',
      template: 'benchmark_report',
      personalizationData: report,
      triggerCondition: 'day_1'
    });

    console.log(`[Sales] Sent benchmark report to customer ${customerId}`);
  }

  /**
   * Day 3: Unlock surprise bonus (Reciprocity)
   */
  private async unlockSurpriseBonus(customerId: string): Promise<void> {
    // Analyze their first impressions to find specific opportunity
    const performance = await this.pool.query(`
      SELECT 
        COALESCE(SUM(re.impressions), 0) as total_impressions,
        COALESCE(SUM(re.revenue), 0) as total_revenue
      FROM revenue_events re
      WHERE re.publisher_id = $1
        AND re.event_date >= CURRENT_DATE - INTERVAL '3 days'
    `, [customerId]);

    const data = performance.rows[0];
    const totalImpressions = Number(data?.total_impressions) || 0;
    const totalRevenue = Number(data?.total_revenue) || 0;
    const avgEcpm = totalImpressions === 0 ? 0 : (totalRevenue / totalImpressions) * 1000;
    const potentialRevenue = totalRevenue * 0.1; // assume a 10% uplift opportunity

    // Record gift
    await this.pool.query(`
      INSERT INTO reciprocity_gifts (
        customer_id,
        gift_type,
        gift_value_usd,
        description,
        delivered_at
      ) VALUES ($1, $2, $3, $4, NOW())
    `, [
      customerId,
      'free_optimization',
      potentialRevenue,
      `Waterfall optimization unlocked - potential $${potentialRevenue.toFixed(2)} additional revenue`
    ]);

    // Send touchpoint
    await this.sendTouchpoint({
      customerId,
      channel: 'email',
      subject: `🎁 Surprise! We found $${potentialRevenue.toFixed(2)} in missed revenue`,
      principle: 'reciprocity',
      template: 'surprise_bonus',
      personalizationData: {
        total_impressions: totalImpressions,
        avg_ecpm: avgEcpm.toFixed(2),
        potential_revenue: potentialRevenue.toFixed(2)
      },
      triggerCondition: 'day_3'
    });

    console.log(`[Sales] Sent surprise bonus to customer ${customerId}`);
  }

  /**
   * Day 6: Unlock premium features for trial (Reciprocity + Commitment)
   */
  private async unlockPremiumFeatures(customerId: string): Promise<void> {
    // Unlock premium features temporarily
    await this.pool.query(`
      INSERT INTO reciprocity_gifts (
        customer_id,
        gift_type,
        gift_value_usd,
        description,
        expires_at,
        delivered_at
      ) VALUES ($1, $2, $3, $4, NOW() + INTERVAL '8 days', NOW())
    `, [
      customerId,
      'bonus_features',
      200,
      'Premium features unlocked: Advanced Analytics, Real-time Optimization, Priority Support'
    ]);

    // Send notification
    await this.sendTouchpoint({
      customerId,
      channel: 'email',
      subject: '🎁 Premium Features Unlocked (Free for 8 days)',
      principle: 'reciprocity',
      template: 'premium_unlock',
      triggerCondition: 'day_6'
    });

    console.log(`[Sales] Unlocked premium features for customer ${customerId}`);
  }

  /**
   * PRINCIPLE 2: COMMITMENT & CONSISTENCY
   * Track and celebrate customer micro-commitments
   */
  private async trackCommitmentMilestone(
    customerId: string,
    milestoneType: string,
    milestoneName: string,
    effortLevel: string,
    timeInvestedMinutes: number
  ): Promise<void> {
    // Get current commitment count
    const currentCount = await this.pool.query(`
      SELECT COUNT(*) as count
      FROM commitment_milestones
      WHERE customer_id = $1
    `, [customerId]);

    const commitmentCount = parseInt(currentCount.rows[0].count) + 1;

    // Calculate probability before
    const probabilityBefore = await this.pool.query(`
      SELECT predict_conversion_probability($1) as probability
    `, [customerId]);

    // Record milestone
    await this.pool.query(`
      INSERT INTO commitment_milestones (
        customer_id,
        milestone_type,
        milestone_name,
        effort_level,
        time_invested_minutes,
        total_commitments,
        completed_at
      ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
    `, [
      customerId,
      milestoneType,
      milestoneName,
      effortLevel,
      timeInvestedMinutes,
      commitmentCount
    ]);

    // Calculate probability after
    const probabilityAfter = await this.pool.query(`
      SELECT predict_conversion_probability($1) as probability
    `, [customerId]);

    // Update the milestone with probability changes
    await this.pool.query(`
      UPDATE commitment_milestones
      SET 
        conversion_probability_before = $1,
        conversion_probability_after = $2
      WHERE customer_id = $3
        AND milestone_type = $4
        AND completed_at > NOW() - INTERVAL '1 minute'
    `, [
      probabilityBefore.rows[0].probability,
      probabilityAfter.rows[0].probability,
      customerId,
      milestoneType
    ]);

    // Celebrate milestones (every 3rd commitment)
    if (commitmentCount % 3 === 0) {
      await this.sendMilestoneCelebration(customerId, commitmentCount);
    }

    console.log(`[Sales] Tracked commitment: ${milestoneType} for customer ${customerId}`);
  }

  /**
   * Celebrate customer milestones (reinforces commitment)
   */
  private async sendMilestoneCelebration(customerId: string, milestoneCount: number): Promise<void> {
    await this.sendTouchpoint({
      customerId,
      channel: 'in_app',
      subject: `🎉 Milestone Achieved: ${milestoneCount} steps completed!`,
      principle: 'commitment',
      template: 'milestone_celebration',
      personalizationData: { milestone_count: milestoneCount },
      triggerCondition: 'milestone_reached'
    });
  }

  /**
   * PRINCIPLE 3: SOCIAL PROOF
   * Show relevant success stories from similar customers
   */
  private async sendRelevantCaseStudy(customerId: string): Promise<void> {
    // Get customer segment
    const segment = await this.pool.query(`
      SELECT app_category, company_size, geography
      FROM customer_segments
      WHERE customer_id = $1
    `, [customerId]);

    if (segment.rows.length === 0) return;

    const customerSegment = segment.rows[0];

    // Find most similar success story
    const similarCase = await this.pool.query(`
      SELECT 
        sc.customer_id,
        p.company_name,
        sc.mrr_before,
        sc.mrr_after,
        sc.mrr_increase,
        EXTRACT(DAY FROM sc.converted_at - p.created_at) as days_to_convert,
        cs.app_category
      FROM sales_conversions sc
      JOIN publishers p ON p.id = sc.customer_id
      JOIN customer_segments cs ON cs.customer_id = sc.customer_id
      WHERE cs.app_category = $1
        AND sc.conversion_type = 'trial_to_paid'
        AND sc.converted_at > NOW() - INTERVAL '90 days'
      ORDER BY sc.mrr_increase DESC
      LIMIT 1
    `, [customerSegment.app_category]);

    if (similarCase.rows.length === 0) return;

    const caseStudy = similarCase.rows[0];

    // Calculate similarity score
    const similarityScore = 85; // High similarity - same category

    // Record social proof event
    await this.pool.query(`
      INSERT INTO social_proof_events (
        customer_id,
        proof_type,
        proof_content,
        similarity_score,
        specificity_level,
        shown_at
      ) VALUES ($1, $2, $3, $4, $5, NOW())
    `, [
      customerId,
      'case_study',
      JSON.stringify(caseStudy),
      similarityScore,
      'highly_specific'
    ]);

    // Send case study
    await this.sendTouchpoint({
      customerId,
      channel: 'email',
      subject: `📈 How ${caseStudy.company_name} increased revenue ${caseStudy.mrr_increase}% in ${caseStudy.days_to_convert} days`,
      principle: 'social_proof',
      template: 'case_study',
      personalizationData: {
        company_name: caseStudy.company_name,
        category: caseStudy.app_category,
        revenue_increase: caseStudy.mrr_increase,
        days_to_convert: caseStudy.days_to_convert,
        mrr_before: caseStudy.mrr_before,
        mrr_after: caseStudy.mrr_after
      },
      triggerCondition: 'day_8'
    });

    console.log(`[Sales] Sent case study to customer ${customerId}`);
  }

  /**
   * PRINCIPLE 6: SCARCITY
   * Create urgency with trial ending countdown
   */
  private async sendTrialEndingWarning(customerId: string, daysRemaining: number): Promise<void> {
    // Get features customer is actively using
    const activeFeatures = await this.pool.query(`
      SELECT 
        ur.metric_type as feature_used,
        SUM(ur.quantity) as usage_count
      FROM users u
      JOIN usage_records ur ON ur.customer_id = u.id
      WHERE u.publisher_id = $1
        AND ur.recorded_at > NOW() - INTERVAL '7 days'
      GROUP BY ur.metric_type
      ORDER BY usage_count DESC
      LIMIT 3
    `, [customerId]);

    // Calculate value delivered by premium features
    const valueDelivered = await this.pool.query(`
      SELECT COALESCE(SUM(revenue), 0) as total_revenue
      FROM revenue_events
      WHERE publisher_id = $1
        AND event_date >= CURRENT_DATE - INTERVAL '7 days'
    `, [customerId]);

    const totalDelivered = Number(valueDelivered.rows[0]?.total_revenue) || 0;
    const scarcityMessage = `${daysRemaining} days left of premium features`;

    // Record scarcity trigger
    await this.pool.query(`
      INSERT INTO scarcity_triggers (
        customer_id,
        trigger_type,
        scarcity_message,
        genuine,
        urgency_level,
        countdown_timer,
        activated_at,
        expires_at
      ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW() + $7 * INTERVAL '1 day')
    `, [
      customerId,
      'trial_ending',
      scarcityMessage,
      true, // This is genuine scarcity
      daysRemaining <= 1 ? 'critical' : 'high',
      true,
      daysRemaining
    ]);

    // Send warning email
    await this.sendTouchpoint({
      customerId,
      channel: 'email',
      subject: `⚠️ ${daysRemaining} days left: Keep your premium features`,
      principle: 'scarcity',
      template: 'trial_ending_warning',
      personalizationData: {
        days_remaining: daysRemaining,
        active_features: activeFeatures.rows,
        value_delivered: totalDelivered
      },
      triggerCondition: `day_${14 - daysRemaining}`
    });

    console.log(`[Sales] Sent trial ending warning (${daysRemaining} days) to customer ${customerId}`);
  }

  /**
   * Day 13: Final conversion push using ALL 6 principles
   */
  private async sendFinalDayConversionPush(customerId: string): Promise<void> {
    // Gather all data for comprehensive email
    const customerData = await this.pool.query(`
      SELECT 
        p.company_name,
        COUNT(DISTINCT cm.id) as milestones_completed,
        COUNT(DISTINCT rg.id) as gifts_received,
        COALESCE(SUM(re.revenue), 0) as total_revenue_generated,
        calculate_engagement_score(p.id) as engagement_score,
        predict_conversion_probability(p.id) as conversion_probability
      FROM publishers p
      LEFT JOIN commitment_milestones cm ON cm.customer_id = p.id
      LEFT JOIN reciprocity_gifts rg ON rg.customer_id = p.id
      LEFT JOIN revenue_events re ON re.publisher_id = p.id
      WHERE p.id = $1
      GROUP BY p.id, p.company_name
    `, [customerId]);

    if (customerData.rows.length === 0) {
      console.log(`[Sales] No customer data found for final day push (publisher ${customerId})`);
      return;
    }

    const data = {
      ...customerData.rows[0],
      total_revenue_generated: Number(customerData.rows[0].total_revenue_generated) || 0,
      engagement_score: Number(customerData.rows[0].engagement_score) || 0,
      conversion_probability: Number(customerData.rows[0].conversion_probability) || 0
    };

    // Record scarcity trigger (last day)
    await this.pool.query(`
      INSERT INTO scarcity_triggers (
        customer_id,
        trigger_type,
        scarcity_message,
        genuine,
        urgency_level,
        countdown_timer,
        visual_emphasis,
        activated_at,
        expires_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW() + INTERVAL '24 hours')
    `, [
      customerId,
      'trial_ending',
      'Last day to upgrade and keep premium features',
      true,
      'critical',
      true,
      true
    ]);

    // Send final push email (uses all 6 principles)
    await this.sendTouchpoint({
      customerId,
      channel: 'email',
      subject: `🔥 Final Day: Don't lose your progress (${data.milestones_completed} milestones completed)`,
      principle: 'all_six',
      template: 'final_day_conversion',
      personalizationData: {
        company_name: data.company_name,
        milestones_completed: data.milestones_completed, // Commitment
        gifts_received: data.gifts_received, // Reciprocity
        revenue_generated: data.total_revenue_generated, // Social Proof (personal)
        engagement_score: data.engagement_score, // Authority (our analysis)
        hours_remaining: 24 // Scarcity
      },
      triggerCondition: 'day_13'
    });

    // Also send in-app takeover
    await this.sendTouchpoint({
      customerId,
      channel: 'in_app',
      subject: '⏰ Last Chance: Upgrade Today',
      principle: 'scarcity',
      template: 'full_screen_upgrade',
      personalizationData: data,
      triggerCondition: 'day_13'
    });

    console.log(`[Sales] Sent final day conversion push to customer ${customerId}`);
  }

  /**
   * Send scheduled touchpoints (daily job)
   */
  private async sendScheduledTouchpoints(): Promise<void> {
    // Get all touchpoints that should be sent today
    const dueTouchpoints = await this.pool.query(`
      SELECT 
        st.id,
        st.campaign_id,
        st.channel,
        st.subject_line,
        st.content_text,
        st.cta_text,
        st.primary_principle,
        st.personalization_tokens,
        cjs.customer_id
      FROM sales_touchpoints st
      JOIN customer_journey_stages cjs ON cjs.campaign_id = st.campaign_id
      WHERE st.active = true
        AND cjs.next_touchpoint_at <= NOW()
        AND NOT EXISTS (
          SELECT 1 FROM touchpoint_deliveries td
          WHERE td.touchpoint_id = st.id
            AND td.customer_id = cjs.customer_id
            AND td.delivered_at > NOW() - INTERVAL '24 hours'
        )
      LIMIT 100
    `);

    for (const touchpoint of dueTouchpoints.rows) {
      await this.deliverTouchpoint(touchpoint);
    }

    console.log(`[Sales] Sent ${dueTouchpoints.rows.length} scheduled touchpoints`);
  }

  /**
   * Deliver a touchpoint to a customer
   */
  private async deliverTouchpoint(touchpoint: any): Promise<void> {
    // Log delivery
    await this.pool.query(`
      INSERT INTO touchpoint_deliveries (
        touchpoint_id,
        customer_id,
        campaign_id,
        channel,
        subject_line,
        personalized_content,
        delivered_at,
        status
      ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), 'sent')
      RETURNING id
    `, [
      touchpoint.id,
      touchpoint.customer_id,
      touchpoint.campaign_id,
      touchpoint.channel,
      touchpoint.subject_line,
      touchpoint.personalization_tokens
    ]);

    // Queue notification for async delivery via email service
    try {
      const redis = await import('../../src/utils/redis');
      await (redis.default as any).lPush('email:notifications', JSON.stringify({
        type: 'sales_touchpoint',
        touchpointId: touchpoint.id,
        customerId: touchpoint.customer_id,
        channel: touchpoint.channel,
        subject: touchpoint.subject_line,
        tokens: touchpoint.personalization_tokens
      }));
      console.log(`[Sales] Queued touchpoint ${touchpoint.id} for customer ${touchpoint.customer_id}`);
    } catch (error) {
      console.error(`[Sales] Failed to queue touchpoint:`, error);
    }
  }

  /**
   * Generic touchpoint sender (internal helper)
   */
  private async sendTouchpoint(params: {
    customerId: string;
    channel: string;
    subject: string;
    principle: string;
    template: string;
    personalizationData?: any;
    triggerCondition: string;
  }): Promise<void> {
    // In production, this would integrate with email service (SendGrid, Postmark, etc.)
    console.log(`[Sales] Sending ${params.channel} touchpoint: ${params.subject}`);

    // Log to database
    await this.pool.query(`
      INSERT INTO touchpoint_deliveries (
        customer_id,
        channel,
        subject_line,
        personalized_content,
        delivered_at,
        status
      ) VALUES ($1, $2, $3, $4, NOW(), 'sent')
    `, [
      params.customerId,
      params.channel,
      params.subject,
      JSON.stringify(params.personalizationData || {})
    ]);
  }

  /**
   * Advance customer journey stages based on behavior
   */
  private async advanceJourneyStages(): Promise<void> {
    // Customers who should move from 'signup' to 'activation' (SDK integrated)
    await this.pool.query(`
      UPDATE customer_journey_stages cjs
      SET 
        current_stage = 'activation',
        previous_stage = current_stage,
        stage_entered_at = NOW(),
        days_in_stage = 0,
        updated_at = NOW()
      WHERE current_stage = 'signup'
        AND EXISTS (
          SELECT 1 FROM commitment_milestones cm
          WHERE cm.customer_id = cjs.customer_id
            AND cm.milestone_type = 'sdk_integration'
        )
    `);

    // Move from 'activation' to 'engagement' (using features regularly)
    await this.pool.query(`
      UPDATE customer_journey_stages cjs
      SET 
        current_stage = 'engagement',
        previous_stage = current_stage,
        stage_entered_at = NOW(),
        days_in_stage = 0,
        updated_at = NOW()
      WHERE current_stage = 'activation'
        AND engagement_score > 50
        AND milestone_count >= 2
    `);

    // Move from 'engagement' to 'evaluation' (Day 7+)
    await this.pool.query(`
      UPDATE customer_journey_stages cjs
      SET 
        current_stage = 'evaluation',
        previous_stage = current_stage,
        stage_entered_at = NOW(),
        days_in_stage = 0,
        updated_at = NOW()
      WHERE current_stage = 'engagement'
        AND EXTRACT(DAY FROM NOW() - stage_entered_at) >= 7
    `);

    console.log('[Sales] Advanced journey stages for eligible customers');
  }

  /**
   * Trigger urgency for trials ending in 3, 1, and 0 days
   */
  private async triggerTrialEndingUrgency(): Promise<void> {
    const urgencyDays = [3, 1];

    for (const daysRemaining of urgencyDays) {
      const endingTrials = await this.pool.query(`
        SELECT DISTINCT ON (p.id)
          p.id,
          contact.email,
          p.company_name,
          trial_info.days_remaining
        FROM publishers p
        JOIN LATERAL (
          SELECT u.id, u.email, u.created_at
          FROM users u
          WHERE u.publisher_id = p.id
          ORDER BY u.created_at ASC
          LIMIT 1
        ) contact ON true
        JOIN LATERAL (
          SELECT 
            COALESCE(s.trial_end_date, (p.created_at + INTERVAL '14 days')::date) as trial_end_date,
            COALESCE(s.trial_end_date, (p.created_at + INTERVAL '14 days')::date) - CURRENT_DATE as days_remaining
          FROM subscriptions s
          WHERE s.customer_id = contact.id
            AND s.status = 'trial'
          ORDER BY s.updated_at DESC
          LIMIT 1
        ) trial_info ON true
        WHERE trial_info.days_remaining <= $1
          AND trial_info.days_remaining > $2
          AND NOT EXISTS (
            SELECT 1 FROM scarcity_triggers st
            WHERE st.customer_id = p.id
              AND st.trigger_type = 'trial_ending'
              AND st.activated_at > NOW() - INTERVAL '1 day'
          )
        ORDER BY p.id, trial_info.trial_end_date DESC
      `, [daysRemaining, daysRemaining - 1]);

      for (const customer of endingTrials.rows) {
        await this.sendTrialEndingWarning(customer.id, daysRemaining);
      }

      console.log(`[Sales] Sent ${daysRemaining}-day warnings to ${endingTrials.rows.length} customers`);
    }
  }

  /**
   * Track conversions and attribute to principles/touchpoints
   */
  private async trackAndAttributeConversions(): Promise<void> {
    // Find recent conversions (upgraded in last 24 hours)
    const recentConversions = await this.pool.query(`
      WITH latest_subscriptions AS (
        SELECT DISTINCT ON (p.id)
          p.id AS publisher_id,
          s.base_price_cents,
          s.billing_interval,
          s.created_at,
          s.updated_at
        FROM publishers p
        JOIN users u ON u.publisher_id = p.id
        JOIN subscriptions s ON s.customer_id = u.id
        WHERE s.status = 'active'
        ORDER BY p.id, s.updated_at DESC
      )
      SELECT 
        ls.publisher_id as customer_id,
        CASE
          WHEN ls.billing_interval = 'annual' THEN ROUND(ls.base_price_cents::numeric / 1200, 2)
          ELSE ROUND(ls.base_price_cents::numeric / 100, 2)
        END as mrr_after,
        0 as mrr_before,
        EXTRACT(DAY FROM NOW() - p.created_at) as days_in_trial,
        (SELECT COUNT(DISTINCT td.id) FROM touchpoint_deliveries td WHERE td.customer_id = p.id AND td.delivered_at > NOW() - INTERVAL '30 days') as touchpoints_received,
        (SELECT COUNT(DISTINCT cm.id) FROM commitment_milestones cm WHERE cm.customer_id = p.id) as milestones_completed,
        (SELECT COUNT(DISTINCT rg.id) FROM reciprocity_gifts rg WHERE rg.customer_id = p.id) as gifts_received
      FROM latest_subscriptions ls
      JOIN publishers p ON p.id = ls.publisher_id
      WHERE ls.updated_at > NOW() - INTERVAL '24 hours'
    `);

    for (const conversion of recentConversions.rows) {
      // Determine primary influence principle
      const principleAttribution = await this.attributeToPrinciple(conversion.customer_id);

      // Record conversion
      await this.pool.query(`
        INSERT INTO sales_conversions (
          customer_id,
          conversion_type,
          mrr_before,
          mrr_after,
          mrr_increase,
          days_in_trial,
          touchpoints_received,
          milestones_completed,
          gifts_received,
          primary_influence_principle,
          principle_scores,
          converted_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
      `, [
        conversion.customer_id,
        'trial_to_paid',
        conversion.mrr_before,
        conversion.mrr_after,
        conversion.mrr_after - conversion.mrr_before,
        conversion.days_in_trial,
        conversion.touchpoints_received,
        conversion.milestones_completed,
        conversion.gifts_received,
        principleAttribution.primary,
        JSON.stringify(principleAttribution.scores)
      ]);

      console.log(`[Sales] Tracked conversion for customer ${conversion.customer_id}`);
    }
  }

  /**
   * Attribute conversion to specific principles
   */
  private async attributeToPrinciple(customerId: string): Promise<any> {
    // Count interactions by principle
    const principleUsage = await this.pool.query(`
      SELECT 
        st.primary_principle,
        COUNT(*) as usage_count,
        COUNT(CASE WHEN td.status IN ('clicked', 'converted') THEN 1 END) as engagement_count
      FROM touchpoint_deliveries td
      JOIN sales_touchpoints st ON st.id = td.touchpoint_id
      WHERE td.customer_id = $1
      GROUP BY st.primary_principle
    `, [customerId]);

    // Calculate scores for each principle (0-1)
    const scores: any = {
      reciprocity: 0,
      commitment: 0,
      social_proof: 0,
      authority: 0,
      liking: 0,
      scarcity: 0
    };

    let maxScore = 0;
    let primaryPrinciple = 'commitment'; // Default

    for (const row of principleUsage.rows) {
      const engagementRate = row.engagement_count / row.usage_count;
      const score = engagementRate;
      scores[row.primary_principle] = score;

      if (score > maxScore) {
        maxScore = score;
        primaryPrinciple = row.primary_principle;
      }
    }

    return {
      primary: primaryPrinciple,
      scores: scores
    };
  }

  /**
   * Use AI to optimize campaigns based on results
   */
  private async optimizeCampaignsWithAI(): Promise<void> {
    if (!this.enableAIOptimization || !this.openai) {
      console.log('[Sales] AI optimisation disabled for this environment; skipping');
      return;
    }

    // Get campaign performance data
    const performance = await this.pool.query(`
      SELECT * FROM sales_campaign_performance
      ORDER BY conversion_rate DESC
    `);

    // Get principle effectiveness
    const principleData = await this.pool.query(`
      SELECT * FROM principle_effectiveness
      ORDER BY conversion_rate DESC
    `);

    const prompt = `
Analyze this sales campaign performance data and suggest optimizations:

Campaign Performance:
${JSON.stringify(performance.rows, null, 2)}

Principle Effectiveness:
${JSON.stringify(principleData.rows, null, 2)}

Provide specific, actionable recommendations to improve conversion rates:
1. Which principles should we emphasize more?
2. What timing adjustments would help?
3. Which touchpoint sequences should be modified?
4. Any A/B tests we should run?

Return JSON: {recommendations: [{principle, action, expected_impact, priority}]}
`;

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' }
      });

      const recommendations = JSON.parse(response.choices[0].message.content || '{}');
      
      // Log recommendations for human review
      console.log('[Sales] AI Optimization Recommendations:', recommendations);

      // Auto-apply high-confidence recommendations (>90% confidence)
      if (recommendations.confidence && recommendations.confidence > 0.90) {
        try {
          for (const rec of (recommendations.actions || [])) {
            if (rec.auto_apply && rec.confidence > 0.90) {
              await this.applyAIRecommendation(rec);
              console.log(`[Sales] Auto-applied AI recommendation: ${rec.action}`);
            }
          }
        } catch (applyError) {
          console.error('[Sales] Failed to auto-apply recommendation:', applyError);
        }
      }
      
    } catch (error) {
      console.error('[Sales] AI optimization failed:', error);
    }
  }

  /**
   * Apply AI recommendation automatically
   */
  private async applyAIRecommendation(recommendation: any): Promise<void> {
    const { action, params } = recommendation;
    
    switch (action) {
      case 'adjust_send_time':
        await this.pool.query(
          `UPDATE sales_campaigns SET optimal_send_time = $1 WHERE id = $2`,
          [params.time, params.campaignId]
        );
        break;
      case 'update_subject_line':
        await this.pool.query(
          `UPDATE sales_campaigns SET subject_line = $1 WHERE id = $2`,
          [params.subject, params.campaignId]
        );
        break;
      case 'adjust_frequency':
        await this.pool.query(
          `UPDATE sales_campaigns SET send_frequency_days = $1 WHERE id = $2`,
          [params.frequency, params.campaignId]
        );
        break;
      default:
        console.warn(`[Sales] Unknown AI recommendation action: ${action}`);
    }
  }

  /**
   * Get conversion funnel stats
   */
  async getFunnelStats(): Promise<any> {
    const stats = await this.pool.query(`SELECT * FROM sales_funnel`);
    return stats.rows;
  }

  /**
   * Get principle effectiveness
   */
  async getPrincipleEffectiveness(): Promise<any> {
    const effectiveness = await this.pool.query(`SELECT * FROM principle_effectiveness`);
    return effectiveness.rows;
  }

  /**
   * Close database connection
   */
  async close(): Promise<void> {
    await this.pool.end();
  }
}

// Export singleton instance
const databaseUrl = process.env.DATABASE_URL;
const openaiApiKey = process.env.OPENAI_API_KEY;
const enableAIOptimization =
  (process.env.ENABLE_AI_AUTOMATION === 'true' || process.env.ENABLE_SALES_AI_OPTIMIZATION === 'true');

if (!databaseUrl) {
  throw new Error('DATABASE_URL environment variable is required');
}

export const influenceBasedSalesService = new InfluenceBasedSalesService(
  databaseUrl,
  openaiApiKey,
  enableAIOptimization
);

// CLI support
if (require.main === module) {
  (async () => {
  const service = new InfluenceBasedSalesService(databaseUrl!, openaiApiKey, enableAIOptimization);
    try {
      await service.runSalesAutomation();
      await service.close();
      process.exit(0);
    } catch (error) {
      console.error('Error:', error);
      await service.close();
      process.exit(1);
    }
  })();
}
