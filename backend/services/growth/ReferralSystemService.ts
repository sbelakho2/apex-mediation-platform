// services/growth/ReferralSystemService.ts
// Automated referral program with $500 credit rewards
// Zero-touch viral growth loop

import { Pool } from 'pg';
import crypto from 'crypto';

interface ReferralCode {
  id: string;
  customer_id: string;
  code: string;
  reward_amount_cents: number;
  times_used: number;
  max_uses: number;
  status: string;
}

interface ReferralReward {
  id: string;
  referrer_id: string;
  referred_id: string;
  reward_amount_cents: number;
  status: string;
}

export class ReferralSystemService {
  private pool: Pool;
  private readonly DEFAULT_REWARD_CENTS = 50000; // $500

  constructor(databaseUrl: string) {
    this.pool = new Pool({ connectionString: databaseUrl });
  }

  /**
   * Generate unique referral code for customer
   */
  async generateReferralCode(customerId: string): Promise<ReferralCode> {
    const code = this.generateCode();
    
    const result = await this.pool.query(`
      INSERT INTO referral_codes (customer_id, code, reward_amount_cents, max_uses, status)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [customerId, code, this.DEFAULT_REWARD_CENTS, 999, 'active']);

    console.log(`[Referral] Generated code ${code} for customer ${customerId}`);
    return result.rows[0];
  }

  /**
   * Check if customer is eligible for referral code
   * Eligibility: Using >80% of plan limit (high engagement)
   */
  async checkReferralEligibility(): Promise<void> {
    const result = await this.pool.query(`
      SELECT DISTINCT u.id, u.email, u.name,
        (COALESCE(ur.usage_this_month, 0)::DECIMAL / NULLIF(ur.usage_limit, 0)) * 100 as usage_percent
      FROM users u
      LEFT JOIN usage_records ur ON u.id = ur.customer_id
      LEFT JOIN referral_codes rc ON u.id = rc.customer_id
      WHERE u.email IS NOT NULL
        AND rc.id IS NULL -- Don't have referral code yet
        AND ur.usage_this_month::DECIMAL / NULLIF(ur.usage_limit, 0) > 0.8 -- Using >80% of plan
      ORDER BY usage_percent DESC
    `);

    console.log(`[Referral] Found ${result.rows.length} customers eligible for referral codes`);

    for (const row of result.rows) {
      try {
        const code = await this.generateReferralCode(row.id);
        
        // Queue email with referral code
        await this.pool.query(`
          INSERT INTO email_queue (customer_id, template_name, personalization_data, scheduled_for, status)
          VALUES ($1, $2, $3, CURRENT_TIMESTAMP, $4)
        `, [
          row.id,
          'referral_invitation',
          JSON.stringify({
            name: row.name,
            email: row.email,
            referral_code: code.code,
            reward_amount: '$500',
            referral_url: `https://apexmediation.com/signup?ref=${code.code}`
          }),
          'pending'
        ]);

        console.log(`[Referral] Sent referral invitation to ${row.email} with code ${code.code}`);
      } catch (error) {
        console.error(`[Referral] Error processing customer ${row.id}:`, error);
      }
    }
  }

  /**
   * Process referral when new customer signs up with referral code
   */
  async processReferral(newCustomerId: string, referralCode: string): Promise<ReferralReward | null> {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');

      // Find referral code
      const codeResult = await client.query(`
        SELECT * FROM referral_codes
        WHERE code = $1 AND status = 'active'
        FOR UPDATE
      `, [referralCode]);

      if (codeResult.rows.length === 0) {
        console.log(`[Referral] Invalid or inactive code: ${referralCode}`);
        await client.query('ROLLBACK');
        return null;
      }

      const code = codeResult.rows[0];

      // Check if already used
      if (code.times_used >= code.max_uses) {
        console.log(`[Referral] Code ${referralCode} has reached max uses`);
        await client.query('ROLLBACK');
        return null;
      }

      // Check if this customer was already referred
      const existingReward = await client.query(`
        SELECT * FROM referral_rewards
        WHERE referred_id = $1
      `, [newCustomerId]);

      if (existingReward.rows.length > 0) {
        console.log(`[Referral] Customer ${newCustomerId} already referred`);
        await client.query('ROLLBACK');
        return null;
      }

      // Create referral reward
      const rewardResult = await client.query(`
        INSERT INTO referral_rewards (referrer_id, referred_id, referral_code_id, reward_amount_cents, status)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
      `, [code.customer_id, newCustomerId, code.id, code.reward_amount_cents, 'pending']);

      const reward = rewardResult.rows[0];

      // Increment referral code usage
      await client.query(`
        UPDATE referral_codes
        SET times_used = times_used + 1
        WHERE id = $1
      `, [code.id]);

      // Mark new customer as referred
      await client.query(`
        UPDATE users
        SET referred_by = $1, updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
      `, [code.customer_id, newCustomerId]);

      await client.query('COMMIT');

      console.log(`[Referral] Processed referral: ${code.customer_id} referred ${newCustomerId} with code ${referralCode}`);

      // Send confirmation emails
      await this.sendReferralConfirmations(code.customer_id, newCustomerId, code.reward_amount_cents);

      return reward;
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('[Referral] Error processing referral:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Credit referral rewards after referred customer makes first payment
   */
  async creditReferralRewards(): Promise<void> {
    const result = await this.pool.query(`
      SELECT rr.*, 
        referrer.email as referrer_email, 
        referrer.name as referrer_name,
        referred.email as referred_email,
        referred.name as referred_name
      FROM referral_rewards rr
      JOIN users referrer ON rr.referrer_id = referrer.id
      JOIN users referred ON rr.referred_id = referred.id
      WHERE rr.status = 'pending'
        AND EXISTS (
          SELECT 1 FROM revenue_events
          WHERE customer_id = rr.referred_id
          LIMIT 1
        )
    `);

    console.log(`[Referral] Found ${result.rows.length} rewards to credit`);

    for (const reward of result.rows) {
      try {
        await this.pool.query('BEGIN');

        // Credit reward to referrer's account
        await this.pool.query(`
          INSERT INTO account_credits (customer_id, amount_cents, reason, created_at)
          VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
        `, [
          reward.referrer_id,
          reward.reward_amount_cents,
          `Referral reward for referring ${reward.referred_name || reward.referred_email}`
        ]);

        // Mark reward as credited
        await this.pool.query(`
          UPDATE referral_rewards
          SET status = 'credited', credited_at = CURRENT_TIMESTAMP
          WHERE id = $1
        `, [reward.id]);

        await this.pool.query('COMMIT');

        // Send confirmation email
        await this.pool.query(`
          INSERT INTO email_queue (customer_id, template_name, personalization_data, scheduled_for, status)
          VALUES ($1, $2, $3, CURRENT_TIMESTAMP, $4)
        `, [
          reward.referrer_id,
          'referral_reward_credited',
          JSON.stringify({
            name: reward.referrer_name,
            email: reward.referrer_email,
            reward_amount: `$${(reward.reward_amount_cents / 100).toFixed(2)}`,
            referred_name: reward.referred_name || reward.referred_email
          }),
          'pending'
        ]);

        console.log(`[Referral] Credited $${(reward.reward_amount_cents / 100).toFixed(2)} to ${reward.referrer_email}`);
      } catch (error) {
        await this.pool.query('ROLLBACK');
        console.error(`[Referral] Error crediting reward ${reward.id}:`, error);
      }
    }
  }

  /**
   * Get referral stats for customer
   */
  async getReferralStats(customerId: string): Promise<any> {
    const result = await this.pool.query(`
      SELECT 
        rc.code,
        rc.times_used,
        rc.max_uses,
        COUNT(DISTINCT rr.id) as total_referrals,
        COALESCE(SUM(CASE WHEN rr.status = 'credited' THEN rr.reward_amount_cents ELSE 0 END), 0) as total_earned_cents,
        COALESCE(SUM(CASE WHEN rr.status = 'pending' THEN rr.reward_amount_cents ELSE 0 END), 0) as pending_earnings_cents
      FROM referral_codes rc
      LEFT JOIN referral_rewards rr ON rc.id = rr.referral_code_id
      WHERE rc.customer_id = $1
      GROUP BY rc.id
    `, [customerId]);

    return result.rows[0] || {
      code: null,
      times_used: 0,
      total_referrals: 0,
      total_earned_cents: 0,
      pending_earnings_cents: 0
    };
  }

  /**
   * Private: Generate unique referral code
   */
  private generateCode(): string {
    const timestamp = Date.now().toString(36);
    const randomStr = crypto.randomBytes(4).toString('hex').toUpperCase();
    return `${timestamp}${randomStr}`.slice(0, 12);
  }

  /**
   * Private: Send referral confirmation emails
   */
  private async sendReferralConfirmations(referrerId: string, referredId: string, rewardCents: number): Promise<void> {
    // Email to referrer
    await this.pool.query(`
      INSERT INTO email_queue (customer_id, template_name, personalization_data, scheduled_for, status)
      SELECT $1, $2, $3, CURRENT_TIMESTAMP, $4
    `, [
      referrerId,
      'referral_successful',
      JSON.stringify({
        reward_amount: `$${(rewardCents / 100).toFixed(2)}`,
        pending_message: 'Reward will be credited after first payment from referred customer'
      }),
      'pending'
    ]);

    // Email to referred customer
    await this.pool.query(`
      INSERT INTO email_queue (customer_id, template_name, personalization_data, scheduled_for, status)
      SELECT $1, $2, $3, CURRENT_TIMESTAMP, $4
    `, [
      referredId,
      'welcome_from_referral',
      JSON.stringify({
        referrer_benefit: `$${(rewardCents / 100).toFixed(2)}`,
        message: 'Your friend will receive a reward once you make your first payment'
      }),
      'pending'
    ]);
  }

  /**
   * Close database connection
   */
  async close(): Promise<void> {
    await this.pool.end();
  }
}

// Export singleton instance
const referralSystemService = new ReferralSystemService(
  process.env.DATABASE_URL || 'postgresql://localhost:5432/apexmediation'
);

export { referralSystemService };
