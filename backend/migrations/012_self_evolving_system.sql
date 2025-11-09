-- Migration 012: Self-Evolving System Infrastructure
-- AI-driven system monitoring, optimization queue, incident tracking, and evolution logging

CREATE TABLE IF NOT EXISTS system_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    metric_name VARCHAR(100) NOT NULL,
    metric_value DECIMAL(12,4) NOT NULL,
    metric_unit VARCHAR(50),
    severity VARCHAR(20) DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'critical')),
    threshold_value DECIMAL(12,4),
    trend VARCHAR(20) DEFAULT 'stable' CHECK (trend IN ('improving', 'stable', 'degrading')),
    recorded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    metadata JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_system_metrics_name ON system_metrics (metric_name);
CREATE INDEX IF NOT EXISTS idx_system_metrics_severity ON system_metrics (severity);
CREATE INDEX IF NOT EXISTS idx_system_metrics_recorded ON system_metrics (recorded_at);

CREATE TABLE IF NOT EXISTS optimization_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    optimization_area VARCHAR(100) NOT NULL,
    current_performance TEXT NOT NULL,
    proposed_change TEXT NOT NULL,
    expected_improvement TEXT NOT NULL,
    confidence_score DECIMAL(3,2) NOT NULL CHECK (confidence_score BETWEEN 0 AND 1),
    auto_applied BOOLEAN DEFAULT false,
    applied_at TIMESTAMP WITH TIME ZONE,
    approved_by VARCHAR(255),
    approval_status VARCHAR(20) DEFAULT 'pending' CHECK (approval_status IN ('pending', 'approved', 'rejected', 'applied')),
    metrics_before JSONB DEFAULT '{}',
    metrics_after JSONB DEFAULT '{}',
    rollback_available BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_optimization_status ON optimization_queue (approval_status);
CREATE INDEX IF NOT EXISTS idx_optimization_confidence ON optimization_queue (confidence_score);
CREATE INDEX IF NOT EXISTS idx_optimization_auto_applied ON optimization_queue (auto_applied);
CREATE INDEX IF NOT EXISTS idx_optimization_created ON optimization_queue (created_at);

CREATE TABLE IF NOT EXISTS incidents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    incident_type VARCHAR(100) NOT NULL,
    severity VARCHAR(20) NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    description TEXT NOT NULL,
    affected_service VARCHAR(100),
    affected_customers INTEGER DEFAULT 0,
    detected_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP WITH TIME ZONE,
    resolution_time_minutes INTEGER,
    auto_resolved BOOLEAN DEFAULT false,
    resolution_description TEXT,
    status VARCHAR(20) DEFAULT 'open' CHECK (status IN ('open', 'investigating', 'resolved', 'false_positive')),
    metrics_at_detection JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_incidents_status ON incidents (status);
CREATE INDEX IF NOT EXISTS idx_incidents_severity ON incidents (severity);
CREATE INDEX IF NOT EXISTS idx_incidents_detected ON incidents (detected_at);
CREATE INDEX IF NOT EXISTS idx_incidents_service ON incidents (affected_service);

CREATE TABLE IF NOT EXISTS evolution_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    change_type VARCHAR(100) NOT NULL,
    change_description TEXT NOT NULL,
    metrics_before JSONB DEFAULT '{}',
    metrics_after JSONB DEFAULT '{}',
    success BOOLEAN NOT NULL,
    error_message TEXT,
    confidence_score DECIMAL(3,2),
    applied_by VARCHAR(50) DEFAULT 'ai_agent',
    rollback_id UUID REFERENCES evolution_log(id),
    rolled_back BOOLEAN DEFAULT false,
    rolled_back_at TIMESTAMP WITH TIME ZONE,
    applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_evolution_type ON evolution_log (change_type);
CREATE INDEX IF NOT EXISTS idx_evolution_success ON evolution_log (success);
CREATE INDEX IF NOT EXISTS idx_evolution_applied ON evolution_log (applied_at);
CREATE INDEX IF NOT EXISTS idx_evolution_rollback ON evolution_log (rollback_id);

CREATE TABLE IF NOT EXISTS predictive_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    alert_type VARCHAR(100) NOT NULL,
    predicted_issue TEXT NOT NULL,
    predicted_date DATE NOT NULL,
    confidence_score DECIMAL(3,2) NOT NULL CHECK (confidence_score BETWEEN 0 AND 1),
    recommended_action TEXT NOT NULL,
    severity VARCHAR(20) DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high')),
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'dismissed', 'actioned', 'false_positive')),
    actioned_at TIMESTAMP WITH TIME ZONE,
    action_taken TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_predictive_status ON predictive_alerts (status);
CREATE INDEX IF NOT EXISTS idx_predictive_date ON predictive_alerts (predicted_date);
CREATE INDEX IF NOT EXISTS idx_predictive_severity ON predictive_alerts (severity);

CREATE TABLE IF NOT EXISTS infrastructure_scaling_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    resource_type VARCHAR(50) NOT NULL,
    action VARCHAR(20) NOT NULL CHECK (action IN ('scale_up', 'scale_down', 'no_action')),
    trigger_reason TEXT NOT NULL,
    previous_capacity JSONB DEFAULT '{}',
    new_capacity JSONB DEFAULT '{}',
    auto_scaled BOOLEAN DEFAULT false,
    estimated_cost_impact_cents INTEGER DEFAULT 0,
    actual_cost_impact_cents INTEGER,
    success BOOLEAN NOT NULL,
    error_message TEXT,
    scaled_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_scaling_resource ON infrastructure_scaling_events (resource_type);
CREATE INDEX IF NOT EXISTS idx_scaling_action ON infrastructure_scaling_events (action);
CREATE INDEX IF NOT EXISTS idx_scaling_scaled ON infrastructure_scaling_events (scaled_at);

CREATE TABLE IF NOT EXISTS ai_learning_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    learning_area VARCHAR(100) NOT NULL,
    pattern_identified TEXT NOT NULL,
    success_rate DECIMAL(5,2) NOT NULL CHECK (success_rate BETWEEN 0 AND 100),
    sample_size INTEGER NOT NULL,
    confidence_improved_by DECIMAL(5,2) DEFAULT 0,
    model_version VARCHAR(50),
    learned_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ai_learning_area ON ai_learning_history (learning_area);
CREATE INDEX IF NOT EXISTS idx_ai_learning_success ON ai_learning_history (success_rate);
CREATE INDEX IF NOT EXISTS idx_ai_learning_learned ON ai_learning_history (learned_at);

CREATE TABLE IF NOT EXISTS capacity_forecasts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    resource_type VARCHAR(50) NOT NULL,
    forecast_date DATE NOT NULL,
    predicted_usage DECIMAL(12,2) NOT NULL,
    current_capacity DECIMAL(12,2) NOT NULL,
    capacity_utilization_percent DECIMAL(5,2) NOT NULL,
    recommendation TEXT NOT NULL,
    confidence_score DECIMAL(3,2) NOT NULL CHECK (confidence_score BETWEEN 0 AND 1),
    forecasted_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_capacity_resource ON capacity_forecasts (resource_type);
CREATE INDEX IF NOT EXISTS idx_capacity_date ON capacity_forecasts (forecast_date);
CREATE INDEX IF NOT EXISTS idx_capacity_utilization ON capacity_forecasts (capacity_utilization_percent);

CREATE TABLE IF NOT EXISTS system_health_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    overall_health_score INTEGER NOT NULL CHECK (overall_health_score BETWEEN 0 AND 100),
    active_incidents INTEGER DEFAULT 0,
    pending_optimizations INTEGER DEFAULT 0,
    avg_response_time_ms INTEGER DEFAULT 0,
    error_rate_percent DECIMAL(5,2) DEFAULT 0,
    customer_health_distribution JSONB DEFAULT '{}',
    revenue_health JSONB DEFAULT '{}',
    infrastructure_health JSONB DEFAULT '{}',
    snapshot_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_health_score ON system_health_snapshots (overall_health_score);
CREATE INDEX IF NOT EXISTS idx_health_snapshot ON system_health_snapshots (snapshot_at);

-- Real-time system health dashboard view
CREATE OR REPLACE VIEW system_health_dashboard AS
SELECT 
    (SELECT overall_health_score FROM system_health_snapshots ORDER BY snapshot_at DESC LIMIT 1) as current_health_score,
    (SELECT COUNT(*) FROM incidents WHERE status IN ('open', 'investigating')) as active_incidents,
    (SELECT COUNT(*) FROM optimization_queue WHERE approval_status = 'pending') as pending_optimizations,
    (SELECT AVG(metric_value)::INTEGER FROM system_metrics WHERE metric_name = 'api_avg_response_time_ms' AND recorded_at > NOW() - INTERVAL '5 minutes') as avg_response_time_ms,
    (SELECT AVG(metric_value)::DECIMAL(5,2) FROM system_metrics WHERE metric_name = 'api_error_rate_percent' AND recorded_at > NOW() - INTERVAL '5 minutes') as error_rate_percent,
    (SELECT COUNT(*) FROM evolution_log WHERE applied_at > NOW() - INTERVAL '24 hours' AND success = true) as successful_evolutions_24h,
    (SELECT COUNT(*) FROM evolution_log WHERE applied_at > NOW() - INTERVAL '24 hours' AND success = false) as failed_evolutions_24h,
    (SELECT COUNT(*) FROM predictive_alerts WHERE status = 'active' AND severity IN ('high', 'critical')) as critical_predictions,
    NOW() as last_updated;

-- Function to auto-resolve incidents when metrics return to normal
CREATE OR REPLACE FUNCTION auto_resolve_incidents()
RETURNS TRIGGER AS $$
BEGIN
    -- If incident was about high response time and it's now normal
    IF NEW.metric_name = 'api_avg_response_time_ms' AND NEW.metric_value < NEW.threshold_value THEN
        UPDATE incidents 
        SET status = 'resolved',
            auto_resolved = true,
            resolved_at = NOW(),
            resolution_time_minutes = EXTRACT(EPOCH FROM (NOW() - detected_at))/60,
            resolution_description = 'Metric returned to normal threshold'
        WHERE incident_type LIKE '%response_time%'
          AND status = 'open'
          AND detected_at > NOW() - INTERVAL '1 hour';
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_auto_resolve_incidents
    AFTER INSERT ON system_metrics
    FOR EACH ROW
    EXECUTE FUNCTION auto_resolve_incidents();

-- Function to calculate overall system health score
CREATE OR REPLACE FUNCTION calculate_system_health_score()
RETURNS INTEGER AS $$
DECLARE
    health_score INTEGER := 100;
    active_critical_incidents INTEGER;
    pending_high_confidence_opts INTEGER;
    avg_response_time INTEGER;
    error_rate DECIMAL(5,2);
BEGIN
    -- Deduct for active incidents
    SELECT COUNT(*) INTO active_critical_incidents 
    FROM incidents 
    WHERE status IN ('open', 'investigating') AND severity IN ('high', 'critical');
    health_score := health_score - (active_critical_incidents * 10);
    
    -- Deduct for pending optimizations (suggests degradation)
    SELECT COUNT(*) INTO pending_high_confidence_opts 
    FROM optimization_queue 
    WHERE approval_status = 'pending' AND confidence_score > 0.8;
    health_score := health_score - (pending_high_confidence_opts * 2);
    
    -- Deduct for high response times
    SELECT AVG(metric_value)::INTEGER INTO avg_response_time 
    FROM system_metrics 
    WHERE metric_name = 'api_avg_response_time_ms' AND recorded_at > NOW() - INTERVAL '5 minutes';
    IF avg_response_time > 500 THEN
        health_score := health_score - 20;
    END IF;
    
    -- Deduct for high error rates
    SELECT AVG(metric_value)::DECIMAL(5,2) INTO error_rate 
    FROM system_metrics 
    WHERE metric_name = 'api_error_rate_percent' AND recorded_at > NOW() - INTERVAL '5 minutes';
    IF error_rate > 1.0 THEN
        health_score := health_score - 30;
    END IF;
    
    -- Ensure score stays in 0-100 range
    IF health_score < 0 THEN health_score := 0; END IF;
    IF health_score > 100 THEN health_score := 100; END IF;
    
    RETURN health_score;
END;
$$ LANGUAGE plpgsql;

COMMENT ON TABLE system_metrics IS 'Real-time system performance metrics (DB, API, SDK, revenue)';
COMMENT ON TABLE optimization_queue IS 'AI-proposed optimizations awaiting approval or auto-application';
COMMENT ON TABLE incidents IS 'System incidents tracked from detection to resolution';
COMMENT ON TABLE evolution_log IS 'Immutable log of all system changes made by AI or humans';
COMMENT ON TABLE predictive_alerts IS 'Forward-looking alerts predicting issues 7-30 days ahead';
COMMENT ON TABLE infrastructure_scaling_events IS 'Auto-scaling events with cost impact tracking';
COMMENT ON TABLE ai_learning_history IS 'AI model improvement tracking over time';
COMMENT ON TABLE capacity_forecasts IS 'Infrastructure capacity forecasts for proactive scaling';
COMMENT ON TABLE system_health_snapshots IS 'Hourly snapshots of overall system health';
