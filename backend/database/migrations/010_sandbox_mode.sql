-- Migration 010: Sandbox Mode (Cold Start Strategy)
-- Purpose: Enable first customers to test SDK integration before ad networks are connected
-- Tables: sandbox_requests, ad_networks
-- Features: Mock ad responses, sandbox analytics, production-ready detection

-- ============================================================================
-- TABLE: sandbox_requests
-- Purpose: Track test ad requests during sandbox mode
-- ============================================================================

CREATE TABLE IF NOT EXISTS sandbox_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  placement_id VARCHAR(255),
  ad_format VARCHAR(50) NOT NULL CHECK (ad_format IN ('banner', 'interstitial', 'rewarded_video', 'native')),
  platform VARCHAR(50) NOT NULL CHECK (platform IN ('ios', 'android', 'unity')),
  os_version VARCHAR(50),
  device_model VARCHAR(100),
  screen_size VARCHAR(50),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Indexes for sandbox_requests
CREATE INDEX idx_sandbox_requests_customer_id ON sandbox_requests(customer_id);
CREATE INDEX idx_sandbox_requests_created_at ON sandbox_requests(created_at);
CREATE INDEX idx_sandbox_requests_ad_format ON sandbox_requests(ad_format);
CREATE INDEX idx_sandbox_requests_platform ON sandbox_requests(platform);

-- Comments
COMMENT ON TABLE sandbox_requests IS 'Test ad requests during sandbox mode (before live ad networks connected)';
COMMENT ON COLUMN sandbox_requests.customer_id IS 'Customer making test ad request';
COMMENT ON COLUMN sandbox_requests.placement_id IS 'Ad placement identifier from SDK';
COMMENT ON COLUMN sandbox_requests.ad_format IS 'Ad format requested: banner, interstitial, rewarded_video, native';
COMMENT ON COLUMN sandbox_requests.platform IS 'Platform: ios, android, unity';

-- ============================================================================
-- TABLE: ad_networks
-- Purpose: Track ad network partnerships for each customer
-- ============================================================================

CREATE TABLE IF NOT EXISTS ad_networks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  network_name VARCHAR(100) NOT NULL CHECK (network_name IN ('admob', 'unity', 'meta', 'applovin', 'ironsource', 'vungle', 'chartboost', 'pangle', 'mintegral')),
  status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'paused', 'failed')),
  credentials JSONB, -- Encrypted API keys, app IDs, etc.
  configuration JSONB, -- Waterfall position, floor price, etc.
  last_sync_at TIMESTAMP,
  error_message TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(customer_id, network_name)
);

-- Indexes for ad_networks
CREATE INDEX idx_ad_networks_customer_id ON ad_networks(customer_id);
CREATE INDEX idx_ad_networks_status ON ad_networks(status);
CREATE INDEX idx_ad_networks_network_name ON ad_networks(network_name);

-- Comments
COMMENT ON TABLE ad_networks IS 'Ad network partnerships for each customer (AdMob, Unity, Meta, etc.)';
COMMENT ON COLUMN ad_networks.network_name IS 'Ad network identifier: admob, unity, meta, applovin, etc.';
COMMENT ON COLUMN ad_networks.status IS 'pending: setup in progress, active: live ads, paused: temporarily disabled, failed: integration error';
COMMENT ON COLUMN ad_networks.credentials IS 'Encrypted API keys and credentials (JSONB)';
COMMENT ON COLUMN ad_networks.configuration IS 'Waterfall position, floor price, targeting rules (JSONB)';

-- ============================================================================
-- ALTER TABLE: subscriptions (add sandbox_mode flag)
-- ============================================================================

ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS sandbox_mode BOOLEAN DEFAULT false;

COMMENT ON COLUMN subscriptions.sandbox_mode IS 'Manual sandbox mode flag (for testing or troubleshooting)';

-- ============================================================================
-- ALTER TABLE: usage_records (add is_sandbox flag)
-- ============================================================================

ALTER TABLE usage_records ADD COLUMN IF NOT EXISTS is_sandbox BOOLEAN DEFAULT false;

COMMENT ON COLUMN usage_records.is_sandbox IS 'True if usage occurred during sandbox mode (test impressions, not billable)';

-- ============================================================================
-- VIEW: sandbox_readiness
-- Purpose: Identify customers ready to exit sandbox mode
-- ============================================================================

CREATE OR REPLACE VIEW sandbox_readiness AS
SELECT 
  u.id as customer_id,
  u.email,
  u.created_at as account_created_at,
  EXTRACT(DAY FROM NOW() - u.created_at) as account_age_days,
  COUNT(sr.id) as total_test_requests,
  COUNT(DISTINCT sr.ad_format) as unique_formats_tested,
  COUNT(DISTINCT sr.platform) as unique_platforms_tested,
  MAX(sr.created_at) as last_test_request,
  COUNT(an.id) as active_networks,
  CASE 
    WHEN COUNT(sr.id) >= 100 OR EXTRACT(DAY FROM NOW() - u.created_at) >= 7 THEN true
    ELSE false
  END as ready_for_production,
  CASE
    WHEN COUNT(an.id) = 0 AND (COUNT(sr.id) >= 100 OR EXTRACT(DAY FROM NOW() - u.created_at) >= 7) THEN 'Contact founder to set up first ad network'
    WHEN COUNT(sr.id) < 100 THEN FORMAT('Complete %s more test requests', 100 - COUNT(sr.id))
    WHEN EXTRACT(DAY FROM NOW() - u.created_at) < 7 THEN FORMAT('Test for %s more days', 7 - EXTRACT(DAY FROM NOW() - u.created_at))
    ELSE 'Ready for production!'
  END as next_step
FROM users u
LEFT JOIN sandbox_requests sr ON u.id = sr.customer_id
LEFT JOIN ad_networks an ON u.id = an.customer_id AND an.status = 'active'
WHERE EXTRACT(DAY FROM NOW() - u.created_at) < 30 -- Only show customers in first 30 days
GROUP BY u.id, u.email, u.created_at;

COMMENT ON VIEW sandbox_readiness IS 'Customers ready to exit sandbox mode and set up live ad networks';

-- ============================================================================
-- FUNCTION: calculate_cold_start_discount
-- Purpose: Calculate discounted take rate for first 10 customers
-- ============================================================================

CREATE OR REPLACE FUNCTION calculate_cold_start_discount(
  customer_created_at TIMESTAMP,
  revenue_cents INTEGER
)
RETURNS INTEGER AS $$
DECLARE
  account_age_months INTEGER;
  take_rate_percentage DECIMAL;
  take_amount_cents INTEGER;
BEGIN
  -- Calculate account age in months
  account_age_months := EXTRACT(MONTH FROM AGE(NOW(), customer_created_at));
  
  -- Cold start pricing model:
  -- Months 1-2: 0% (free development phase)
  -- Month 3: 5% (50% discount)
  -- Month 4+: 8% (if testimonial provided) or 10% (standard)
  
  IF account_age_months < 2 THEN
    take_rate_percentage := 0.0; -- Free for first 2 months
  ELSIF account_age_months = 2 THEN
    take_rate_percentage := 0.05; -- 5% in month 3
  ELSE
    -- Check if customer provided testimonial (has milestone record)
    IF EXISTS (
      SELECT 1 FROM customer_milestones 
      WHERE milestone_type = 'testimonial_request' 
        AND achieved_at IS NOT NULL
    ) THEN
      take_rate_percentage := 0.08; -- 8% lifetime with testimonial
    ELSE
      take_rate_percentage := 0.10; -- 10% standard
    END IF;
  END IF;
  
  -- Calculate take amount
  take_amount_cents := FLOOR(revenue_cents * take_rate_percentage);
  
  RETURN take_amount_cents;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION calculate_cold_start_discount IS 'Calculate discounted take rate for first 10 customers (cold start pricing)';

-- ============================================================================
-- INSERT: system_config for sandbox mode
-- ============================================================================

INSERT INTO system_config (key, value, description, updated_at)
VALUES 
  ('sandbox_mode', '{"enabled": true, "auto_enable_for_new_customers": true, "max_days": 30, "production_ready_threshold_requests": 100, "production_ready_threshold_days": 7}', 'Sandbox mode configuration for cold start customers', NOW()),
  ('cold_start_pricing', '{"first_10_customers": true, "month_1_2_take_rate": 0.0, "month_3_take_rate": 0.05, "month_4_plus_take_rate": 0.10, "testimonial_discount_rate": 0.08, "testimonial_bonus_months": 999}', 'Cold start pricing model for first customers', NOW()),
  ('ad_network_priority', '{"recommended_first_network": "admob", "recommended_networks": ["admob", "unity", "meta", "applovin", "ironsource"], "integration_time_hours": 4, "testing_time_hours": 2, "go_live_time_hours": 24}', 'Ad network setup recommendations and timelines', NOW()),
  ('founder_notifications', '{"sandbox_ready_enabled": true, "sandbox_ready_throttle_days": 7, "email": "sabel@apexmediation.ee", "phone": "+1234567890", "availability": "Mon-Fri 9am-6pm EST"}', 'Founder notification preferences for customer milestones', NOW())
ON CONFLICT (key) DO NOTHING;

-- ============================================================================
-- INSERT: Sample sandbox ad creatives (for mock responses)
-- ============================================================================

CREATE TABLE IF NOT EXISTS sandbox_creatives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_format VARCHAR(50) NOT NULL,
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  image_url TEXT,
  video_url TEXT,
  duration_seconds INTEGER, -- For video ads
  message TEXT NOT NULL, -- Message shown to developer
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

INSERT INTO sandbox_creatives (ad_format, width, height, image_url, message)
VALUES 
  ('banner', 320, 50, 'https://apexmediation.ee/sandbox/banner/320x50.png', '🧪 Sandbox Mode: Test banner ad (320x50)'),
  ('banner', 300, 250, 'https://apexmediation.ee/sandbox/banner/300x250.png', '🧪 Sandbox Mode: Test banner ad (300x250)'),
  ('banner', 728, 90, 'https://apexmediation.ee/sandbox/banner/728x90.png', '🧪 Sandbox Mode: Test banner ad (728x90 tablet)'),
  ('interstitial', 1920, 1080, 'https://apexmediation.ee/sandbox/interstitial/1920x1080.png', '🧪 Sandbox Mode: Test interstitial ad (full screen)'),
  ('native', 1200, 627, 'https://apexmediation.ee/sandbox/native/1200x627.png', '🧪 Sandbox Mode: Test native ad');

INSERT INTO sandbox_creatives (ad_format, width, height, video_url, duration_seconds, message)
VALUES 
  ('rewarded_video', 1920, 1080, 'https://apexmediation.ee/sandbox/video/rewarded_30s.mp4', 30, '🧪 Sandbox Mode: Test rewarded video (30s)');

COMMENT ON TABLE sandbox_creatives IS 'Mock ad creatives for sandbox mode testing';

-- ============================================================================
-- GRANTS
-- ============================================================================

-- Grant access to backend service user
GRANT SELECT, INSERT, UPDATE, DELETE ON sandbox_requests TO backend_service;
GRANT SELECT, INSERT, UPDATE, DELETE ON ad_networks TO backend_service;
GRANT SELECT ON sandbox_readiness TO backend_service;
GRANT SELECT ON sandbox_creatives TO backend_service;
GRANT EXECUTE ON FUNCTION calculate_cold_start_discount TO backend_service;

-- Grant read-only access to analytics user
GRANT SELECT ON sandbox_requests TO analytics_readonly;
GRANT SELECT ON ad_networks TO analytics_readonly;
GRANT SELECT ON sandbox_readiness TO analytics_readonly;
GRANT SELECT ON sandbox_creatives TO analytics_readonly;

-- ============================================================================
-- SUMMARY
-- ============================================================================

-- Tables Created: 3
--   1. sandbox_requests (test ad requests)
--   2. ad_networks (customer ad network partnerships)
--   3. sandbox_creatives (mock ad images/videos)
--
-- Views Created: 1
--   1. sandbox_readiness (customers ready to exit sandbox)
--
-- Functions Created: 1
--   1. calculate_cold_start_discount (cold start pricing)
--
-- Columns Added: 2
--   1. subscriptions.sandbox_mode (manual sandbox flag)
--   2. usage_records.is_sandbox (test vs live usage)
--
-- Configuration Inserted: 4
--   1. sandbox_mode (auto-enable, thresholds)
--   2. cold_start_pricing (tiered take rates)
--   3. ad_network_priority (recommended setup order)
--   4. founder_notifications (contact info)
--
-- Purpose: Enable Customer #1 to test SDK immediately despite zero ad networks
-- Value: Instant gratification, zero risk, founder white-glove service
-- Timeline: 2 months free sandbox → Month 3 at 5% → Month 4+ at 8-10%
