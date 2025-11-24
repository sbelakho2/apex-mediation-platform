import { Pool } from 'pg';
import { EmailAutomationService } from '../email/EmailAutomationService';

/**
 * First Customer Experience Automation
 * 
 * Ensures Customer #1 gets enterprise-grade experience through automation:
 * - Success milestone celebrations
 * - Referral program triggers
 * - Testimonial requests
 * - Case study invitations
 * - Community engagement rewards
 * 
 * Design: Every customer feels like they're Customer #1,000
 */
export class FirstCustomerExperienceService {
  private readonly pool: Pool;
  private readonly emailService: EmailAutomationService;

  constructor(databaseUrl: string) {
    this.pool = new Pool({
      connectionString: databaseUrl,
    });
    this.emailService = new EmailAutomationService();
  }

  /**
   * Check usage milestones and celebrate achievements
   * Run hourly to detect new milestones
   */
  async checkUsageMilestones(): Promise<void> {
    console.log('📊 Checking usage milestones...');

    // Define milestones
    const milestones = [
      { threshold: 100, name: 'first_100', emoji: '💪', message: "You're on a roll! 100 impressions served" },
      { threshold: 1000, name: 'first_1k', emoji: '🚀', message: 'Milestone! 1K impressions' },
      { threshold: 10000, name: 'first_10k', emoji: '⭐', message: 'Amazing! 10K impressions - You\'re crushing it' },
      { threshold: 100000, name: 'first_100k', emoji: '🎯', message: 'Incredible! 100K impressions reached' },
      { threshold: 1000000, name: 'first_1m', emoji: '💎', message: 'LEGENDARY! 1 MILLION impressions!' },
    ];

    // Get customers who recently crossed thresholds
    for (const milestone of milestones) {
      const customers = await this.pool.query(`
        WITH usage_totals AS (
          SELECT 
            customer_id,
            SUM(CASE WHEN metric_type = 'impressions' THEN quantity ELSE 0 END) as total_impressions,
            MAX(recorded_at) as last_recorded
          FROM usage_records
          GROUP BY customer_id
        ),
        milestone_check AS (
          SELECT 
            u.customer_id,
            u.total_impressions,
            c.email,
            c.company_name,
            u.last_recorded
          FROM usage_totals u
          INNER JOIN customers c ON u.customer_id = c.id
          LEFT JOIN customer_milestones m ON c.id = m.customer_id AND m.milestone_type = $1
          WHERE u.total_impressions >= $2
            AND m.id IS NULL  -- Hasn't received this milestone yet
        )
        SELECT * FROM milestone_check
      `, [milestone.name, milestone.threshold]);

      for (const customer of customers.rows) {
        await this.celebrateMilestone(
          customer.customer_id,
          customer.email,
          customer.company_name,
          milestone.name,
          milestone.emoji,
          milestone.message,
          customer.total_impressions
        );
      }

      console.log(`✅ ${milestone.name}: ${customers.rows.length} customers celebrated`);
    }
  }

  /**
   * Celebrate a usage milestone with customer
   */
  private async celebrateMilestone(
    customerId: string,
    email: string,
    companyName: string | null,
    milestoneName: string,
    emoji: string,
    message: string,
    impressions: number
  ): Promise<void> {
    // Record milestone
    await this.pool.query(`
      INSERT INTO customer_milestones (customer_id, milestone_type, achieved_at, data)
      VALUES ($1, $2, NOW(), $3)
    `, [customerId, milestoneName, JSON.stringify({ impressions })]);

    // Create console notification
    await this.pool.query(`
      INSERT INTO notifications (customer_id, type, title, message, priority, created_at)
      VALUES ($1, $2, $3, $4, $5, NOW())
    `, [
      customerId,
      'milestone_achievement',
      `${emoji} ${message}`,
      `Congratulations! You've served ${impressions.toLocaleString()} impressions. Keep up the great work!`,
      'normal',
    ]);

    // Send celebration email
    await this.pool.query(`
      INSERT INTO events (event_type, data, created_at)
      VALUES ($1, $2, NOW())
    `, [
      'email.milestone_celebration',
      JSON.stringify({
        to: email,
        customer_id: customerId,
        company_name: companyName,
        milestone_name: milestoneName,
        emoji,
        message,
        impressions,
      }),
    ]);

    console.log(`🎉 Milestone ${milestoneName} celebrated for ${customerId}`);
  }

  /**
   * Check for high-usage customers eligible for referral program
   * Run daily to identify referral candidates
   */
  async checkReferralEligibility(): Promise<void> {
    console.log('🤝 Checking referral program eligibility...');

    const candidates = await this.pool.query(`
      WITH usage_stats AS (
        SELECT 
          customer_id,
          SUM(CASE WHEN metric_type = 'impressions' THEN quantity ELSE 0 END) as total_impressions
        FROM usage_records
        WHERE recorded_at >= NOW() - INTERVAL '30 days'
        GROUP BY customer_id
      ),
      plan_limits AS (
        SELECT 
          c.id as customer_id,
          c.email,
          c.company_name,
          s.plan_type,
          u.total_impressions,
          CASE 
            WHEN s.plan_type = 'starter' THEN 1000000
            WHEN s.plan_type = 'growth' THEN 10000000
            WHEN s.plan_type = 'scale' THEN 50000000
            ELSE 100000000
          END as plan_limit
        FROM customers c
        INNER JOIN subscriptions s ON c.id = s.customer_id
        INNER JOIN usage_stats u ON c.id = u.customer_id
        LEFT JOIN customer_milestones m ON c.id = m.customer_id AND m.milestone_type = 'referral_invite'
        WHERE s.status = 'active'
          AND u.total_impressions > (
            CASE 
              WHEN s.plan_type = 'starter' THEN 800000    -- 80% of plan
              WHEN s.plan_type = 'growth' THEN 8000000
              WHEN s.plan_type = 'scale' THEN 40000000
              ELSE 80000000
            END
          )
          AND m.id IS NULL  -- Haven't received referral invite yet
      )
      SELECT * FROM plan_limits
    `);

    for (const customer of candidates.rows) {
      await this.sendReferralInvite(
        customer.customer_id,
        customer.email,
        customer.company_name,
        customer.plan_type,
        customer.total_impressions
      );
    }

    console.log(`✅ Sent ${candidates.rows.length} referral invites`);
  }

  /**
   * Send referral program invitation
   */
  private async sendReferralInvite(
    customerId: string,
    email: string,
    companyName: string | null,
    planType: string,
    impressions: number
  ): Promise<void> {
    // Generate unique referral code
    const referralCode = `${customerId.substring(0, 8).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;

    // Store referral code
    await this.pool.query(`
      INSERT INTO referral_codes (customer_id, code, created_at, expires_at)
      VALUES ($1, $2, NOW(), NOW() + INTERVAL '1 year')
    `, [customerId, referralCode]);

    // Record milestone
    await this.pool.query(`
      INSERT INTO customer_milestones (customer_id, milestone_type, achieved_at, data)
      VALUES ($1, $2, NOW(), $3)
    `, [customerId, 'referral_invite', JSON.stringify({ referralCode })]);

    // Send referral invite email
    await this.pool.query(`
      INSERT INTO events (event_type, data, created_at)
      VALUES ($1, $2, NOW())
    `, [
      'email.referral_invite',
      JSON.stringify({
        to: email,
        customer_id: customerId,
        company_name: companyName,
        referral_code: referralCode,
        plan_type: planType,
        impressions,
        reward_amount: 500, // $500 credit per referral
      }),
    ]);

    console.log(`🎁 Referral invite sent to ${customerId}: ${referralCode}`);
  }

  /**
   * Check for happy customers eligible for testimonials
   * Run daily to identify testimonial candidates
   */
  async checkTestimonialEligibility(): Promise<void> {
    console.log('⭐ Checking testimonial eligibility...');

    const candidates = await this.pool.query(`
      WITH customer_age AS (
        SELECT 
          c.id as customer_id,
          c.email,
          c.company_name,
          c.created_at,
          EXTRACT(EPOCH FROM (NOW() - c.created_at)) / 86400 as days_active
        FROM customers c
        INNER JOIN subscriptions s ON c.id = s.customer_id
        LEFT JOIN customer_milestones m ON c.id = m.customer_id AND m.milestone_type = 'testimonial_request'
        WHERE s.status = 'active'
          AND EXTRACT(EPOCH FROM (NOW() - c.created_at)) / 86400 >= 90  -- 90+ days
          AND m.id IS NULL  -- Haven't requested testimonial yet
      ),
      nps_scores AS (
        SELECT 
          customer_id,
          AVG(score) as avg_nps
        FROM nps_responses
        WHERE created_at >= NOW() - INTERVAL '90 days'
        GROUP BY customer_id
        HAVING AVG(score) >= 9  -- Promoters only (NPS 9-10)
      )
      SELECT 
        ca.customer_id,
        ca.email,
        ca.company_name,
        ca.days_active,
        ns.avg_nps
      FROM customer_age ca
      INNER JOIN nps_scores ns ON ca.customer_id = ns.customer_id
    `);

    for (const customer of candidates.rows) {
      await this.requestTestimonial(
        customer.customer_id,
        customer.email,
        customer.company_name,
        customer.days_active,
        customer.avg_nps
      );
    }

    console.log(`✅ Sent ${candidates.rows.length} testimonial requests`);
  }

  /**
   * Request testimonial from happy customer
   */
  private async requestTestimonial(
    customerId: string,
    email: string,
    companyName: string | null,
    daysActive: number,
    npsScore: number
  ): Promise<void> {
    // Record milestone
    await this.pool.query(`
      INSERT INTO customer_milestones (customer_id, milestone_type, achieved_at, data)
      VALUES ($1, $2, NOW(), $3)
    `, [customerId, 'testimonial_request', JSON.stringify({ daysActive, npsScore })]);

    // Send testimonial request email
    await this.pool.query(`
      INSERT INTO events (event_type, data, created_at)
      VALUES ($1, $2, NOW())
    `, [
      'email.testimonial_request',
      JSON.stringify({
        to: email,
        customer_id: customerId,
        company_name: companyName,
        days_active: Math.round(daysActive),
        incentive: '1 month free service',
        testimonial_form_url: 'https://apexmediation.com/testimonials/submit',
      }),
    ]);

    console.log(`📝 Testimonial request sent to ${customerId}`);
  }

  /**
   * Check for successful customers eligible for case study
   * Run weekly to identify case study candidates
   */
  async checkCaseStudyEligibility(): Promise<void> {
    console.log('📚 Checking case study eligibility...');

    const candidates = await this.pool.query(`
      WITH usage_stats AS (
        SELECT 
          customer_id,
          SUM(CASE WHEN metric_type = 'impressions' THEN quantity ELSE 0 END) as total_impressions,
          MIN(recorded_at) as first_impression
        FROM usage_records
        GROUP BY customer_id
        HAVING SUM(CASE WHEN metric_type = 'impressions' THEN quantity ELSE 0 END) >= 1000000  -- 1M+ impressions
          AND EXTRACT(EPOCH FROM (NOW() - MIN(recorded_at))) / 86400 >= 30  -- 30+ days
      )
      SELECT 
        c.id as customer_id,
        c.email,
        c.company_name,
        u.total_impressions,
        EXTRACT(EPOCH FROM (NOW() - u.first_impression)) / 86400 as days_active
      FROM customers c
      INNER JOIN subscriptions s ON c.id = s.customer_id
      INNER JOIN usage_stats u ON c.id = u.customer_id
      LEFT JOIN customer_milestones m ON c.id = m.customer_id AND m.milestone_type = 'case_study_invite'
      WHERE s.status = 'active'
        AND m.id IS NULL  -- Haven't invited for case study yet
    `);

    for (const customer of candidates.rows) {
      await this.inviteCaseStudy(
        customer.customer_id,
        customer.email,
        customer.company_name,
        customer.total_impressions,
        customer.days_active
      );
    }

    console.log(`✅ Sent ${candidates.rows.length} case study invites`);
  }

  /**
   * Invite successful customer for case study
   */
  private async inviteCaseStudy(
    customerId: string,
    email: string,
    companyName: string | null,
    impressions: number,
    daysActive: number
  ): Promise<void> {
    // Record milestone
    await this.pool.query(`
      INSERT INTO customer_milestones (customer_id, milestone_type, achieved_at, data)
      VALUES ($1, $2, NOW(), $3)
    `, [customerId, 'case_study_invite', JSON.stringify({ impressions, daysActive })]);

    // Send case study invitation
    await this.pool.query(`
      INSERT INTO events (event_type, data, created_at)
      VALUES ($1, $2, NOW())
    `, [
      'email.case_study_invite',
      JSON.stringify({
        to: email,
        customer_id: customerId,
        company_name: companyName,
        impressions,
        days_active: Math.round(daysActive),
        benefits: [
          'Featured on ApexMediation website',
          'LinkedIn and Twitter shoutouts',
          'Priority support for 6 months',
          'Early access to new features',
        ],
        calendar_link: 'https://cal.com/apexmediation/case-study',
      }),
    ]);

    console.log(`🎤 Case study invite sent to ${customerId}`);
  }

  /**
   * Track community engagement and reward active contributors
   * Run daily to identify and reward community champions
   */
  async rewardCommunityEngagement(): Promise<void> {
    console.log('👥 Checking community engagement...');

    // This would integrate with GitHub Discussions API
    // For now, we'll track internal metrics

    const activeContributors = await this.pool.query(`
      WITH activity_stats AS (
        SELECT 
          customer_id,
          COUNT(*) as support_tickets_helped,
          COUNT(*) FILTER (WHERE resolved = true) as tickets_resolved
        FROM community_contributions
        WHERE created_at >= NOW() - INTERVAL '30 days'
        GROUP BY customer_id
        HAVING COUNT(*) >= 5  -- Helped with 5+ tickets
      )
      SELECT 
        c.id as customer_id,
        c.email,
        c.company_name,
        a.support_tickets_helped,
        a.tickets_resolved
      FROM customers c
      INNER JOIN activity_stats a ON c.id = a.customer_id
      LEFT JOIN customer_milestones m ON c.id = m.customer_id 
        AND m.milestone_type = 'community_champion'
        AND m.achieved_at >= NOW() - INTERVAL '30 days'
      WHERE m.id IS NULL  -- Haven't rewarded this month yet
    `);

    for (const contributor of activeContributors.rows) {
      await this.rewardCommunityChampion(
        contributor.customer_id,
        contributor.email,
        contributor.company_name,
        contributor.support_tickets_helped,
        contributor.tickets_resolved
      );
    }

    console.log(`✅ Rewarded ${activeContributors.rows.length} community champions`);
  }

  /**
   * Reward active community contributor
   */
  private async rewardCommunityChampion(
    customerId: string,
    email: string,
    companyName: string | null,
    ticketsHelped: number,
    ticketsResolved: number
  ): Promise<void> {
    // Record milestone
    await this.pool.query(`
      INSERT INTO customer_milestones (customer_id, milestone_type, achieved_at, data)
      VALUES ($1, $2, NOW(), $3)
    `, [customerId, 'community_champion', JSON.stringify({ ticketsHelped, ticketsResolved })]);

    // Grant $100 account credit
    await this.pool.query(`
      INSERT INTO account_credits (customer_id, amount_cents, reason, expires_at, created_at)
      VALUES ($1, $2, $3, NOW() + INTERVAL '1 year', NOW())
    `, [customerId, 10000, 'Community Champion - Thank you for helping others!']);

    // Send thank you email
    await this.pool.query(`
      INSERT INTO events (event_type, data, created_at)
      VALUES ($1, $2, NOW())
    `, [
      'email.community_champion_reward',
      JSON.stringify({
        to: email,
        customer_id: customerId,
        company_name: companyName,
        tickets_helped: ticketsHelped,
        tickets_resolved: ticketsResolved,
        reward_amount: 100, // $100 credit
        badge_url: 'https://apexmediation.com/badges/community-champion',
      }),
    ]);

    console.log(`🏆 Community champion reward sent to ${customerId}`);
  }

  /**
   * Run all first customer experience checks
   * Called by cron job
   */
  async runAll(): Promise<void> {
    console.log('🌟 Running first customer experience automation...');
    
    await this.checkUsageMilestones();
    await this.checkReferralEligibility();
    await this.checkTestimonialEligibility();
    await this.checkCaseStudyEligibility();
    await this.rewardCommunityEngagement();
    
    console.log('✅ First customer experience automation complete');
  }

  /**
   * Close database connection
   */
  async close(): Promise<void> {
    await this.pool.end();
  }
}

// CLI usage
if (require.main === module) {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    console.error('❌ DATABASE_URL environment variable required');
    process.exit(1);
  }

  const service = new FirstCustomerExperienceService(databaseUrl);

  (async () => {
    try {
      await service.runAll();
      await service.close();
      process.exit(0);
    } catch (error) {
      console.error('❌ Error:', error);
      await service.close();
      process.exit(1);
    }
  })();
}

// Export singleton instance for use in cron jobs
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL environment variable is required');
}
export const firstCustomerExperienceService = new FirstCustomerExperienceService(databaseUrl);
