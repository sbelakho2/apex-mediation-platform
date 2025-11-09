-- Migration 010: Growth & Optimization Infrastructure
-- Waterfall configs, marketplace products, white-label, pricing recommendations, upsell opportunities

CREATE TABLE IF NOT EXISTS waterfall_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID REFERENCES users(id) ON DELETE CASCADE,
    placement_id UUID REFERENCES placements(id) ON DELETE CASCADE,
    adapter_priorities JSONB NOT NULL, -- [{adapter_id, priority, timeout_ms}]
    floor_price_cents INTEGER NOT NULL DEFAULT 0,
    optimization_strategy VARCHAR(50) DEFAULT 'ml' CHECK (optimization_strategy IN ('static', 'ml', 'ab_test')),
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_optimized_at TIMESTAMP WITH TIME ZONE,
    optimization_score DECIMAL(5,2) -- 0-100 score
);

CREATE INDEX IF NOT EXISTS idx_waterfall_customer ON waterfall_configs (customer_id);
CREATE INDEX IF NOT EXISTS idx_waterfall_placement ON waterfall_configs (placement_id);
CREATE INDEX IF NOT EXISTS idx_waterfall_active ON waterfall_configs (active);

CREATE TABLE IF NOT EXISTS marketplace_products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT NOT NULL,
    category VARCHAR(50) NOT NULL, -- 'benchmark_data', 'optimization_insights', 'fraud_signals'
    price_cents_monthly INTEGER NOT NULL,
    data_sources JSONB DEFAULT '[]', -- List of data tables aggregated
    aggregation_rules JSONB DEFAULT '{}', -- Anonymization and aggregation rules
    min_sample_size INTEGER DEFAULT 100,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_marketplace_products_category ON marketplace_products (category);
CREATE INDEX IF NOT EXISTS idx_marketplace_products_active ON marketplace_products (active);

CREATE TABLE IF NOT EXISTS white_label_opportunities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    opportunity_score DECIMAL(5,2) NOT NULL, -- 0-100
    number_of_apps INTEGER NOT NULL,
    total_monthly_revenue_cents INTEGER NOT NULL,
    commission_potential_cents INTEGER NOT NULL,
    status VARCHAR(20) DEFAULT 'identified' CHECK (status IN ('identified', 'contacted', 'negotiating', 'converted', 'rejected')),
    contacted_at TIMESTAMP WITH TIME ZONE,
    converted_at TIMESTAMP WITH TIME ZONE,
    rejection_reason TEXT,
    partnership_details JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_white_label_customer ON white_label_opportunities (customer_id);
CREATE INDEX IF NOT EXISTS idx_white_label_status ON white_label_opportunities (status);
CREATE INDEX IF NOT EXISTS idx_white_label_score ON white_label_opportunities (opportunity_score);

CREATE TABLE IF NOT EXISTS pricing_recommendations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recommendation_type VARCHAR(50) NOT NULL, -- 'new_tier', 'price_increase', 'price_decrease', 'feature_bundle'
    target_customer_segment JSONB DEFAULT '{}',
    current_pricing JSONB DEFAULT '{}',
    recommended_pricing JSONB DEFAULT '{}',
    expected_impact_revenue_cents INTEGER NOT NULL,
    expected_impact_customers INTEGER NOT NULL,
    confidence_score DECIMAL(3,2) NOT NULL CHECK (confidence_score BETWEEN 0 AND 1),
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'implemented', 'rejected')),
    approved_by VARCHAR(255),
    implemented_at TIMESTAMP WITH TIME ZONE,
    actual_impact_revenue_cents INTEGER,
    actual_impact_customers INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_pricing_recommendations_type ON pricing_recommendations (recommendation_type);
CREATE INDEX IF NOT EXISTS idx_pricing_recommendations_status ON pricing_recommendations (status);
CREATE INDEX IF NOT EXISTS idx_pricing_recommendations_confidence ON pricing_recommendations (confidence_score);

CREATE TABLE IF NOT EXISTS upsell_opportunities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    opportunity_type VARCHAR(50) NOT NULL, -- 'plan_upgrade', 'premium_feature', 'usage_expansion'
    current_plan VARCHAR(50),
    recommended_plan VARCHAR(50),
    expected_value_increase_cents INTEGER NOT NULL,
    likelihood DECIMAL(3,2) NOT NULL CHECK (likelihood BETWEEN 0 AND 1),
    trigger_reason TEXT NOT NULL,
    status VARCHAR(20) DEFAULT 'identified' CHECK (status IN ('identified', 'proposed', 'accepted', 'rejected', 'expired')),
    proposed_at TIMESTAMP WITH TIME ZONE,
    response_at TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_upsell_customer ON upsell_opportunities (customer_id);
CREATE INDEX IF NOT EXISTS idx_upsell_type ON upsell_opportunities (opportunity_type);
CREATE INDEX IF NOT EXISTS idx_upsell_status ON upsell_opportunities (status);
CREATE INDEX IF NOT EXISTS idx_upsell_likelihood ON upsell_opportunities (likelihood);

CREATE TABLE IF NOT EXISTS infrastructure_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type VARCHAR(100) NOT NULL,
    description TEXT NOT NULL,
    severity VARCHAR(20) DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'critical')),
    affected_services TEXT[],
    metadata JSONB DEFAULT '{}',
    resolved BOOLEAN DEFAULT false,
    resolved_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_infra_events_type ON infrastructure_events (event_type);
CREATE INDEX IF NOT EXISTS idx_infra_events_severity ON infrastructure_events (severity);
CREATE INDEX IF NOT EXISTS idx_infra_events_resolved ON infrastructure_events (resolved);
CREATE INDEX IF NOT EXISTS idx_infra_events_created ON infrastructure_events (created_at);

CREATE TABLE IF NOT EXISTS feature_flags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    flag_name VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    enabled BOOLEAN DEFAULT false,
    rollout_percentage INTEGER DEFAULT 0 CHECK (rollout_percentage BETWEEN 0 AND 100),
    target_customers UUID[], -- Specific customers to enable for
    target_plans TEXT[], -- Specific plan types
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_feature_flags_name ON feature_flags (flag_name);
CREATE INDEX IF NOT EXISTS idx_feature_flags_enabled ON feature_flags (enabled);

CREATE TABLE IF NOT EXISTS customer_segments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    segment_name VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    segmentation_rules JSONB NOT NULL, -- Query rules to identify customers
    customer_count INTEGER DEFAULT 0,
    avg_revenue_cents INTEGER DEFAULT 0,
    avg_health_score INTEGER DEFAULT 0,
    last_calculated_at TIMESTAMP WITH TIME ZONE,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_customer_segments_name ON customer_segments (segment_name);
CREATE INDEX IF NOT EXISTS idx_customer_segments_active ON customer_segments (active);

CREATE TABLE IF NOT EXISTS segment_memberships (
    customer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    segment_id UUID NOT NULL REFERENCES customer_segments(id) ON DELETE CASCADE,
    assigned_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    PRIMARY KEY (customer_id, segment_id)
);

CREATE INDEX IF NOT EXISTS idx_segment_memberships_customer ON segment_memberships (customer_id);
CREATE INDEX IF NOT EXISTS idx_segment_memberships_segment ON segment_memberships (segment_id);

-- Revenue optimization dashboard view
CREATE OR REPLACE VIEW revenue_optimization_dashboard AS
SELECT 
    (SELECT COUNT(*) FROM upsell_opportunities WHERE status = 'identified') as active_upsell_opportunities,
    (SELECT SUM(expected_value_increase_cents) FROM upsell_opportunities WHERE status IN ('identified', 'proposed')) as pipeline_value_cents,
    (SELECT COUNT(*) FROM upsell_opportunities WHERE response_at > NOW() - INTERVAL '30 days' AND status = 'accepted') as conversions_last_30d,
    (SELECT SUM(expected_value_increase_cents) FROM upsell_opportunities WHERE response_at > NOW() - INTERVAL '30 days' AND status = 'accepted') as revenue_from_upsells_30d,
    (SELECT COUNT(*) FROM white_label_opportunities WHERE status IN ('identified', 'contacted', 'negotiating')) as active_white_label_opportunities,
    (SELECT SUM(commission_potential_cents) FROM white_label_opportunities WHERE status IN ('identified', 'contacted', 'negotiating')) as white_label_pipeline_cents,
    (SELECT COUNT(*) FROM pricing_recommendations WHERE status = 'pending') as pending_pricing_recommendations,
    (SELECT SUM(expected_impact_revenue_cents) FROM pricing_recommendations WHERE status = 'pending') as potential_pricing_impact_cents,
    NOW() as last_updated;

COMMENT ON TABLE waterfall_configs IS 'Ad adapter waterfall configurations with ML-based optimization';
COMMENT ON TABLE marketplace_products IS 'Data products sold to ad networks (benchmark data, fraud signals)';
COMMENT ON TABLE white_label_opportunities IS 'Agencies/publishers identified for white-label partnerships';
COMMENT ON TABLE pricing_recommendations IS 'AI-generated pricing optimization recommendations';
COMMENT ON TABLE upsell_opportunities IS 'Customer upgrade opportunities (plan upgrades, premium features)';
COMMENT ON TABLE infrastructure_events IS 'Infrastructure-level events (deployments, scaling, incidents)';
COMMENT ON TABLE feature_flags IS 'Feature flags for gradual rollouts and A/B testing';
COMMENT ON TABLE customer_segments IS 'Dynamic customer segments for targeted campaigns';
COMMENT ON TABLE segment_memberships IS 'Customer-to-segment mappings';
