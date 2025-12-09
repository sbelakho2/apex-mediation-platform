-- Migration: Shadow Fraud Scores Analytics Table
-- Part of SDK_CHECKS Part 7.1: Shadow fraud scoring ON; never block
-- This table stores all fraud scores for analytics and model training only.
-- Scores are NEVER used for blocking traffic.

-- Create shadow fraud scores table for analytics
CREATE TABLE IF NOT EXISTS shadow_fraud_scores (
    id BIGSERIAL PRIMARY KEY,
    request_id VARCHAR(128) NOT NULL UNIQUE,
    placement_id VARCHAR(64) NOT NULL,
    publisher_id VARCHAR(64),
    score DECIMAL(5, 4) NOT NULL CHECK (score >= 0 AND score <= 1),
    risk_bucket VARCHAR(16) NOT NULL CHECK (risk_bucket IN ('low', 'medium', 'high', 'critical')),
    model_version VARCHAR(64) NOT NULL,
    features JSONB NOT NULL DEFAULT '{}',
    reasons JSONB NOT NULL DEFAULT '[]',
    device_platform VARCHAR(32),
    scored_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for querying by placement/publisher
CREATE INDEX IF NOT EXISTS idx_shadow_fraud_scores_placement 
ON shadow_fraud_scores (placement_id, scored_at DESC);

CREATE INDEX IF NOT EXISTS idx_shadow_fraud_scores_publisher 
ON shadow_fraud_scores (publisher_id, scored_at DESC);

-- Index for drift detection queries (model version + time window)
CREATE INDEX IF NOT EXISTS idx_shadow_fraud_scores_model_drift 
ON shadow_fraud_scores (model_version, scored_at DESC);

-- Index for risk bucket distribution analysis
CREATE INDEX IF NOT EXISTS idx_shadow_fraud_scores_risk_bucket 
ON shadow_fraud_scores (risk_bucket, scored_at DESC);

-- Partial index for high-risk scores (focus on suspicious traffic)
CREATE INDEX IF NOT EXISTS idx_shadow_fraud_scores_high_risk 
ON shadow_fraud_scores (scored_at DESC) 
WHERE risk_bucket IN ('high', 'critical');

-- Create hypertable if TimescaleDB extension is available
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb') THEN
        PERFORM create_hypertable('shadow_fraud_scores', 'scored_at', 
            chunk_time_interval => INTERVAL '1 day',
            if_not_exists => TRUE);
    END IF;
EXCEPTION WHEN OTHERS THEN
    -- Silently continue if TimescaleDB not available
    RAISE NOTICE 'TimescaleDB extension not available, using regular table';
END $$;

-- Retention policy: keep shadow scores for 90 days
-- Uses TimescaleDB if available, otherwise manual cleanup via cron
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb') THEN
        PERFORM add_retention_policy('shadow_fraud_scores', INTERVAL '90 days', if_not_exists => TRUE);
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Could not set retention policy, manual cleanup required';
END $$;

-- Create view for daily risk distribution (used by Console dashboard)
CREATE OR REPLACE VIEW shadow_fraud_daily_summary AS
SELECT 
    DATE(scored_at) as date,
    model_version,
    risk_bucket,
    COUNT(*) as count,
    AVG(score) as avg_score,
    PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY score) as p95_score
FROM shadow_fraud_scores
WHERE scored_at >= NOW() - INTERVAL '30 days'
GROUP BY DATE(scored_at), model_version, risk_bucket;

-- Create view for PSI calculation (baseline vs production)
CREATE OR REPLACE VIEW shadow_fraud_psi_data AS
SELECT 
    model_version,
    risk_bucket,
    COUNT(*)::float / NULLIF(SUM(COUNT(*)) OVER (PARTITION BY model_version), 0) as proportion,
    COUNT(*) as total
FROM shadow_fraud_scores
WHERE scored_at >= NOW() - INTERVAL '24 hours'
GROUP BY model_version, risk_bucket;

COMMENT ON TABLE shadow_fraud_scores IS 'Shadow fraud scores for analytics only. NEVER used to block traffic. Part of SDK_CHECKS 7.1';
COMMENT ON VIEW shadow_fraud_daily_summary IS 'Daily aggregation of fraud scores for dashboard display';
COMMENT ON VIEW shadow_fraud_psi_data IS 'Population Stability Index data for drift detection';
