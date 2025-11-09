-- Migration 014: Influence-Based Sales Automation
-- Based on Cialdini's 6 Principles of Persuasion
-- Tracks campaigns, touchpoints, conversions, and principle effectiveness

-- ============================================================================
-- SALES CAMPAIGNS & JOURNEYS
-- ============================================================================

-- Sales campaigns (trial nurture, upsell, win-back, etc.)
CREATE TABLE IF NOT EXISTS sales_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  campaign_type VARCHAR(50) NOT NULL, -- 'trial_nurture', 'upsell', 'win_back', 'onboarding', 'expansion'
  target_segment JSONB, -- {app_category, tech_stack, company_size, geography}
  active BOOLEAN DEFAULT true,
  start_date TIMESTAMP,
  end_date TIMESTAMP,
  conversion_goal VARCHAR(100), -- 'trial_to_paid', 'upgrade_plan', 'add_feature', 'annual_commitment'
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sales_campaigns_type ON sales_campaigns(campaign_type);
CREATE INDEX IF NOT EXISTS idx_sales_campaigns_active ON sales_campaigns(active);

-- Customer journey stages (tracks where each customer is in sales funnel)
CREATE TABLE IF NOT EXISTS customer_journey_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES publishers(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES sales_campaigns(id) ON DELETE SET NULL,
  current_stage VARCHAR(50) NOT NULL, -- 'signup', 'activation', 'engagement', 'evaluation', 'conversion', 'expansion', 'churned'
  previous_stage VARCHAR(50),
  stage_entered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  days_in_stage INTEGER DEFAULT 0,
  milestone_count INTEGER DEFAULT 0, -- Number of commitments made
  engagement_score INTEGER DEFAULT 0, -- 0-100, based on activity
  conversion_probability DECIMAL(5,2) DEFAULT 0.00, -- ML prediction 0-100
  next_touchpoint_at TIMESTAMP, -- When next automated action should happen
  metadata JSONB, -- Custom tracking data
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE customer_journey_stages
  ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid();

ALTER TABLE customer_journey_stages
  ADD COLUMN IF NOT EXISTS campaign_id UUID;

ALTER TABLE customer_journey_stages
  ADD COLUMN IF NOT EXISTS days_in_stage INTEGER DEFAULT 0;

ALTER TABLE customer_journey_stages
  ADD COLUMN IF NOT EXISTS milestone_count INTEGER DEFAULT 0;

ALTER TABLE customer_journey_stages
  ADD COLUMN IF NOT EXISTS engagement_score INTEGER DEFAULT 0;

ALTER TABLE customer_journey_stages
  ADD COLUMN IF NOT EXISTS conversion_probability DECIMAL(5,2) DEFAULT 0.00;

ALTER TABLE customer_journey_stages
  ADD COLUMN IF NOT EXISTS next_touchpoint_at TIMESTAMP;

ALTER TABLE customer_journey_stages
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

ALTER TABLE customer_journey_stages
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE customer_journey_stages
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE customer_journey_stages
  ALTER COLUMN id SET DEFAULT gen_random_uuid();

UPDATE customer_journey_stages
SET days_in_stage = COALESCE(days_in_stage, stage_duration_days)
WHERE stage_duration_days IS NOT NULL
  AND (days_in_stage IS NULL OR days_in_stage = 0);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'customer_journey_stages' AND column_name = 'customer_id'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_journey_stages_customer ON customer_journey_stages(customer_id);
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'customer_journey_stages' AND column_name = 'current_stage'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_journey_stages_stage ON customer_journey_stages(current_stage);
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'customer_journey_stages' AND column_name = 'next_touchpoint_at'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_journey_stages_next_touchpoint ON customer_journey_stages(next_touchpoint_at);
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'customer_journey_stages' AND column_name = 'conversion_probability'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_journey_stages_probability ON customer_journey_stages(conversion_probability);
  END IF;
END;
$$;

-- ============================================================================
-- TOUCHPOINTS & INFLUENCE TACTICS
-- ============================================================================

-- Campaign touchpoints (emails, in-app messages, notifications)
CREATE TABLE IF NOT EXISTS sales_touchpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES sales_campaigns(id) ON DELETE CASCADE,
  sequence_number INTEGER NOT NULL, -- Order in campaign (1, 2, 3...)
  trigger_condition VARCHAR(100), -- 'day_0', 'day_3', 'milestone_reached', 'feature_used', 'trial_ending'
  channel VARCHAR(50) NOT NULL, -- 'email', 'in_app', 'push', 'sms'
  template_name VARCHAR(255),
  subject_line TEXT, -- For emails
  content_html TEXT,
  content_text TEXT,
  cta_text VARCHAR(255), -- Call to action
  cta_url TEXT,
  
  -- Cialdini Principles Applied
  primary_principle VARCHAR(50), -- 'reciprocity', 'commitment', 'social_proof', 'authority', 'liking', 'scarcity'
  secondary_principle VARCHAR(50),
  principle_tactics JSONB, -- Specific tactics: {free_gift, milestone_celebration, testimonials, etc.}
  
  -- Timing
  send_delay_hours INTEGER DEFAULT 0, -- Delay after trigger
  optimal_send_time TIME, -- Best time of day (e.g., 10:00 AM)
  
  -- Personalization
  personalization_tokens JSONB, -- {customer_name, app_name, revenue_goal, etc.}
  segment_override JSONB, -- Different content for different segments
  
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_touchpoints_campaign ON sales_touchpoints(campaign_id);
CREATE INDEX IF NOT EXISTS idx_touchpoints_trigger ON sales_touchpoints(trigger_condition);
CREATE INDEX IF NOT EXISTS idx_touchpoints_principle ON sales_touchpoints(primary_principle);

-- Touchpoint delivery log (tracks every message sent)
CREATE TABLE IF NOT EXISTS touchpoint_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  touchpoint_id UUID REFERENCES sales_touchpoints(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES publishers(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES sales_campaigns(id) ON DELETE SET NULL,
  
  -- Delivery details
  delivered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  channel VARCHAR(50),
  status VARCHAR(50) DEFAULT 'sent', -- 'sent', 'delivered', 'opened', 'clicked', 'converted', 'bounced', 'unsubscribed'
  
  -- Engagement tracking
  opened_at TIMESTAMP,
  clicked_at TIMESTAMP,
  converted_at TIMESTAMP,
  time_to_open_seconds INTEGER,
  time_to_click_seconds INTEGER,
  time_to_convert_seconds INTEGER,
  
  -- Personalized content
  subject_line TEXT,
  personalized_content JSONB, -- Actual content sent (with tokens replaced)
  
  -- Attribution
  influenced_conversion BOOLEAN DEFAULT false, -- Did this touchpoint lead to conversion?
  conversion_value DECIMAL(10,2), -- Revenue attributed to this touchpoint
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_deliveries_touchpoint ON touchpoint_deliveries(touchpoint_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_customer ON touchpoint_deliveries(customer_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_status ON touchpoint_deliveries(status);
CREATE INDEX IF NOT EXISTS idx_deliveries_delivered_at ON touchpoint_deliveries(delivered_at);

-- ============================================================================
-- INFLUENCE PRINCIPLES TRACKING
-- ============================================================================

-- Reciprocity gifts (track what we give to customers)
CREATE TABLE IF NOT EXISTS reciprocity_gifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES publishers(id) ON DELETE CASCADE,
  gift_type VARCHAR(100) NOT NULL, -- 'free_optimization', 'bonus_features', 'consultation', 'report', 'extended_trial'
  gift_value_usd DECIMAL(10,2), -- Perceived value
  delivered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  -- Gift details
  description TEXT,
  redemption_url TEXT,
  expires_at TIMESTAMP,
  redeemed BOOLEAN DEFAULT false,
  redeemed_at TIMESTAMP,
  
  -- Reciprocity tracking
  reciprocated BOOLEAN DEFAULT false, -- Did customer convert after gift?
  reciprocated_at TIMESTAMP,
  reciprocation_value DECIMAL(10,2), -- Revenue from reciprocation
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_gifts_customer ON reciprocity_gifts(customer_id);
CREATE INDEX IF NOT EXISTS idx_gifts_type ON reciprocity_gifts(gift_type);
CREATE INDEX IF NOT EXISTS idx_gifts_reciprocated ON reciprocity_gifts(reciprocated);

-- Commitment milestones (track customer micro-commitments)
CREATE TABLE IF NOT EXISTS commitment_milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES publishers(id) ON DELETE CASCADE,
  milestone_type VARCHAR(100) NOT NULL, -- 'profile_setup', 'sdk_integration', 'goal_set', 'team_invite', 'feature_used'
  milestone_name VARCHAR(255),
  completed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  -- Commitment details
  effort_level VARCHAR(20), -- 'trivial', 'easy', 'moderate', 'significant'
  time_invested_minutes INTEGER,
  public_commitment BOOLEAN DEFAULT false, -- Was this shared publicly?
  
  -- Consistency tracking
  total_commitments INTEGER DEFAULT 1, -- Running count
  commitment_consistency_score INTEGER, -- 0-100, how consistent are they?
  
  -- Conversion correlation
  led_to_conversion BOOLEAN DEFAULT false,
  conversion_probability_before DECIMAL(5,2),
  conversion_probability_after DECIMAL(5,2),
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_milestones_customer ON commitment_milestones(customer_id);
CREATE INDEX IF NOT EXISTS idx_milestones_type ON commitment_milestones(milestone_type);
CREATE INDEX IF NOT EXISTS idx_milestones_completed ON commitment_milestones(completed_at);

-- Social proof events (track social proof shown to customers)
CREATE TABLE IF NOT EXISTS social_proof_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES publishers(id) ON DELETE CASCADE,
  proof_type VARCHAR(100) NOT NULL, -- 'testimonial', 'case_study', 'usage_stats', 'live_activity', 'community_size'
  shown_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  -- Social proof content
  proof_content JSONB, -- {testimonial_text, customer_name, result_metrics, etc.}
  similarity_score DECIMAL(5,2), -- How similar is the social proof to this customer (0-100)
  specificity_level VARCHAR(20), -- 'generic', 'category', 'similar_size', 'highly_specific'
  
  -- Engagement
  viewed BOOLEAN DEFAULT false,
  viewed_duration_seconds INTEGER,
  clicked_through BOOLEAN DEFAULT false,
  
  -- Effectiveness
  influenced_conversion BOOLEAN DEFAULT false,
  conversion_lift DECIMAL(5,2), -- Percentage increase in conversion probability
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_social_proof_customer ON social_proof_events(customer_id);
CREATE INDEX IF NOT EXISTS idx_social_proof_type ON social_proof_events(proof_type);
CREATE INDEX IF NOT EXISTS idx_social_proof_viewed ON social_proof_events(viewed);

-- Authority signals (track authority-building touchpoints)
CREATE TABLE IF NOT EXISTS authority_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES publishers(id) ON DELETE CASCADE,
  signal_type VARCHAR(100) NOT NULL, -- 'expertise_content', 'credentials', 'data_citation', 'partner_logos', 'certifications'
  shown_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  -- Authority content
  signal_content JSONB, -- {title, source, credibility_indicators, etc.}
  credibility_score INTEGER, -- 0-100, how authoritative is this signal
  
  -- Engagement
  consumed BOOLEAN DEFAULT false, -- Did they read/watch/engage?
  engagement_duration_seconds INTEGER,
  
  -- Trust building
  trust_score_before INTEGER, -- Customer's trust level before (0-100)
  trust_score_after INTEGER, -- After exposure to authority signal
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_authority_customer ON authority_signals(customer_id);
CREATE INDEX IF NOT EXISTS idx_authority_type ON authority_signals(signal_type);

-- Scarcity triggers (track urgency/scarcity messaging)
CREATE TABLE IF NOT EXISTS scarcity_triggers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES publishers(id) ON DELETE CASCADE,
  trigger_type VARCHAR(100) NOT NULL, -- 'trial_ending', 'limited_time_offer', 'limited_spots', 'feature_expiring', 'price_increase'
  activated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NOT NULL,
  
  -- Scarcity details
  scarcity_message TEXT,
  genuine BOOLEAN DEFAULT true, -- Is this real scarcity or manufactured?
  urgency_level VARCHAR(20), -- 'low', 'medium', 'high', 'critical'
  
  -- Visual indicators
  countdown_timer BOOLEAN DEFAULT false,
  visual_emphasis BOOLEAN DEFAULT false,
  
  -- Response
  customer_responded BOOLEAN DEFAULT false,
  responded_at TIMESTAMP,
  response_type VARCHAR(50), -- 'converted', 'extended', 'ignored', 'churned'
  time_to_response_hours DECIMAL(10,2),
  
  -- Effectiveness
  conversion_impact DECIMAL(5,2), -- Percentage impact on conversion probability
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_scarcity_customer ON scarcity_triggers(customer_id);
CREATE INDEX IF NOT EXISTS idx_scarcity_type ON scarcity_triggers(trigger_type);
CREATE INDEX IF NOT EXISTS idx_scarcity_expires ON scarcity_triggers(expires_at);

-- ============================================================================
-- CONVERSION TRACKING & ATTRIBUTION
-- ============================================================================

-- Conversion events (track when customers convert)
CREATE TABLE IF NOT EXISTS sales_conversions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES publishers(id) ON DELETE CASCADE,
  conversion_type VARCHAR(100) NOT NULL, -- 'trial_to_paid', 'plan_upgrade', 'feature_add', 'annual_commitment'
  converted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  -- Conversion value
  mrr_before DECIMAL(10,2),
  mrr_after DECIMAL(10,2),
  mrr_increase DECIMAL(10,2),
  ltv_estimate DECIMAL(10,2),
  
  -- Journey context
  days_in_trial INTEGER,
  touchpoints_received INTEGER,
  milestones_completed INTEGER,
  gifts_received INTEGER,
  
  -- Attribution (which principles influenced this conversion?)
  primary_influence_principle VARCHAR(50),
  principle_scores JSONB, -- {reciprocity: 0.3, commitment: 0.4, social_proof: 0.2, ...}
  winning_touchpoint_id UUID REFERENCES sales_touchpoints(id),
  
  -- Customer sentiment
  confidence_level VARCHAR(20), -- 'very_confident', 'confident', 'uncertain', 'reluctant'
  referral_likelihood INTEGER, -- NPS-style 0-10
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_conversions_customer ON sales_conversions(customer_id);
CREATE INDEX IF NOT EXISTS idx_conversions_type ON sales_conversions(conversion_type);
CREATE INDEX IF NOT EXISTS idx_conversions_converted_at ON sales_conversions(converted_at);
CREATE INDEX IF NOT EXISTS idx_conversions_principle ON sales_conversions(primary_influence_principle);

-- A/B tests for sales optimization
CREATE TABLE IF NOT EXISTS sales_ab_tests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  test_name VARCHAR(255) NOT NULL,
  hypothesis TEXT,
  start_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  end_date TIMESTAMP,
  status VARCHAR(50) DEFAULT 'running', -- 'running', 'completed', 'stopped'
  
  -- Test setup
  control_variant JSONB, -- Original version
  test_variant JSONB, -- New version
  test_element VARCHAR(100), -- 'subject_line', 'cta_copy', 'principle_order', 'timing', 'offer'
  
  -- Results
  control_conversions INTEGER DEFAULT 0,
  control_total INTEGER DEFAULT 0,
  test_conversions INTEGER DEFAULT 0,
  test_total INTEGER DEFAULT 0,
  confidence_level DECIMAL(5,2), -- Statistical confidence 0-100
  winner VARCHAR(20), -- 'control', 'test', 'inconclusive'
  
  -- Learnings
  impact_percentage DECIMAL(5,2),
  recommendation TEXT,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ab_tests_status ON sales_ab_tests(status);
CREATE INDEX IF NOT EXISTS idx_ab_tests_element ON sales_ab_tests(test_element);

-- Customer segments (for personalization)
CREATE TABLE IF NOT EXISTS customer_segments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES publishers(id) ON DELETE CASCADE,
  
  -- Demographic segments
  app_category VARCHAR(100), -- 'gaming', 'utility', 'education', etc.
  company_size VARCHAR(50), -- 'solo', 'small_team', 'startup', 'enterprise'
  geography VARCHAR(100),
  tech_stack VARCHAR(100), -- 'unity', 'react_native', 'flutter', etc.
  
  -- Behavioral segments
  engagement_level VARCHAR(50), -- 'highly_engaged', 'moderately_engaged', 'low_engagement'
  price_sensitivity VARCHAR(50), -- 'price_conscious', 'value_focused', 'premium_buyer'
  decision_making_style VARCHAR(50), -- 'data_driven', 'emotion_driven', 'social_validation_seeker'
  
  -- Best principles for this segment
  most_effective_principle VARCHAR(50),
  principle_preferences JSONB, -- {reciprocity: 0.8, scarcity: 0.6, ...}
  
  -- Communication preferences
  preferred_channel VARCHAR(50), -- 'email', 'in_app', 'both'
  optimal_send_time TIME,
  message_frequency VARCHAR(50), -- 'high', 'medium', 'low'
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE customer_segments
  ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid();

ALTER TABLE customer_segments
  ADD COLUMN IF NOT EXISTS customer_id UUID;

ALTER TABLE customer_segments
  ADD COLUMN IF NOT EXISTS app_category VARCHAR(100);

ALTER TABLE customer_segments
  ADD COLUMN IF NOT EXISTS company_size VARCHAR(50);

ALTER TABLE customer_segments
  ADD COLUMN IF NOT EXISTS geography VARCHAR(100);

ALTER TABLE customer_segments
  ADD COLUMN IF NOT EXISTS tech_stack VARCHAR(100);

ALTER TABLE customer_segments
  ADD COLUMN IF NOT EXISTS engagement_level VARCHAR(50);

ALTER TABLE customer_segments
  ADD COLUMN IF NOT EXISTS price_sensitivity VARCHAR(50);

ALTER TABLE customer_segments
  ADD COLUMN IF NOT EXISTS decision_making_style VARCHAR(50);

ALTER TABLE customer_segments
  ADD COLUMN IF NOT EXISTS most_effective_principle VARCHAR(50);

ALTER TABLE customer_segments
  ADD COLUMN IF NOT EXISTS principle_preferences JSONB;

ALTER TABLE customer_segments
  ADD COLUMN IF NOT EXISTS preferred_channel VARCHAR(50);

ALTER TABLE customer_segments
  ADD COLUMN IF NOT EXISTS optimal_send_time TIME;

ALTER TABLE customer_segments
  ADD COLUMN IF NOT EXISTS message_frequency VARCHAR(50);

ALTER TABLE customer_segments
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE customer_segments
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE customer_segments
  ALTER COLUMN id SET DEFAULT gen_random_uuid();

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'customer_segments' AND column_name = 'customer_id'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_segments_customer ON customer_segments(customer_id);
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'customer_segments' AND column_name = 'app_category'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_segments_category ON customer_segments(app_category);
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'customer_segments' AND column_name = 'engagement_level'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_segments_engagement ON customer_segments(engagement_level);
  END IF;
END;
$$;

-- ============================================================================
-- ANALYTICS VIEWS
-- ============================================================================

-- Campaign performance summary
CREATE OR REPLACE VIEW sales_campaign_performance AS
SELECT 
  c.id,
  c.name,
  c.campaign_type,
  COUNT(DISTINCT cjs.customer_id) as customers_enrolled,
  COUNT(DISTINCT CASE WHEN sc.id IS NOT NULL THEN sc.customer_id END) as customers_converted,
  ROUND(
    COUNT(DISTINCT CASE WHEN sc.id IS NOT NULL THEN sc.customer_id END)::NUMERIC / 
    NULLIF(COUNT(DISTINCT cjs.customer_id), 0) * 100, 
    2
  ) as conversion_rate,
  AVG(sc.mrr_increase) as avg_revenue_increase,
  SUM(sc.mrr_increase) as total_revenue_impact,
  AVG(td.time_to_convert_seconds / 3600.0) as avg_hours_to_convert,
  COUNT(DISTINCT td.id) as total_touchpoints_sent,
  AVG(CASE WHEN td.status = 'opened' THEN 1 ELSE 0 END) as avg_open_rate,
  AVG(CASE WHEN td.status = 'clicked' THEN 1 ELSE 0 END) as avg_click_rate
FROM sales_campaigns c
LEFT JOIN customer_journey_stages cjs ON cjs.campaign_id = c.id
LEFT JOIN sales_conversions sc ON sc.customer_id = cjs.customer_id
LEFT JOIN touchpoint_deliveries td ON td.campaign_id = c.id
WHERE c.active = true
GROUP BY c.id, c.name, c.campaign_type;

-- Principle effectiveness (which principles drive conversions)
CREATE OR REPLACE VIEW principle_effectiveness AS
SELECT 
  st.primary_principle,
  COUNT(DISTINCT td.id) as times_used,
  COUNT(DISTINCT CASE WHEN td.status = 'opened' THEN td.id END) as opens,
  COUNT(DISTINCT CASE WHEN td.status = 'clicked' THEN td.id END) as clicks,
  COUNT(DISTINCT CASE WHEN td.influenced_conversion THEN td.id END) as conversions,
  ROUND(
    COUNT(DISTINCT CASE WHEN td.influenced_conversion THEN td.id END)::NUMERIC /
    NULLIF(COUNT(DISTINCT td.id), 0) * 100,
    2
  ) as conversion_rate,
  SUM(td.conversion_value) as total_revenue_attributed,
  AVG(td.conversion_value) as avg_revenue_per_conversion
FROM sales_touchpoints st
LEFT JOIN touchpoint_deliveries td ON td.touchpoint_id = st.id
WHERE st.active = true
GROUP BY st.primary_principle
ORDER BY conversion_rate DESC;

-- Customer journey funnel
CREATE OR REPLACE VIEW sales_funnel AS
SELECT 
  current_stage,
  COUNT(DISTINCT customer_id) as customer_count,
  AVG(days_in_stage) as avg_days_in_stage,
  AVG(engagement_score) as avg_engagement_score,
  AVG(conversion_probability) as avg_conversion_probability,
  AVG(milestone_count) as avg_milestones_completed
FROM customer_journey_stages
WHERE current_stage != 'churned'
GROUP BY current_stage
ORDER BY 
  CASE current_stage
    WHEN 'signup' THEN 1
    WHEN 'activation' THEN 2
    WHEN 'engagement' THEN 3
    WHEN 'evaluation' THEN 4
    WHEN 'conversion' THEN 5
    WHEN 'expansion' THEN 6
  END;

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Calculate customer engagement score (0-100)
CREATE OR REPLACE FUNCTION calculate_engagement_score(p_customer_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_score INTEGER := 0;
  v_days_since_signup INTEGER;
  v_touchpoints_opened INTEGER;
  v_features_used INTEGER;
  v_milestones_completed INTEGER;
BEGIN
  -- Get days since signup
  SELECT EXTRACT(DAY FROM NOW() - created_at)
  INTO v_days_since_signup
  FROM publishers
  WHERE id = p_customer_id;
  
  -- Count touchpoints opened
  SELECT COUNT(*)
  INTO v_touchpoints_opened
  FROM touchpoint_deliveries
  WHERE customer_id = p_customer_id
    AND status IN ('opened', 'clicked', 'converted');
  
  -- Count features used (from usage_records)
  SELECT COUNT(DISTINCT feature_used)
  INTO v_features_used
  FROM usage_records
  WHERE customer_id = p_customer_id
    AND created_at > NOW() - INTERVAL '7 days';
  
  -- Count milestones completed
  SELECT COUNT(*)
  INTO v_milestones_completed
  FROM commitment_milestones
  WHERE customer_id = p_customer_id;
  
  -- Calculate score (max 100)
  v_score := LEAST(100, 
    (v_touchpoints_opened * 5) +
    (v_features_used * 10) +
    (v_milestones_completed * 15) +
    (CASE WHEN v_days_since_signup <= 7 THEN 20 ELSE 10 END)
  );
  
  RETURN v_score;
END;
$$ LANGUAGE plpgsql;

-- Predict conversion probability using commitment count + engagement
CREATE OR REPLACE FUNCTION predict_conversion_probability(p_customer_id UUID)
RETURNS DECIMAL AS $$
DECLARE
  v_probability DECIMAL(5,2) := 0.00;
  v_engagement_score INTEGER;
  v_milestone_count INTEGER;
  v_days_in_trial INTEGER;
  v_gifts_received INTEGER;
BEGIN
  -- Get engagement score
  v_engagement_score := calculate_engagement_score(p_customer_id);
  
  -- Get milestone count
  SELECT COUNT(*)
  INTO v_milestone_count
  FROM commitment_milestones
  WHERE customer_id = p_customer_id;
  
  -- Get days in trial
  SELECT EXTRACT(DAY FROM NOW() - created_at)
  INTO v_days_in_trial
  FROM publishers
  WHERE id = p_customer_id;
  
  -- Get gifts received
  SELECT COUNT(*)
  INTO v_gifts_received
  FROM reciprocity_gifts
  WHERE customer_id = p_customer_id
    AND redeemed = true;
  
  -- Simple probability model
  -- Base: 20% (industry average)
  -- +3% per milestone (commitment)
  -- +0.5% per engagement point
  -- +5% per gift redeemed (reciprocity)
  -- -2% per day (trial decay)
  
  v_probability := LEAST(95.00, GREATEST(5.00,
    20.00 +
    (v_milestone_count * 3.00) +
    (v_engagement_score * 0.5) +
    (v_gifts_received * 5.00) -
    (v_days_in_trial * 0.5)
  ));
  
  RETURN v_probability;
END;
$$ LANGUAGE plpgsql;

-- Auto-advance customer journey stage based on behavior
CREATE OR REPLACE FUNCTION update_journey_stage()
RETURNS TRIGGER AS $$
BEGIN
  -- Update engagement score
  UPDATE customer_journey_stages
  SET 
    engagement_score = calculate_engagement_score(NEW.customer_id),
    conversion_probability = predict_conversion_probability(NEW.customer_id),
    updated_at = NOW()
  WHERE customer_id = NEW.customer_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_journey_on_milestone ON commitment_milestones;
CREATE TRIGGER update_journey_on_milestone
AFTER INSERT ON commitment_milestones
FOR EACH ROW
EXECUTE FUNCTION update_journey_stage();

-- Trigger: Update journey stage when gifts are redeemed
DROP TRIGGER IF EXISTS update_journey_on_gift_redemption ON reciprocity_gifts;
CREATE TRIGGER update_journey_on_gift_redemption
AFTER UPDATE OF redeemed ON reciprocity_gifts
FOR EACH ROW
WHEN (NEW.redeemed = true AND OLD.redeemed = false)
EXECUTE FUNCTION update_journey_stage();

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE sales_campaigns IS 'Automated sales campaigns based on Cialdini principles';
COMMENT ON TABLE customer_journey_stages IS 'Tracks customer progress through sales funnel';
COMMENT ON TABLE sales_touchpoints IS 'Email/in-app touchpoints with psychological principles';
COMMENT ON TABLE touchpoint_deliveries IS 'Log of every message sent with engagement tracking';
COMMENT ON TABLE reciprocity_gifts IS 'Tracks gifts given to customers (reciprocity principle)';
COMMENT ON TABLE commitment_milestones IS 'Tracks customer micro-commitments (consistency principle)';
COMMENT ON TABLE social_proof_events IS 'Tracks social proof shown to customers';
COMMENT ON TABLE authority_signals IS 'Tracks authority-building content exposure';
COMMENT ON TABLE scarcity_triggers IS 'Tracks urgency/scarcity messaging';
COMMENT ON TABLE sales_conversions IS 'Conversion events with principle attribution';
COMMENT ON TABLE sales_ab_tests IS 'A/B tests for optimizing sales tactics';
COMMENT ON TABLE customer_segments IS 'Customer segmentation for personalization';
