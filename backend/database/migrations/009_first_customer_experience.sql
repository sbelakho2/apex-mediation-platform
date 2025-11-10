-- Migration 009: First Customer Experience Features
-- Created: 2025-11-03
-- Purpose: Enable enterprise-grade experience for every customer through automation

-- Customer milestones tracking (usage achievements, referrals, testimonials, etc.)
CREATE TABLE IF NOT EXISTS customer_milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  milestone_type VARCHAR(100) NOT NULL,
  achieved_at TIMESTAMP NOT NULL DEFAULT NOW(),
  data JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(customer_id, milestone_type)  -- One milestone per type per customer
);

CREATE INDEX idx_customer_milestones_customer_id ON customer_milestones(customer_id);
CREATE INDEX idx_customer_milestones_type ON customer_milestones(milestone_type);
CREATE INDEX idx_customer_milestones_achieved_at ON customer_milestones(achieved_at);

COMMENT ON TABLE customer_milestones IS 'Tracks customer achievements and growth milestones';
COMMENT ON COLUMN customer_milestones.milestone_type IS 'Types: first_100, first_1k, first_10k, first_100k, first_1m, referral_invite, testimonial_request, case_study_invite, community_champion';

-- Referral codes and tracking
CREATE TABLE IF NOT EXISTS referral_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  code VARCHAR(50) NOT NULL UNIQUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL,
  used_count INT NOT NULL DEFAULT 0,
  max_uses INT DEFAULT NULL  -- NULL = unlimited
);

CREATE INDEX idx_referral_codes_customer_id ON referral_codes(customer_id);
CREATE INDEX idx_referral_codes_code ON referral_codes(code);
CREATE INDEX idx_referral_codes_expires_at ON referral_codes(expires_at);

COMMENT ON TABLE referral_codes IS 'Unique referral codes for each customer';

-- Referral conversions (when someone signs up with a referral code)
CREATE TABLE IF NOT EXISTS referral_conversions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  referred_customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  referral_code VARCHAR(50) NOT NULL,
  converted_at TIMESTAMP NOT NULL DEFAULT NOW(),
  reward_amount_cents INT NOT NULL,  -- $500 = 50000 cents
  reward_granted BOOLEAN NOT NULL DEFAULT FALSE,
  reward_granted_at TIMESTAMP
);

CREATE INDEX idx_referral_conversions_referrer ON referral_conversions(referrer_customer_id);
CREATE INDEX idx_referral_conversions_referred ON referral_conversions(referred_customer_id);
CREATE INDEX idx_referral_conversions_code ON referral_conversions(referral_code);

COMMENT ON TABLE referral_conversions IS 'Tracks successful referrals and rewards';

-- Account credits (referral rewards, community contributions, etc.)
CREATE TABLE IF NOT EXISTS account_credits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  amount_cents INT NOT NULL,
  reason TEXT NOT NULL,
  expires_at TIMESTAMP,
  used_amount_cents INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_account_credits_customer_id ON account_credits(customer_id);
CREATE INDEX idx_account_credits_expires_at ON account_credits(expires_at);

COMMENT ON TABLE account_credits IS 'Account credits from referrals, rewards, promotions';

-- NPS (Net Promoter Score) responses
CREATE TABLE IF NOT EXISTS nps_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  score INT NOT NULL CHECK (score >= 0 AND score <= 10),
  feedback TEXT,
  survey_sent_at TIMESTAMP NOT NULL,
  responded_at TIMESTAMP NOT NULL DEFAULT NOW(),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_nps_responses_customer_id ON nps_responses(customer_id);
CREATE INDEX idx_nps_responses_score ON nps_responses(score);
CREATE INDEX idx_nps_responses_responded_at ON nps_responses(responded_at);

COMMENT ON TABLE nps_responses IS 'Customer satisfaction scores (0-10)';
COMMENT ON COLUMN nps_responses.score IS 'Detractors: 0-6, Passives: 7-8, Promoters: 9-10';

-- Community contributions (GitHub Discussions, Discord help, etc.)
CREATE TABLE IF NOT EXISTS community_contributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  contribution_type VARCHAR(50) NOT NULL,  -- 'github_discussion', 'discord_help', 'documentation', 'bug_report'
  contribution_url TEXT,
  resolved BOOLEAN NOT NULL DEFAULT FALSE,
  upvotes INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_community_contributions_customer_id ON community_contributions(customer_id);
CREATE INDEX idx_community_contributions_type ON community_contributions(contribution_type);
CREATE INDEX idx_community_contributions_created_at ON community_contributions(created_at);

COMMENT ON TABLE community_contributions IS 'Tracks customer contributions to community (support, docs, etc.)';

-- In-app notifications (already existed, but add index for first customer experience)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'idx_notifications_priority'
  ) THEN
    CREATE INDEX idx_notifications_priority ON notifications(priority);
  END IF;
END $$;

-- Add support for drip campaign tracking in events table
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'idx_events_event_type_created'
  ) THEN
    CREATE INDEX idx_events_event_type_created ON events(event_type, created_at);
  END IF;
END $$;

-- Function to apply account credits to invoices
CREATE OR REPLACE FUNCTION apply_account_credits(
  p_customer_id UUID,
  p_invoice_amount_cents INT
) RETURNS INT AS $$
DECLARE
  v_remaining_amount INT := p_invoice_amount_cents;
  v_credit_record RECORD;
  v_amount_to_use INT;
BEGIN
  -- Apply credits in order of expiration (FIFO)
  FOR v_credit_record IN 
    SELECT id, amount_cents, used_amount_cents
    FROM account_credits
    WHERE customer_id = p_customer_id
      AND (expires_at IS NULL OR expires_at > NOW())
      AND used_amount_cents < amount_cents
    ORDER BY COALESCE(expires_at, '9999-12-31'::TIMESTAMP), created_at ASC
  LOOP
    -- Calculate how much of this credit to use
    v_amount_to_use := LEAST(
      v_remaining_amount,
      v_credit_record.amount_cents - v_credit_record.used_amount_cents
    );
    
    -- Update credit usage
    UPDATE account_credits
    SET used_amount_cents = used_amount_cents + v_amount_to_use,
        updated_at = NOW()
    WHERE id = v_credit_record.id;
    
    -- Reduce remaining amount
    v_remaining_amount := v_remaining_amount - v_amount_to_use;
    
    -- Exit if invoice fully covered
    IF v_remaining_amount <= 0 THEN
      EXIT;
    END IF;
  END LOOP;
  
  -- Return final amount due after credits
  RETURN GREATEST(v_remaining_amount, 0);
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION apply_account_credits IS 'Apply available account credits to an invoice, returns remaining amount';

-- Insert milestone types reference data
INSERT INTO system_config (key, value, description, created_at) VALUES
  ('milestone_types', '[
    {"type": "first_100", "threshold": 100, "name": "First 100 Impressions"},
    {"type": "first_1k", "threshold": 1000, "name": "First 1K Impressions"},
    {"type": "first_10k", "threshold": 10000, "name": "First 10K Impressions"},
    {"type": "first_100k", "threshold": 100000, "name": "First 100K Impressions"},
    {"type": "first_1m", "threshold": 1000000, "name": "First 1M Impressions"},
    {"type": "referral_invite", "threshold": null, "name": "Referral Program Invitation"},
    {"type": "testimonial_request", "threshold": null, "name": "Testimonial Request"},
    {"type": "case_study_invite", "threshold": null, "name": "Case Study Invitation"},
    {"type": "community_champion", "threshold": null, "name": "Community Champion"}
  ]'::JSONB, 'Available milestone types and thresholds', NOW())
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();

-- Insert referral program configuration
INSERT INTO system_config (key, value, description, created_at) VALUES
  ('referral_program', '{
    "reward_amount_cents": 50000,
    "referred_discount_cents": 10000,
    "min_referrer_age_days": 30,
    "min_referrer_usage_impressions": 10000,
    "referral_code_expiry_days": 365
  }'::JSONB, 'Referral program configuration', NOW())
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();

-- Insert NPS survey configuration
INSERT INTO system_config (key, value, description, created_at) VALUES
  ('nps_survey', '{
    "send_after_days": 90,
    "frequency_days": 180,
    "promoter_threshold": 9,
    "passive_threshold": 7
  }'::JSONB, 'NPS survey timing and scoring configuration', NOW())
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();

-- Insert testimonial request configuration
INSERT INTO system_config (key, value, description, created_at) VALUES
  ('testimonial_requests', '{
    "min_customer_age_days": 90,
    "min_nps_score": 9,
    "incentive": "1 month free service",
    "max_requests_per_year": 1
  }'::JSONB, 'Testimonial request criteria and incentives', NOW())
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();

-- Insert case study invitation configuration
INSERT INTO system_config (key, value, description, created_at) VALUES
  ('case_study_invites', '{
    "min_impressions": 1000000,
    "min_customer_age_days": 30,
    "benefits": [
      "Featured on ApexMediation website",
      "LinkedIn and Twitter shoutouts",
      "Priority support for 6 months",
      "Early access to new features"
    ]
  }'::JSONB, 'Case study invitation criteria and benefits', NOW())
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();

-- Insert community champion rewards configuration
INSERT INTO system_config (key, value, description, created_at) VALUES
  ('community_champions', '{
    "min_contributions_per_month": 5,
    "reward_amount_cents": 10000,
    "badge_url": "https://apexmediation.com/badges/community-champion"
  }'::JSONB, 'Community champion recognition and rewards', NOW())
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();
