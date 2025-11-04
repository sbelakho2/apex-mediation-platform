-- Migration 007: Value Multipliers System
-- Tracks revenue multipliers from network effects, premium features, marketplace, white-label partnerships

CREATE TABLE IF NOT EXISTS value_multipliers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID REFERENCES users(id) ON DELETE CASCADE,
    multiplier_type VARCHAR(50) NOT NULL CHECK (multiplier_type IN (
        'network_effect_ecpm',
        'ml_waterfall_optimization',
        'premium_feature_realtime_analytics',
        'premium_feature_advanced_targeting',
        'premium_feature_account_manager',
        'marketplace_benchmark_data',
        'white_label_partnership'
    )),
    value_cents_monthly INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    activated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    deactivated_at TIMESTAMP WITH TIME ZONE,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    INDEX idx_value_multipliers_customer (customer_id),
    INDEX idx_value_multipliers_type (multiplier_type),
    INDEX idx_value_multipliers_active (is_active),
    INDEX idx_value_multipliers_activated (activated_at)
);

-- Network effect bonus tracking (platform-wide)
CREATE TABLE IF NOT EXISTS network_effect_milestones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    milestone_impressions BIGINT NOT NULL UNIQUE,
    bonus_ecpm_percent INTEGER NOT NULL,
    unlocked_at TIMESTAMP WITH TIME ZONE,
    is_unlocked BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    INDEX idx_network_effect_unlocked (is_unlocked)
);

-- Insert default milestones
INSERT INTO network_effect_milestones (milestone_impressions, bonus_ecpm_percent) VALUES
(50000000, 10),   -- 50M impressions = +10% eCPM
(100000000, 15),  -- 100M impressions = +15% eCPM
(500000000, 20),  -- 500M impressions = +20% eCPM
(1000000000, 25)  -- 1B impressions = +25% eCPM
ON CONFLICT (milestone_impressions) DO NOTHING;

-- ML waterfall optimization tracking
CREATE TABLE IF NOT EXISTS ml_waterfall_optimizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    optimization_date DATE NOT NULL DEFAULT CURRENT_DATE,
    customers_impacted INTEGER NOT NULL DEFAULT 0,
    avg_ecpm_improvement_percent DECIMAL(5,2) NOT NULL DEFAULT 0,
    optimization_details JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    INDEX idx_ml_waterfall_date (optimization_date)
);

-- Premium feature subscriptions (consolidated)
CREATE TABLE IF NOT EXISTS premium_feature_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    feature_name VARCHAR(100) NOT NULL,
    price_cents_monthly INTEGER NOT NULL,
    subscribed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    cancelled_at TIMESTAMP WITH TIME ZONE,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'trial', 'cancelled', 'expired')),
    stripe_subscription_id VARCHAR(255),
    trial_end_date TIMESTAMP WITH TIME ZONE,
    
    INDEX idx_premium_feature_customer (customer_id),
    INDEX idx_premium_feature_status (status),
    INDEX idx_premium_feature_name (feature_name),
    
    UNIQUE (customer_id, feature_name)
);

-- Marketplace data product subscribers
CREATE TABLE IF NOT EXISTS marketplace_data_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subscriber_organization VARCHAR(255) NOT NULL,
    subscriber_email VARCHAR(255) NOT NULL,
    data_products TEXT[] NOT NULL, -- ['ecpm_benchmarks', 'fill_rate_data', 'geo_performance']
    price_cents_monthly INTEGER NOT NULL DEFAULT 99900, -- $999/month
    subscribed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    cancelled_at TIMESTAMP WITH TIME ZONE,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'cancelled', 'suspended')),
    api_key_hash VARCHAR(255),
    monthly_api_call_limit INTEGER DEFAULT 10000,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    INDEX idx_marketplace_subscriber (subscriber_email),
    INDEX idx_marketplace_status (status)
);

-- White-label partnership tracking
CREATE TABLE IF NOT EXISTS white_label_partnerships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    partner_organization VARCHAR(255) NOT NULL,
    partner_email VARCHAR(255) NOT NULL,
    number_of_apps INTEGER NOT NULL DEFAULT 0,
    revenue_share_percent INTEGER NOT NULL DEFAULT 10, -- 10% commission default
    monthly_revenue_cents INTEGER NOT NULL DEFAULT 0,
    partnership_start_date DATE NOT NULL DEFAULT CURRENT_DATE,
    partnership_end_date DATE,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'paused', 'terminated')),
    contract_details JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    INDEX idx_white_label_status (status),
    INDEX idx_white_label_partner (partner_email)
);

-- Value multiplier revenue tracking (aggregated view)
CREATE OR REPLACE VIEW value_multiplier_revenue AS
SELECT 
    u.id as customer_id,
    u.email,
    COUNT(DISTINCT vm.id) as active_multipliers,
    SUM(CASE WHEN vm.multiplier_type LIKE 'network_effect%' THEN vm.value_cents_monthly ELSE 0 END) as network_effect_cents,
    SUM(CASE WHEN vm.multiplier_type LIKE 'premium_feature%' THEN vm.value_cents_monthly ELSE 0 END) as premium_features_cents,
    SUM(CASE WHEN vm.multiplier_type = 'marketplace_benchmark_data' THEN vm.value_cents_monthly ELSE 0 END) as marketplace_cents,
    SUM(CASE WHEN vm.multiplier_type = 'white_label_partnership' THEN vm.value_cents_monthly ELSE 0 END) as white_label_cents,
    SUM(vm.value_cents_monthly) as total_multiplier_revenue_cents
FROM users u
LEFT JOIN value_multipliers vm ON u.id = vm.customer_id AND vm.is_active = true
WHERE u.role = 'customer'
GROUP BY u.id, u.email;

COMMENT ON TABLE value_multipliers IS 'Tracks all revenue multipliers beyond base mediation fees';
COMMENT ON TABLE network_effect_milestones IS 'Platform-wide volume milestones that unlock eCPM bonuses for all customers';
COMMENT ON TABLE ml_waterfall_optimizations IS 'Logs ML-driven waterfall optimizations and their impact';
COMMENT ON TABLE premium_feature_subscriptions IS 'Premium feature subscriptions: real-time analytics, advanced targeting, account management';
COMMENT ON TABLE marketplace_data_subscriptions IS 'Ad networks and agencies purchasing anonymized benchmark data';
COMMENT ON TABLE white_label_partnerships IS 'Agencies/publishers managing multiple apps under white-label arrangement';
