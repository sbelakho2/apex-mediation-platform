-- Migration 011: Value Multipliers & Advanced Monetization
-- Purpose: Increase profitability per customer as platform scales
-- Strategy: Network effects, premium features, marketplace, white label, dynamic pricing

-- ============================================================================
-- TABLE: value_multipliers
-- Purpose: Track automated value increases for all customers
-- ============================================================================

CREATE TABLE IF NOT EXISTS value_multipliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  multiplier_type VARCHAR(100) UNIQUE NOT NULL,
  multiplier_value DECIMAL(10, 4) NOT NULL, -- e.g., 0.25 = 25% increase
  applies_to_all_customers BOOLEAN DEFAULT true,
  description TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_value_multipliers_type ON value_multipliers(multiplier_type);

COMMENT ON TABLE value_multipliers IS 'Automated value increases that benefit all customers (network effects, data optimization)';
COMMENT ON COLUMN value_multipliers.multiplier_value IS 'Percentage increase (0.25 = 25% boost)';

-- ============================================================================
-- TABLE: ad_performance
-- Purpose: Track ad network performance for optimization
-- ============================================================================

CREATE TABLE IF NOT EXISTS ad_performance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ad_network VARCHAR(100) NOT NULL,
  ad_format VARCHAR(50) NOT NULL,
  geo_country VARCHAR(2), -- ISO country code
  device_type VARCHAR(50), -- ios, android, tablet
  ecpm_cents INTEGER NOT NULL, -- eCPM in cents
  fill_rate DECIMAL(5, 4), -- 0.9500 = 95% fill rate
  ctr_percent DECIMAL(5, 4), -- 0.0250 = 2.5% CTR
  impressions INTEGER DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ad_performance_customer ON ad_performance(customer_id, created_at DESC);
CREATE INDEX idx_ad_performance_network ON ad_performance(ad_network, ad_format, geo_country);
CREATE INDEX idx_ad_performance_created ON ad_performance(created_at DESC);

COMMENT ON TABLE ad_performance IS 'Granular ad network performance data for optimization';

-- ============================================================================
-- TABLE: waterfall_configs
-- Purpose: Store optimized waterfall configurations per customer
-- ============================================================================

CREATE TABLE IF NOT EXISTS waterfall_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  config JSONB NOT NULL, -- Array of {position, ad_network, expected_ecpm_cents, expected_fill_rate}
  optimization_source VARCHAR(50), -- 'aggregate_data', 'ml_model', 'manual'
  expected_revenue_increase_percent INTEGER, -- Expected lift from optimization
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_waterfall_configs_customer ON waterfall_configs(customer_id);

COMMENT ON TABLE waterfall_configs IS 'Optimized ad waterfall configurations (auto-updated with aggregate data)';

-- ============================================================================
-- TABLE: premium_features
-- Purpose: Track premium feature subscriptions
-- ============================================================================

CREATE TABLE IF NOT EXISTS premium_features (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  feature_name VARCHAR(100) NOT NULL,
  price_cents INTEGER NOT NULL,
  active BOOLEAN DEFAULT true,
  started_at TIMESTAMP NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMP,
  UNIQUE(customer_id, feature_name)
);

CREATE INDEX idx_premium_features_customer ON premium_features(customer_id);
CREATE INDEX idx_premium_features_active ON premium_features(active) WHERE active = true;

COMMENT ON TABLE premium_features IS 'Premium feature subscriptions (realtime analytics, advanced targeting, etc.)';

-- Premium feature definitions
INSERT INTO system_config (key, value, description, updated_at)
VALUES ('premium_features', '{
  "realtime_analytics": {
    "name": "Real-Time Analytics",
    "description": "Live dashboard updates every second, instant performance insights",
    "price_cents": 5000,
    "estimated_revenue_increase_percent": 7
  },
  "advanced_targeting": {
    "name": "Advanced Targeting",
    "description": "Geo-targeting, audience segmentation, device targeting",
    "price_cents": 15000,
    "estimated_revenue_increase_percent": 25
  },
  "account_manager": {
    "name": "Dedicated Account Manager",
    "description": "White-glove support, custom optimizations, quarterly reviews",
    "price_cents": 50000,
    "estimated_revenue_increase_percent": 12
  },
  "custom_waterfall": {
    "name": "Custom Waterfall Rules",
    "description": "Build complex waterfall logic with if/then rules",
    "price_cents": 10000,
    "estimated_revenue_increase_percent": 10
  },
  "api_access": {
    "name": "Advanced API Access",
    "description": "Programmatic waterfall management, bulk operations",
    "price_cents": 20000,
    "estimated_revenue_increase_percent": 5
  }
}', 'Premium feature catalog with pricing and value proposition', NOW())
ON CONFLICT (key) DO NOTHING;

-- ============================================================================
-- TABLE: upsell_opportunities
-- Purpose: Track automated upsell opportunities
-- ============================================================================

CREATE TABLE IF NOT EXISTS upsell_opportunities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  feature_name VARCHAR(100) NOT NULL,
  price_cents INTEGER NOT NULL,
  pitch TEXT NOT NULL,
  metadata JSONB, -- Usage data, value proposition, estimated ROI
  status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'accepted', 'declined')),
  sent_at TIMESTAMP,
  responded_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(customer_id, feature_name)
);

CREATE INDEX idx_upsell_opportunities_customer ON upsell_opportunities(customer_id);
CREATE INDEX idx_upsell_opportunities_status ON upsell_opportunities(status);

COMMENT ON TABLE upsell_opportunities IS 'Automated premium feature upsell opportunities based on usage patterns';

-- ============================================================================
-- TABLE: marketplace_products
-- Purpose: Data products sold to ad networks and publishers
-- ============================================================================

CREATE TABLE IF NOT EXISTS marketplace_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_type VARCHAR(100) UNIQUE NOT NULL,
  product_name VARCHAR(255) NOT NULL,
  description TEXT,
  price_cents INTEGER NOT NULL,
  data_points INTEGER, -- Number of data points included
  update_frequency VARCHAR(50), -- 'daily', 'weekly', 'monthly'
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_marketplace_products_type ON marketplace_products(product_type);

COMMENT ON TABLE marketplace_products IS 'Data products sold in marketplace (benchmark reports, performance insights)';

-- ============================================================================
-- TABLE: marketplace_subscriptions
-- Purpose: Track marketplace product subscriptions
-- ============================================================================

CREATE TABLE IF NOT EXISTS marketplace_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES marketplace_products(id),
  subscriber_email VARCHAR(255) NOT NULL,
  subscriber_company VARCHAR(255),
  price_cents INTEGER NOT NULL,
  status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'cancelled', 'expired')),
  started_at TIMESTAMP NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMP,
  UNIQUE(product_id, subscriber_email)
);

CREATE INDEX idx_marketplace_subscriptions_product ON marketplace_subscriptions(product_id);
CREATE INDEX idx_marketplace_subscriptions_status ON marketplace_subscriptions(status);

COMMENT ON TABLE marketplace_subscriptions IS 'Subscriptions to marketplace data products (sold to ad networks)';

-- ============================================================================
-- TABLE: white_label_partners
-- Purpose: Track white label / reseller partnerships
-- ============================================================================

CREATE TABLE IF NOT EXISTS white_label_partners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  partner_name VARCHAR(255) NOT NULL,
  custom_domain VARCHAR(255) UNIQUE, -- e.g., ads.theiragency.com
  branding_config JSONB, -- Logo URL, colors, fonts
  commission_percent INTEGER DEFAULT 40, -- Partner keeps 60%, platform takes 40%
  monthly_commission_cents INTEGER DEFAULT 0,
  client_count INTEGER DEFAULT 0,
  status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'suspended')),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_white_label_partners_customer ON white_label_partners(customer_id);
CREATE INDEX idx_white_label_partners_status ON white_label_partners(status);

COMMENT ON TABLE white_label_partners IS 'White label partnerships (agencies reselling platform under their brand)';

-- ============================================================================
-- TABLE: white_label_opportunities
-- Purpose: Track potential white label partners
-- ============================================================================

CREATE TABLE IF NOT EXISTS white_label_opportunities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  app_count INTEGER, -- Number of apps they manage
  monthly_revenue_cents INTEGER, -- Total revenue from all apps
  proposed_commission_percent INTEGER,
  estimated_platform_revenue_cents INTEGER,
  status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'contacted', 'negotiating', 'accepted', 'declined')),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(customer_id)
);

CREATE INDEX idx_white_label_opportunities_customer ON white_label_opportunities(customer_id);
CREATE INDEX idx_white_label_opportunities_status ON white_label_opportunities(status);

COMMENT ON TABLE white_label_opportunities IS 'Potential white label partners identified by usage patterns';

-- ============================================================================
-- TABLE: pricing_recommendations
-- Purpose: AI-generated pricing optimization recommendations
-- ============================================================================

CREATE TABLE IF NOT EXISTS pricing_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recommendation_type VARCHAR(100), -- 'add_intermediate_tier', 'adjust_overage_pricing', 'bundle_features'
  current_plan_type VARCHAR(50),
  affected_customers INTEGER,
  avg_overage_cents INTEGER,
  recommended_action TEXT,
  estimated_revenue_increase_cents INTEGER,
  implemented BOOLEAN DEFAULT false,
  implemented_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_pricing_recommendations_type ON pricing_recommendations(recommendation_type);
CREATE INDEX idx_pricing_recommendations_implemented ON pricing_recommendations(implemented);

COMMENT ON TABLE pricing_recommendations IS 'Automated pricing optimization recommendations based on usage patterns';

-- ============================================================================
-- TABLE: analytics_views
-- Purpose: Track dashboard analytics views (for premium upsell detection)
-- ============================================================================

CREATE TABLE IF NOT EXISTS analytics_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  page VARCHAR(100), -- 'dashboard', 'reports', 'waterfall_config'
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_analytics_views_customer ON analytics_views(customer_id, created_at DESC);

COMMENT ON TABLE analytics_views IS 'Track dashboard usage to detect premium analytics upsell opportunities';

-- ============================================================================
-- FUNCTION: calculate_revenue_per_customer
-- Purpose: Calculate total revenue per customer including all multipliers
-- ============================================================================

CREATE OR REPLACE FUNCTION calculate_revenue_per_customer()
RETURNS TABLE(
  customer_id UUID,
  base_revenue_cents INTEGER,
  premium_revenue_cents INTEGER,
  marketplace_share_cents INTEGER,
  white_label_commission_cents INTEGER,
  total_revenue_cents INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    u.id as customer_id,
    COALESCE(s.base_price_cents, 0) as base_revenue_cents,
    COALESCE(premium_rev.total_premium_cents, 0) as premium_revenue_cents,
    0 as marketplace_share_cents, -- Marketplace revenue shared across all customers
    COALESCE(wl.monthly_commission_cents, 0) as white_label_commission_cents,
    COALESCE(s.base_price_cents, 0) + 
    COALESCE(premium_rev.total_premium_cents, 0) + 
    COALESCE(wl.monthly_commission_cents, 0) as total_revenue_cents
  FROM users u
  LEFT JOIN subscriptions s ON u.id = s.customer_id
  LEFT JOIN (
    SELECT customer_id, SUM(price_cents) as total_premium_cents
    FROM premium_features
    WHERE active = true
    GROUP BY customer_id
  ) premium_rev ON u.id = premium_rev.customer_id
  LEFT JOIN white_label_partners wl ON u.id = wl.customer_id AND wl.status = 'active';
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION calculate_revenue_per_customer IS 'Calculate total revenue per customer including all monetization streams';

-- ============================================================================
-- VIEW: profitability_dashboard
-- Purpose: Real-time profitability metrics
-- ============================================================================

CREATE OR REPLACE VIEW profitability_dashboard AS
SELECT 
  COUNT(DISTINCT u.id) as total_customers,
  SUM(COALESCE(s.base_price_cents, 0)) / 100.0 as total_base_revenue,
  SUM(COALESCE(premium_rev.total_premium_cents, 0)) / 100.0 as total_premium_revenue,
  SUM(COALESCE(mp.total_marketplace_revenue, 0)) / 100.0 as total_marketplace_revenue,
  SUM(COALESCE(wl.total_white_label_revenue, 0)) / 100.0 as total_white_label_revenue,
  (
    SUM(COALESCE(s.base_price_cents, 0)) + 
    SUM(COALESCE(premium_rev.total_premium_cents, 0)) + 
    SUM(COALESCE(mp.total_marketplace_revenue, 0)) + 
    SUM(COALESCE(wl.total_white_label_revenue, 0))
  ) / 100.0 as total_monthly_revenue,
  (
    SUM(COALESCE(s.base_price_cents, 0)) + 
    SUM(COALESCE(premium_rev.total_premium_cents, 0)) + 
    SUM(COALESCE(mp.total_marketplace_revenue, 0)) + 
    SUM(COALESCE(wl.total_white_label_revenue, 0))
  ) / GREATEST(COUNT(DISTINCT u.id), 1) / 100.0 as revenue_per_customer,
  20000 / 100.0 as monthly_operational_costs, -- $200/month fixed costs
  (
    (
      SUM(COALESCE(s.base_price_cents, 0)) + 
      SUM(COALESCE(premium_rev.total_premium_cents, 0)) + 
      SUM(COALESCE(mp.total_marketplace_revenue, 0)) + 
      SUM(COALESCE(wl.total_white_label_revenue, 0))
    ) - 20000
  ) / 100.0 as monthly_profit,
  CASE 
    WHEN (
      SUM(COALESCE(s.base_price_cents, 0)) + 
      SUM(COALESCE(premium_rev.total_premium_cents, 0)) + 
      SUM(COALESCE(mp.total_marketplace_revenue, 0)) + 
      SUM(COALESCE(wl.total_white_label_revenue, 0))
    ) > 0
    THEN (
      (
        SUM(COALESCE(s.base_price_cents, 0)) + 
        SUM(COALESCE(premium_rev.total_premium_cents, 0)) + 
        SUM(COALESCE(mp.total_marketplace_revenue, 0)) + 
        SUM(COALESCE(wl.total_white_label_revenue, 0))
      ) - 20000
    ) * 100.0 / (
      SUM(COALESCE(s.base_price_cents, 0)) + 
      SUM(COALESCE(premium_rev.total_premium_cents, 0)) + 
      SUM(COALESCE(mp.total_marketplace_revenue, 0)) + 
      SUM(COALESCE(wl.total_white_label_revenue, 0))
    )
    ELSE 0
  END as profit_margin_percent
FROM users u
LEFT JOIN subscriptions s ON u.id = s.customer_id AND s.status = 'active'
LEFT JOIN (
  SELECT customer_id, SUM(price_cents) as total_premium_cents
  FROM premium_features
  WHERE active = true
  GROUP BY customer_id
) premium_rev ON u.id = premium_rev.customer_id
LEFT JOIN (
  SELECT SUM(price_cents) as total_marketplace_revenue
  FROM marketplace_subscriptions
  WHERE status = 'active'
) mp ON true
LEFT JOIN (
  SELECT SUM(monthly_commission_cents) as total_white_label_revenue
  FROM white_label_partners
  WHERE status = 'active'
) wl ON true;

COMMENT ON VIEW profitability_dashboard IS 'Real-time profitability metrics including all revenue streams';

-- ============================================================================
-- GRANTS
-- ============================================================================

GRANT SELECT, INSERT, UPDATE ON value_multipliers TO backend_service;
GRANT SELECT, INSERT ON ad_performance TO backend_service;
GRANT SELECT, INSERT, UPDATE ON waterfall_configs TO backend_service;
GRANT SELECT, INSERT, UPDATE, DELETE ON premium_features TO backend_service;
GRANT SELECT, INSERT, UPDATE ON upsell_opportunities TO backend_service;
GRANT SELECT, INSERT, UPDATE ON marketplace_products TO backend_service;
GRANT SELECT, INSERT, UPDATE ON marketplace_subscriptions TO backend_service;
GRANT SELECT, INSERT, UPDATE ON white_label_partners TO backend_service;
GRANT SELECT, INSERT, UPDATE ON white_label_opportunities TO backend_service;
GRANT SELECT, INSERT ON pricing_recommendations TO backend_service;
GRANT SELECT, INSERT ON analytics_views TO backend_service;
GRANT EXECUTE ON FUNCTION calculate_revenue_per_customer TO backend_service;
GRANT SELECT ON profitability_dashboard TO backend_service;

-- ============================================================================
-- SUMMARY
-- ============================================================================

-- Tables Created: 11
--   1. value_multipliers (network effects tracking)
--   2. ad_performance (granular performance data)
--   3. waterfall_configs (optimized configurations)
--   4. premium_features (feature subscriptions)
--   5. upsell_opportunities (automated upsells)
--   6. marketplace_products (data products catalog)
--   7. marketplace_subscriptions (data product sales)
--   8. white_label_partners (reseller partnerships)
--   9. white_label_opportunities (potential partners)
--   10. pricing_recommendations (dynamic pricing)
--   11. analytics_views (usage tracking)
--
-- Functions Created: 1
--   1. calculate_revenue_per_customer (total revenue breakdown)
--
-- Views Created: 1
--   1. profitability_dashboard (real-time metrics)
--
-- Value Multipliers:
--   1. Network Effects: 10-25% eCPM increase at scale
--   2. Data Optimization: 15% revenue increase from aggregate insights
--   3. Premium Features: $50-500/month per customer
--   4. Marketplace: $999/month × 10-20 ad network subscribers = $10K-20K/month
--   5. White Label: 40% commission on reseller revenue
--
-- Profitability Trajectory:
--   10 customers: $150/customer = $1,500 MRR (base only)
--   50 customers: $180/customer = $9,000 MRR (+ network effects)
--   100 customers: $220/customer = $22,000 MRR (+ premiums + marketplace)
--   500 customers: $300/customer = $150,000 MRR (+ white label + all multipliers)
--
-- Profit Margin: 95%+ (costs stay at $200/month regardless of customer count)
