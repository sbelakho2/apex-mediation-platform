-- Migration 013: Automated Growth Engine
-- Customer health scoring, churn prediction, growth opportunities, and automated interventions

CREATE TABLE IF NOT EXISTS customer_health_scores (
    customer_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    health_score INTEGER NOT NULL CHECK (health_score BETWEEN 0 AND 100),
    churn_risk VARCHAR(20) NOT NULL CHECK (churn_risk IN ('low', 'medium', 'high')),
    predicted_churn_date DATE,
    intervention_recommended BOOLEAN DEFAULT false,
    last_intervention_date DATE,
    intervention_count INTEGER DEFAULT 0,
    calculated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Health score components (for transparency)
    usage_score INTEGER DEFAULT 0,
    engagement_score INTEGER DEFAULT 0,
    payment_health_score INTEGER DEFAULT 0,
    support_score INTEGER DEFAULT 0,
    
    INDEX idx_customer_health_risk (churn_risk),
    INDEX idx_customer_health_score (health_score),
    INDEX idx_customer_health_intervention (intervention_recommended),
    INDEX idx_customer_health_calculated (calculated_at)
);

CREATE TABLE IF NOT EXISTS churn_predictions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    prediction_date DATE NOT NULL DEFAULT CURRENT_DATE,
    predicted_churn_date DATE NOT NULL,
    confidence_score DECIMAL(3,2) NOT NULL CHECK (confidence_score BETWEEN 0 AND 1),
    contributing_factors JSONB DEFAULT '[]',
    recommended_interventions JSONB DEFAULT '[]',
    prediction_accuracy DECIMAL(3,2), -- Filled after churn date passes
    model_version VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    INDEX idx_churn_customer (customer_id),
    INDEX idx_churn_predicted_date (predicted_churn_date),
    INDEX idx_churn_confidence (confidence_score)
);

CREATE TABLE IF NOT EXISTS churn_interventions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    intervention_type VARCHAR(50) NOT NULL CHECK (intervention_type IN (
        'discount_offer',
        'engagement_email',
        'founder_call',
        'feature_education',
        'success_story_share',
        'upgrade_offer',
        'referral_incentive'
    )),
    triggered_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    health_score_at_trigger INTEGER NOT NULL,
    intervention_details JSONB DEFAULT '{}',
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'accepted', 'declined', 'ignored')),
    response_date TIMESTAMP WITH TIME ZONE,
    success BOOLEAN,
    churn_prevented BOOLEAN,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    INDEX idx_churn_intervention_customer (customer_id),
    INDEX idx_churn_intervention_type (intervention_type),
    INDEX idx_churn_intervention_status (status),
    INDEX idx_churn_intervention_success (success)
);

CREATE TABLE IF NOT EXISTS growth_opportunities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    opportunity_type VARCHAR(50) NOT NULL CHECK (opportunity_type IN (
        'upgrade',
        'expansion',
        'referral',
        'case_study',
        'testimonial',
        'partnership'
    )),
    likelihood DECIMAL(3,2) NOT NULL CHECK (likelihood BETWEEN 0 AND 1),
    expected_value_cents INTEGER NOT NULL,
    automated_action TEXT NOT NULL,
    status VARCHAR(20) DEFAULT 'identified' CHECK (status IN ('identified', 'actioned', 'converted', 'missed')),
    identified_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    actioned_at TIMESTAMP WITH TIME ZONE,
    converted_at TIMESTAMP WITH TIME ZONE,
    actual_value_cents INTEGER,
    opportunity_details JSONB DEFAULT '{}',
    
    INDEX idx_growth_customer (customer_id),
    INDEX idx_growth_type (opportunity_type),
    INDEX idx_growth_status (status),
    INDEX idx_growth_likelihood (likelihood)
);

CREATE TABLE IF NOT EXISTS customer_journey_stages (
    customer_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    current_stage VARCHAR(50) NOT NULL CHECK (current_stage IN (
        'trial',
        'onboarding',
        'activation',
        'growth',
        'retention',
        'expansion',
        'at_risk',
        'churned'
    )),
    previous_stage VARCHAR(50),
    stage_entered_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    stage_duration_days INTEGER DEFAULT 0,
    next_best_action TEXT,
    personalization_data JSONB DEFAULT '{}',
    milestone_progress JSONB DEFAULT '{}',
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    INDEX idx_journey_stage (current_stage),
    INDEX idx_journey_entered (stage_entered_at)
);

CREATE TABLE IF NOT EXISTS onboarding_experiments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    experiment_name VARCHAR(100) NOT NULL,
    variant_name VARCHAR(50) NOT NULL,
    start_date DATE NOT NULL DEFAULT CURRENT_DATE,
    end_date DATE,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed')),
    
    -- Metrics
    customers_enrolled INTEGER DEFAULT 0,
    customers_activated INTEGER DEFAULT 0,
    activation_rate DECIMAL(5,2) DEFAULT 0,
    avg_time_to_activation_hours DECIMAL(8,2) DEFAULT 0,
    winning_variant BOOLEAN DEFAULT false,
    
    experiment_config JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    INDEX idx_onboarding_exp_status (status),
    INDEX idx_onboarding_exp_name (experiment_name),
    UNIQUE (experiment_name, variant_name)
);

CREATE TABLE IF NOT EXISTS customer_experiment_assignments (
    customer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    experiment_id UUID NOT NULL REFERENCES onboarding_experiments(id) ON DELETE CASCADE,
    assigned_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    activated BOOLEAN DEFAULT false,
    activated_at TIMESTAMP WITH TIME ZONE,
    
    PRIMARY KEY (customer_id, experiment_id),
    INDEX idx_experiment_assignment_customer (customer_id)
);

CREATE TABLE IF NOT EXISTS success_story_captures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    milestone_achieved VARCHAR(100) NOT NULL,
    achievement_date DATE NOT NULL DEFAULT CURRENT_DATE,
    metrics_at_capture JSONB DEFAULT '{}',
    testimonial_requested BOOLEAN DEFAULT false,
    testimonial_received BOOLEAN DEFAULT false,
    testimonial_text TEXT,
    permission_to_publish BOOLEAN DEFAULT false,
    published_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    INDEX idx_success_customer (customer_id),
    INDEX idx_success_milestone (milestone_achieved),
    INDEX idx_success_published (published_at)
);

CREATE TABLE IF NOT EXISTS viral_loop_performance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    loop_type VARCHAR(50) NOT NULL CHECK (loop_type IN (
        'referral_code',
        'social_share',
        'integration_invite',
        'case_study_share',
        'community_contribution'
    )),
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    impressions INTEGER DEFAULT 0,
    clicks INTEGER DEFAULT 0,
    conversions INTEGER DEFAULT 0,
    conversion_rate DECIMAL(5,2) DEFAULT 0,
    optimization_applied BOOLEAN DEFAULT false,
    optimization_details JSONB DEFAULT '{}',
    
    INDEX idx_viral_loop_type (loop_type),
    INDEX idx_viral_loop_date (date),
    UNIQUE (loop_type, date)
);

-- Growth metrics dashboard view
CREATE OR REPLACE VIEW growth_metrics_dashboard AS
SELECT 
    (SELECT COUNT(*) FROM customer_health_scores WHERE churn_risk = 'high') as high_risk_customers,
    (SELECT COUNT(*) FROM customer_health_scores WHERE churn_risk = 'medium') as medium_risk_customers,
    (SELECT COUNT(*) FROM customer_health_scores WHERE health_score < 60 AND intervention_recommended = true) as customers_needing_intervention,
    (SELECT COUNT(*) FROM churn_interventions WHERE triggered_at > NOW() - INTERVAL '7 days') as interventions_last_7d,
    (SELECT COUNT(*) FROM churn_interventions WHERE triggered_at > NOW() - INTERVAL '7 days' AND success = true) as successful_interventions_7d,
    (SELECT COUNT(*) FROM growth_opportunities WHERE status = 'identified') as active_opportunities,
    (SELECT SUM(expected_value_cents) FROM growth_opportunities WHERE status IN ('identified', 'actioned')) as pipeline_value_cents,
    (SELECT COUNT(*) FROM growth_opportunities WHERE converted_at > NOW() - INTERVAL '30 days') as opportunities_converted_30d,
    (SELECT SUM(actual_value_cents) FROM growth_opportunities WHERE converted_at > NOW() - INTERVAL '30 days') as revenue_from_opportunities_30d,
    (SELECT AVG(activation_rate) FROM onboarding_experiments WHERE status = 'active') as avg_activation_rate,
    NOW() as last_updated;

-- Function to auto-update journey stages based on behavior
CREATE OR REPLACE FUNCTION update_customer_journey_stage()
RETURNS TRIGGER AS $$
DECLARE
    current_stage_record RECORD;
    new_stage VARCHAR(50);
BEGIN
    -- Get current stage
    SELECT * INTO current_stage_record 
    FROM customer_journey_stages 
    WHERE customer_id = NEW.customer_id;
    
    -- Determine new stage based on health score
    IF NEW.health_score < 40 THEN
        new_stage := 'at_risk';
    ELSIF NEW.health_score >= 80 AND NEW.churn_risk = 'low' THEN
        new_stage := 'retention';
    ELSE
        new_stage := current_stage_record.current_stage;
    END IF;
    
    -- Update if stage changed
    IF current_stage_record.current_stage != new_stage THEN
        UPDATE customer_journey_stages
        SET current_stage = new_stage,
            previous_stage = current_stage_record.current_stage,
            stage_entered_at = NOW(),
            stage_duration_days = 0
        WHERE customer_id = NEW.customer_id;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_journey_stage
    AFTER INSERT OR UPDATE ON customer_health_scores
    FOR EACH ROW
    EXECUTE FUNCTION update_customer_journey_stage();

-- Function to calculate intervention success rate
CREATE OR REPLACE FUNCTION calculate_intervention_success_rate(
    days_lookback INTEGER DEFAULT 30
)
RETURNS TABLE (
    intervention_type VARCHAR(50),
    total_interventions BIGINT,
    successful_interventions BIGINT,
    success_rate DECIMAL(5,2),
    churn_prevented_count BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ci.intervention_type,
        COUNT(*) as total_interventions,
        COUNT(*) FILTER (WHERE ci.success = true) as successful_interventions,
        (COUNT(*) FILTER (WHERE ci.success = true) * 100.0 / NULLIF(COUNT(*), 0))::DECIMAL(5,2) as success_rate,
        COUNT(*) FILTER (WHERE ci.churn_prevented = true) as churn_prevented_count
    FROM churn_interventions ci
    WHERE ci.triggered_at > NOW() - INTERVAL '1 day' * days_lookback
    GROUP BY ci.intervention_type
    ORDER BY success_rate DESC;
END;
$$ LANGUAGE plpgsql;

COMMENT ON TABLE customer_health_scores IS 'ML-based customer health scoring (0-100) with churn risk prediction';
COMMENT ON TABLE churn_predictions IS 'Time-series churn predictions with confidence scores and contributing factors';
COMMENT ON TABLE churn_interventions IS 'Automated interventions to prevent customer churn (discounts, engagement, calls)';
COMMENT ON TABLE growth_opportunities IS 'Identified growth opportunities: upgrades, expansions, referrals, partnerships';
COMMENT ON TABLE customer_journey_stages IS 'Customer lifecycle stage tracking with personalized next actions';
COMMENT ON TABLE onboarding_experiments IS 'A/B tests for onboarding flow optimization';
COMMENT ON TABLE success_story_captures IS 'Automated capture of customer success milestones for testimonials/case studies';
COMMENT ON TABLE viral_loop_performance IS 'Viral growth loop performance tracking and optimization';
