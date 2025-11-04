-- Migration 015: Referral System and Discount Infrastructure
-- Implements referral codes, rewards, geographic discounts, and premium feature tracking

-- Referral system tables
CREATE TABLE IF NOT EXISTS referral_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    code VARCHAR(50) UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE,
    max_uses INTEGER DEFAULT 1,
    times_used INTEGER DEFAULT 0,
    reward_amount_cents INTEGER DEFAULT 50000, -- $500 default
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'expired', 'disabled')),
    
    INDEX idx_referral_codes_customer (customer_id),
    INDEX idx_referral_codes_code (code),
    INDEX idx_referral_codes_status (status)
);

CREATE TABLE IF NOT EXISTS referral_rewards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    referrer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    referred_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    referral_code_id UUID NOT NULL REFERENCES referral_codes(id) ON DELETE CASCADE,
    reward_amount_cents INTEGER NOT NULL,
    credited_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'credited', 'revoked')),
    revoked_at TIMESTAMP WITH TIME ZONE,
    revoke_reason TEXT,
    
    INDEX idx_referral_rewards_referrer (referrer_id),
    INDEX idx_referral_rewards_referred (referred_id),
    INDEX idx_referral_rewards_status (status),
    
    -- Prevent duplicate rewards for same referral
    UNIQUE (referrer_id, referred_id)
);

-- Geographic expansion tracking
CREATE TABLE IF NOT EXISTS geographic_expansions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    country_code VARCHAR(2) NOT NULL,
    is_first_in_country BOOLEAN DEFAULT false,
    discount_percent INTEGER DEFAULT 50, -- 50% discount for first customer
    discount_start_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    discount_end_date TIMESTAMP WITH TIME ZONE, -- 6 months from start
    original_take_rate INTEGER DEFAULT 10,
    discounted_take_rate INTEGER DEFAULT 5,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    INDEX idx_geographic_expansions_customer (customer_id),
    INDEX idx_geographic_expansions_country (country_code),
    INDEX idx_geographic_expansions_first (is_first_in_country),
    
    -- One discount per customer per country
    UNIQUE (customer_id, country_code)
);

-- Premium feature subscriptions
CREATE TABLE IF NOT EXISTS premium_features (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    price_cents_monthly INTEGER NOT NULL,
    eligibility_criteria JSONB, -- e.g., {"min_impressions": 10000000, "min_countries": 10}
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT true,
    
    INDEX idx_premium_features_active (is_active)
);

CREATE TABLE IF NOT EXISTS customer_premium_features (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    feature_id UUID NOT NULL REFERENCES premium_features(id) ON DELETE CASCADE,
    subscribed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    cancelled_at TIMESTAMP WITH TIME ZONE,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'cancelled', 'expired')),
    stripe_subscription_id VARCHAR(255),
    
    INDEX idx_customer_premium_features_customer (customer_id),
    INDEX idx_customer_premium_features_feature (feature_id),
    INDEX idx_customer_premium_features_status (status),
    
    -- One subscription per customer per feature
    UNIQUE (customer_id, feature_id, status)
);

-- Network effect bonuses
CREATE TABLE IF NOT EXISTS network_effect_bonuses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    milestone_type VARCHAR(50) NOT NULL, -- 'volume_50M', 'volume_100M', 'volume_500M', 'volume_1B'
    threshold_value BIGINT NOT NULL,
    bonus_ecpm_percent INTEGER NOT NULL, -- e.g., 10 for +10% eCPM
    unlocked_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    current_value BIGINT DEFAULT 0,
    is_active BOOLEAN DEFAULT false,
    
    INDEX idx_network_effect_bonuses_type (milestone_type),
    INDEX idx_network_effect_bonuses_active (is_active),
    
    UNIQUE (milestone_type)
);

-- Volume deals with ad networks
CREATE TABLE IF NOT EXISTS volume_deals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ad_network VARCHAR(50) NOT NULL,
    volume_tier VARCHAR(50) NOT NULL, -- 'tier_1_50M', 'tier_2_100M', etc.
    min_monthly_impressions BIGINT NOT NULL,
    negotiated_rate_boost_percent INTEGER NOT NULL, -- e.g., 15 for +15% revenue
    deal_start_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    deal_end_date TIMESTAMP WITH TIME ZONE,
    auto_negotiated BOOLEAN DEFAULT true,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'pending', 'expired')),
    
    INDEX idx_volume_deals_network (ad_network),
    INDEX idx_volume_deals_status (status),
    INDEX idx_volume_deals_tier (volume_tier)
);

-- Case study eligibility tracking
CREATE TABLE IF NOT EXISTS case_study_candidates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    days_active INTEGER NOT NULL,
    total_impressions BIGINT DEFAULT 0,
    eligible BOOLEAN DEFAULT false,
    invited_at TIMESTAMP WITH TIME ZONE,
    accepted_at TIMESTAMP WITH TIME ZONE,
    published_at TIMESTAMP WITH TIME ZONE,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'invited', 'accepted', 'declined', 'published')),
    case_study_url TEXT,
    
    INDEX idx_case_study_candidates_customer (customer_id),
    INDEX idx_case_study_candidates_status (status),
    INDEX idx_case_study_candidates_eligible (eligible)
);

-- Testimonial requests
CREATE TABLE IF NOT EXISTS testimonial_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    days_active INTEGER NOT NULL,
    nps_score INTEGER CHECK (nps_score >= 0 AND nps_score <= 10),
    requested_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    responded_at TIMESTAMP WITH TIME ZONE,
    testimonial_text TEXT,
    rating INTEGER CHECK (rating >= 1 AND rating <= 5),
    can_publish BOOLEAN DEFAULT false,
    published_at TIMESTAMP WITH TIME ZONE,
    status VARCHAR(20) DEFAULT 'requested' CHECK (status IN ('requested', 'responded', 'declined', 'published')),
    
    INDEX idx_testimonial_requests_customer (customer_id),
    INDEX idx_testimonial_requests_status (status),
    INDEX idx_testimonial_requests_nps (nps_score)
);

-- Community contribution tracking
CREATE TABLE IF NOT EXISTS community_contributions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    contribution_type VARCHAR(50) NOT NULL, -- 'github_discussion', 'forum_post', 'bug_report', 'feature_request', 'documentation'
    contribution_url TEXT,
    contribution_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    points_awarded INTEGER DEFAULT 1,
    badge_earned VARCHAR(100),
    
    INDEX idx_community_contributions_customer (customer_id),
    INDEX idx_community_contributions_type (contribution_type),
    INDEX idx_community_contributions_date (contribution_date)
);

-- ML model optimization tracking
CREATE TABLE IF NOT EXISTS ml_model_optimizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    model_type VARCHAR(50) NOT NULL, -- 'waterfall', 'fraud_detection', 'ecpm_prediction', 'churn_prediction'
    optimization_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    training_data_size INTEGER NOT NULL,
    previous_accuracy DECIMAL(5,4),
    new_accuracy DECIMAL(5,4),
    improvement_percent DECIMAL(5,2),
    deployed_at TIMESTAMP WITH TIME ZONE,
    status VARCHAR(20) DEFAULT 'trained' CHECK (status IN ('trained', 'testing', 'deployed', 'rolled_back')),
    
    INDEX idx_ml_model_optimizations_type (model_type),
    INDEX idx_ml_model_optimizations_date (optimization_date),
    INDEX idx_ml_model_optimizations_status (status)
);

-- Marketplace data subscriptions
CREATE TABLE IF NOT EXISTS marketplace_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subscriber_company VARCHAR(255) NOT NULL,
    subscription_type VARCHAR(50) NOT NULL, -- 'benchmark_data', 'performance_insights', 'geo_analysis'
    price_cents_monthly INTEGER DEFAULT 99900, -- $999/month
    subscribed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    cancelled_at TIMESTAMP WITH TIME ZONE,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'cancelled', 'suspended')),
    api_key_hash TEXT,
    monthly_api_calls INTEGER DEFAULT 0,
    
    INDEX idx_marketplace_subscriptions_company (subscriber_company),
    INDEX idx_marketplace_subscriptions_status (status),
    INDEX idx_marketplace_subscriptions_type (subscription_type)
);

-- System health checks
CREATE TABLE IF NOT EXISTS system_health_checks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    check_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    health_score INTEGER CHECK (health_score >= 0 AND health_score <= 100),
    active_incidents INTEGER DEFAULT 0,
    pending_optimizations INTEGER DEFAULT 0,
    success_rate_24h DECIMAL(5,2),
    avg_response_time_ms INTEGER,
    error_rate_percent DECIMAL(5,2),
    healthy_customers INTEGER DEFAULT 0,
    at_risk_customers INTEGER DEFAULT 0,
    unhealthy_customers INTEGER DEFAULT 0,
    checks_passed INTEGER DEFAULT 0,
    checks_failed INTEGER DEFAULT 0,
    issues JSONB, -- Detailed list of any issues detected
    
    INDEX idx_system_health_checks_date (check_date),
    INDEX idx_system_health_checks_score (health_score)
);

-- Insert default premium features
INSERT INTO premium_features (name, description, price_cents_monthly, eligibility_criteria) VALUES
('Real-Time Analytics', 'Sub-second dashboard refresh with custom queries', 5000, '{"min_dashboard_views_per_month": 150}'),
('Advanced Targeting', 'Geo-targeting, demographic filters, custom audiences', 15000, '{"min_countries": 10}'),
('Priority Support', 'Direct Slack channel, <1h response time SLA', 10000, '{"min_monthly_impressions": 50000000}'),
('White Label', 'Custom branding, dedicated subdomain, reseller commission', 50000, '{"min_apps": 3, "min_monthly_revenue": 500000}');

-- Insert network effect milestones
INSERT INTO network_effect_bonuses (milestone_type, threshold_value, bonus_ecpm_percent, is_active) VALUES
('volume_50M', 50000000, 10, false),
('volume_100M', 100000000, 15, false),
('volume_500M', 500000000, 20, false),
('volume_1B', 1000000000, 25, false);

-- Create helper functions

-- Function to check referral eligibility
CREATE OR REPLACE FUNCTION check_referral_eligibility(p_customer_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    v_usage_percent DECIMAL;
BEGIN
    SELECT (usage_this_month::DECIMAL / usage_limit) * 100
    INTO v_usage_percent
    FROM usage_records
    WHERE customer_id = p_customer_id
    ORDER BY created_at DESC
    LIMIT 1;
    
    -- Eligible if using >80% of plan limit
    RETURN COALESCE(v_usage_percent, 0) > 80;
END;
$$ LANGUAGE plpgsql;

-- Function to check case study eligibility
CREATE OR REPLACE FUNCTION check_case_study_eligibility(p_customer_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    v_days_active INTEGER;
    v_total_impressions BIGINT;
BEGIN
    SELECT 
        EXTRACT(DAY FROM CURRENT_TIMESTAMP - created_at),
        COALESCE(SUM(impressions), 0)
    INTO v_days_active, v_total_impressions
    FROM users u
    LEFT JOIN usage_records ur ON u.id = ur.customer_id
    WHERE u.id = p_customer_id
    GROUP BY u.created_at;
    
    -- Eligible if 30+ days active AND >1M impressions
    RETURN v_days_active >= 30 AND v_total_impressions >= 1000000;
END;
$$ LANGUAGE plpgsql;

-- Function to calculate testimonial eligibility
CREATE OR REPLACE FUNCTION check_testimonial_eligibility(p_customer_id UUID)
RETURNS TABLE (eligible BOOLEAN, days_active INTEGER, nps_score INTEGER) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        (EXTRACT(DAY FROM CURRENT_TIMESTAMP - u.created_at) >= 90 
         AND COALESCE(chs.nps_score, 0) >= 9)::BOOLEAN as eligible,
        EXTRACT(DAY FROM CURRENT_TIMESTAMP - u.created_at)::INTEGER as days_active,
        COALESCE(chs.nps_score, 0)::INTEGER as nps_score
    FROM users u
    LEFT JOIN customer_health_scores chs ON u.id = chs.customer_id
    WHERE u.id = p_customer_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON TABLE referral_codes IS 'Referral codes for customer referral program ($500 credit per referral)';
COMMENT ON TABLE referral_rewards IS 'Tracks referral rewards credited to referrers';
COMMENT ON TABLE geographic_expansions IS 'First-customer discounts for new geographic markets (50% for 6 months)';
COMMENT ON TABLE premium_features IS 'Available premium features with pricing and eligibility';
COMMENT ON TABLE network_effect_bonuses IS 'Platform-wide volume milestones that unlock eCPM bonuses';
COMMENT ON TABLE volume_deals IS 'Negotiated rate improvements with ad networks based on aggregate volume';
COMMENT ON TABLE case_study_candidates IS 'Customers eligible for case study participation (30 days + 1M impressions)';
COMMENT ON TABLE testimonial_requests IS 'Testimonial requests for 90+ day customers with NPS >9';
COMMENT ON TABLE community_contributions IS 'GitHub Discussions and community participation tracking';
COMMENT ON TABLE ml_model_optimizations IS 'ML model training and deployment history';
COMMENT ON TABLE marketplace_subscriptions IS 'Ad network subscriptions to benchmark data ($999/month)';
COMMENT ON TABLE system_health_checks IS 'Daily system health verification results';
