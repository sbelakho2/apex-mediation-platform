-- Migration: Viewability Events Table
-- Part of SDK_CHECKS Part 7.3: OMSDK/viewability events pass-through
-- Stores viewability data from SDKs where OMSDK is available

-- Create viewability events table
CREATE TABLE IF NOT EXISTS viewability_events (
    id BIGSERIAL PRIMARY KEY,
    request_id VARCHAR(128) NOT NULL,
    impression_id VARCHAR(128) NOT NULL UNIQUE,
    placement_id VARCHAR(64) NOT NULL,
    publisher_id VARCHAR(64),
    
    -- Platform and format
    platform VARCHAR(32) NOT NULL CHECK (platform IN ('ios', 'android', 'android_tv', 'tvos', 'unity', 'web')),
    ad_format VARCHAR(32) NOT NULL CHECK (ad_format IN ('banner', 'interstitial', 'rewarded', 'native', 'video')),
    
    -- OMSDK status
    omsdk_available BOOLEAN NOT NULL DEFAULT false,
    omsdk_session_started BOOLEAN,
    omsdk_version VARCHAR(32),
    
    -- Viewability metrics
    was_viewable BOOLEAN NOT NULL DEFAULT false,
    measurable BOOLEAN NOT NULL DEFAULT false,
    viewable_time_ms INTEGER,
    total_duration_ms INTEGER,
    viewable_percent DECIMAL(5, 2) CHECK (viewable_percent >= 0 AND viewable_percent <= 100),
    
    -- Video quartiles (JSONB for flexibility)
    quartiles JSONB NOT NULL DEFAULT '{}',
    
    -- Geometry data from OMSDK
    geometry JSONB NOT NULL DEFAULT '{}',
    
    -- Engagement events
    engagement_events JSONB DEFAULT '[]',
    
    -- Timestamps
    event_timestamp TIMESTAMPTZ NOT NULL,
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for querying by placement
CREATE INDEX IF NOT EXISTS idx_viewability_events_placement 
ON viewability_events (placement_id, event_timestamp DESC);

-- Index for querying by publisher
CREATE INDEX IF NOT EXISTS idx_viewability_events_publisher 
ON viewability_events (publisher_id, event_timestamp DESC);

-- Index for OMSDK status queries
CREATE INDEX IF NOT EXISTS idx_viewability_events_omsdk 
ON viewability_events (publisher_id, platform, omsdk_available);

-- Index for viewability rate calculations
CREATE INDEX IF NOT EXISTS idx_viewability_events_viewable 
ON viewability_events (placement_id, was_viewable, measurable, event_timestamp DESC);

-- Partial index for video ads (quartile analysis)
CREATE INDEX IF NOT EXISTS idx_viewability_events_video 
ON viewability_events (placement_id, event_timestamp DESC)
WHERE ad_format = 'video' OR ad_format = 'rewarded';

-- Create hypertable if TimescaleDB extension is available
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb') THEN
        PERFORM create_hypertable('viewability_events', 'event_timestamp', 
            chunk_time_interval => INTERVAL '1 day',
            if_not_exists => TRUE);
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'TimescaleDB extension not available, using regular table';
END $$;

-- Retention policy: keep viewability data for 90 days
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb') THEN
        PERFORM add_retention_policy('viewability_events', INTERVAL '90 days', if_not_exists => TRUE);
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Could not set retention policy, manual cleanup required';
END $$;

-- Create view for Console display: viewability by placement
CREATE OR REPLACE VIEW viewability_by_placement AS
SELECT 
    placement_id,
    publisher_id,
    DATE(event_timestamp) as date,
    COUNT(*) as total_impressions,
    COUNT(*) FILTER (WHERE measurable = true) as measurable_impressions,
    COUNT(*) FILTER (WHERE was_viewable = true) as viewable_impressions,
    CASE 
        WHEN COUNT(*) FILTER (WHERE measurable = true) > 0 
        THEN COUNT(*) FILTER (WHERE was_viewable = true)::float / COUNT(*) FILTER (WHERE measurable = true)
        ELSE 0 
    END as viewability_rate,
    AVG(viewable_time_ms) FILTER (WHERE viewable_time_ms > 0) as avg_viewable_time_ms,
    COUNT(*) FILTER (WHERE omsdk_available = true) as omsdk_enabled_count
FROM viewability_events
WHERE event_timestamp >= NOW() - INTERVAL '30 days'
GROUP BY placement_id, publisher_id, DATE(event_timestamp);

-- Create view for OMSDK status by publisher
CREATE OR REPLACE VIEW omsdk_status_by_publisher AS
SELECT 
    publisher_id,
    platform,
    omsdk_available,
    COUNT(*) as event_count,
    COUNT(*) FILTER (WHERE was_viewable = true) as viewable_count,
    COUNT(*) FILTER (WHERE measurable = true) as measurable_count
FROM viewability_events
WHERE event_timestamp >= NOW() - INTERVAL '7 days'
GROUP BY publisher_id, platform, omsdk_available;

-- Create view for video quartile completion rates
CREATE OR REPLACE VIEW video_quartile_rates AS
SELECT 
    placement_id,
    publisher_id,
    DATE(event_timestamp) as date,
    COUNT(*) as total_video_impressions,
    COUNT(*) FILTER (WHERE (quartiles->>'start')::boolean = true) as start_count,
    COUNT(*) FILTER (WHERE (quartiles->>'firstQuartile')::boolean = true) as first_quartile_count,
    COUNT(*) FILTER (WHERE (quartiles->>'midpoint')::boolean = true) as midpoint_count,
    COUNT(*) FILTER (WHERE (quartiles->>'thirdQuartile')::boolean = true) as third_quartile_count,
    COUNT(*) FILTER (WHERE (quartiles->>'complete')::boolean = true) as complete_count
FROM viewability_events
WHERE (ad_format = 'video' OR ad_format = 'rewarded')
  AND event_timestamp >= NOW() - INTERVAL '30 days'
GROUP BY placement_id, publisher_id, DATE(event_timestamp);

COMMENT ON TABLE viewability_events IS 'OMSDK/viewability events from SDKs. Part of SDK_CHECKS 7.3';
COMMENT ON VIEW viewability_by_placement IS 'Aggregated viewability metrics by placement for Console display';
COMMENT ON VIEW omsdk_status_by_publisher IS 'OMSDK availability status by publisher and platform';
COMMENT ON VIEW video_quartile_rates IS 'Video completion quartile rates for video/rewarded ads';
