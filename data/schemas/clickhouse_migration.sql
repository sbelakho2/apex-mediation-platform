-- ClickHouse Migration Studio Analytics Schema
-- Stores experiment metrics for parallel mediation testing

-- Raw migration experiment outcomes (fact table from shadow recorder)
CREATE TABLE IF NOT EXISTS migration_experiment_outcomes (
    event_id UUID,
    timestamp DateTime64(3),
    date Date DEFAULT toDate(timestamp),
    hour UInt8 DEFAULT toHour(timestamp),
    
    -- Experiment context
    experiment_id UUID,
    request_id String,
    placement_id UUID,
    arm Enum8('control' = 1, 'test' = 2),
    mode Enum8('shadow' = 1, 'mirroring' = 2),
    
    -- Outcome
    status Enum8('win' = 1, 'no_fill' = 2, 'error' = 3, 'timeout' = 4),
    adapter_id String,
    adapter_name String,
    bid_cpm_micros UInt32, -- eCPM in micros (1/1,000,000 of currency unit)
    currency FixedString(3) DEFAULT 'USD',
    
    -- Performance
    latency_ms UInt16,
    mirror_percent UInt8,
    
    -- Geo/device context for stratification
    country FixedString(2),
    device_type Enum8('phone' = 1, 'tablet' = 2, 'tv' = 3, 'unknown' = 4),
    
    -- Metadata
    error_reason String,
    bids_count UInt8, -- Number of bids returned
    
    INDEX idx_experiment experiment_id TYPE minmax GRANULARITY 4,
    INDEX idx_placement placement_id TYPE minmax GRANULARITY 4,
    INDEX idx_date date TYPE minmax GRANULARITY 1
) ENGINE = MergeTree()
PARTITION BY (experiment_id, toYYYYMM(date))
ORDER BY (experiment_id, arm, timestamp)
TTL date + INTERVAL 90 DAY
SETTINGS index_granularity = 8192;

COMMENT ON TABLE migration_experiment_outcomes IS 'Raw auction outcomes from migration experiments (shadow/mirroring modes)';

-- Hourly rollup view: aggregated metrics per experiment, arm, hour
-- Used for real-time guardrail evaluation and dashboards
CREATE MATERIALIZED VIEW IF NOT EXISTS migration_experiment_hourly
ENGINE = SummingMergeTree()
PARTITION BY (experiment_id, toYYYYMM(date))
ORDER BY (experiment_id, arm, date, hour)
TTL date + INTERVAL 90 DAY
POPULATE AS
SELECT
    experiment_id,
    arm,
    date,
    hour,
    
    -- Volume metrics
    count() AS impressions,
    countIf(status = 'win') AS fills,
    countIf(status = 'no_fill') AS no_fills,
    countIf(status IN ('error', 'timeout')) AS errors,
    
    -- Revenue metrics (in micros)
    sum(bid_cpm_micros) AS total_revenue_micros,
    
    -- Latency metrics (milliseconds)
    quantile(0.50)(latency_ms) AS latency_p50_ms,
    quantile(0.95)(latency_ms) AS latency_p95_ms,
    quantile(0.99)(latency_ms) AS latency_p99_ms,
    avg(latency_ms) AS latency_avg_ms,
    max(latency_ms) AS latency_max_ms,
    
    -- Adapter breakdown (top 5 by volume)
    topK(5)(adapter_name) AS top_adapters,
    
    -- Geo/device distribution (for stratified analysis)
    uniq(country) AS unique_countries,
    uniq(device_type) AS unique_device_types,
    
    -- Updated timestamp
    now() AS aggregated_at
FROM migration_experiment_outcomes
GROUP BY
    experiment_id,
    arm,
    date,
    hour;

COMMENT ON TABLE migration_experiment_hourly IS 'Hourly aggregation of experiment metrics (impressions, fills, revenue, latency) per arm';

-- Daily rollup view: full-day metrics for reporting and side-by-side comparison
CREATE MATERIALIZED VIEW IF NOT EXISTS migration_experiment_daily
ENGINE = SummingMergeTree()
PARTITION BY (experiment_id, toYYYYMM(date))
ORDER BY (experiment_id, arm, date)
TTL date + INTERVAL 90 DAY
POPULATE AS
SELECT
    experiment_id,
    arm,
    date,
    
    -- Volume metrics
    count() AS impressions,
    countIf(status = 'win') AS fills,
    countIf(status = 'no_fill') AS no_fills,
    countIf(status IN ('error', 'timeout')) AS errors,
    
    -- Revenue metrics (in micros)
    sum(bid_cpm_micros) AS total_revenue_micros,
    
    -- Latency metrics (milliseconds)
    quantile(0.50)(latency_ms) AS latency_p50_ms,
    quantile(0.95)(latency_ms) AS latency_p95_ms,
    quantile(0.99)(latency_ms) AS latency_p99_ms,
    avg(latency_ms) AS latency_avg_ms,
    
    -- Adapter breakdown
    topK(10)(adapter_name) AS top_adapters,
    
    -- Geo/device counts
    uniq(country) AS unique_countries,
    uniq(device_type) AS unique_device_types,
    
    -- Updated timestamp
    now() AS aggregated_at
FROM migration_experiment_outcomes
GROUP BY
    experiment_id,
    arm,
    date;

COMMENT ON TABLE migration_experiment_daily IS 'Daily aggregation of experiment metrics for reporting and uplift calculations';

-- Stratified daily rollup by geo (for geo-based comparisons)
CREATE MATERIALIZED VIEW IF NOT EXISTS migration_experiment_geo_daily
ENGINE = SummingMergeTree()
PARTITION BY (experiment_id, toYYYYMM(date))
ORDER BY (experiment_id, arm, country, date)
TTL date + INTERVAL 90 DAY
POPULATE AS
SELECT
    experiment_id,
    arm,
    country,
    date,
    
    count() AS impressions,
    countIf(status = 'win') AS fills,
    sum(bid_cpm_micros) AS total_revenue_micros,
    quantile(0.95)(latency_ms) AS latency_p95_ms,
    
    now() AS aggregated_at
FROM migration_experiment_outcomes
GROUP BY
    experiment_id,
    arm,
    country,
    date;

COMMENT ON TABLE migration_experiment_geo_daily IS 'Daily metrics stratified by geo for variance reduction (CUPED)';

-- Stratified daily rollup by device (for device-based comparisons)
CREATE MATERIALIZED VIEW IF NOT EXISTS migration_experiment_device_daily
ENGINE = SummingMergeTree()
PARTITION BY (experiment_id, toYYYYMM(date))
ORDER BY (experiment_id, arm, device_type, date)
TTL date + INTERVAL 90 DAY
POPULATE AS
SELECT
    experiment_id,
    arm,
    device_type,
    date,
    
    count() AS impressions,
    countIf(status = 'win') AS fills,
    sum(bid_cpm_micros) AS total_revenue_micros,
    quantile(0.95)(latency_ms) AS latency_p95_ms,
    
    now() AS aggregated_at
FROM migration_experiment_outcomes
GROUP BY
    experiment_id,
    arm,
    device_type,
    date;

COMMENT ON TABLE migration_experiment_device_daily IS 'Daily metrics stratified by device type for variance reduction (CUPED)';

-- Stratified daily rollup by adapter (for adapter-level comparisons)
CREATE MATERIALIZED VIEW IF NOT EXISTS migration_experiment_adapter_daily
ENGINE = SummingMergeTree()
PARTITION BY (experiment_id, toYYYYMM(date))
ORDER BY (experiment_id, arm, adapter_name, date)
TTL date + INTERVAL 90 DAY
POPULATE AS
SELECT
    experiment_id,
    arm,
    adapter_name,
    date,
    
    count() AS impressions,
    countIf(status = 'win') AS fills,
    sum(bid_cpm_micros) AS total_revenue_micros,
    quantile(0.95)(latency_ms) AS latency_p95_ms,
    countIf(status IN ('error', 'timeout')) AS errors,
    
    now() AS aggregated_at
FROM migration_experiment_outcomes
GROUP BY
    experiment_id,
    arm,
    adapter_name,
    date;

COMMENT ON TABLE migration_experiment_adapter_daily IS 'Daily metrics stratified by adapter for adapter-level uplift analysis';

-- Overall experiment summary (cumulative metrics from experiment start)
-- This is a query helper, not a separate table
-- Usage: SELECT * FROM migration_experiment_summary WHERE experiment_id = '...'
CREATE VIEW IF NOT EXISTS migration_experiment_summary AS
SELECT
    experiment_id,
    arm,
    
    -- Cumulative volume
    sum(impressions) AS total_impressions,
    sum(fills) AS total_fills,
    sum(no_fills) AS total_no_fills,
    sum(errors) AS total_errors,
    
    -- Cumulative revenue
    sum(total_revenue_micros) AS total_revenue_micros,
    
    -- Overall eCPM (micros per impression)
    if(sum(impressions) > 0, 
       sum(total_revenue_micros) / sum(impressions), 
       0) AS ecpm_micros,
    
    -- Fill rate
    if(sum(impressions) > 0, 
       sum(fills) / sum(impressions), 
       0) AS fill_rate,
    
    -- Error rate
    if(sum(impressions) > 0, 
       sum(errors) / sum(impressions), 
       0) AS error_rate,
    
    -- Average latency metrics
    avg(latency_p50_ms) AS avg_latency_p50_ms,
    avg(latency_p95_ms) AS avg_latency_p95_ms,
    avg(latency_p99_ms) AS avg_latency_p99_ms,
    
    -- Date range
    min(date) AS start_date,
    max(date) AS end_date,
    count(DISTINCT date) AS days_active
FROM migration_experiment_daily
GROUP BY
    experiment_id,
    arm;

COMMENT ON VIEW migration_experiment_summary IS 'Cumulative experiment metrics from start to present (control vs test comparison)';
