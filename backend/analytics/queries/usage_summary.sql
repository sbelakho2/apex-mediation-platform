-- ClickHouse Usage Summary Schema
-- 
-- Creates source table for raw usage events and materialized views for efficient
-- aggregation at hourly, daily, and monthly granularities.
--
-- Partitioned by month with TTL policies for automatic data lifecycle management.
-- Optimized for high-throughput ingestion and fast aggregation queries.

-- =============================================================================
-- SOURCE TABLE: usage_events
-- =============================================================================

CREATE TABLE IF NOT EXISTS usage_events (
    event_id UUID,
    organization_id UUID,
    campaign_id UUID,
    ad_unit_id UUID,
    event_type LowCardinality(String),  -- 'impression', 'click', 'video_start', 'conversion'
    event_timestamp DateTime64(3),
    user_id Nullable(String),
    device_type LowCardinality(String),  -- 'mobile', 'tablet', 'desktop', 'ctv'
    geo_country LowCardinality(String),  -- ISO 3166-1 alpha-2
    revenue_micros Int64,  -- Revenue in micros (e.g., $1.00 = 1000000)
    billable UInt8,  -- 0 = non-billable, 1 = billable
    ingested_at DateTime DEFAULT now(),
    
    -- Partitioning and sorting keys
    INDEX idx_org_id organization_id TYPE bloom_filter GRANULARITY 1,
    INDEX idx_campaign_id campaign_id TYPE bloom_filter GRANULARITY 1
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(event_timestamp)
ORDER BY (organization_id, event_timestamp, event_id)
TTL event_timestamp + INTERVAL 90 DAY DELETE
SETTINGS index_granularity = 8192;

-- =============================================================================
-- MATERIALIZED VIEW: usage_hourly_rollups
-- =============================================================================

CREATE MATERIALIZED VIEW IF NOT EXISTS usage_hourly_rollups
ENGINE = SummingMergeTree()
PARTITION BY toYYYYMM(hour_start)
ORDER BY (organization_id, hour_start, event_type)
TTL hour_start + INTERVAL 180 DAY DELETE
POPULATE
AS SELECT
    organization_id,
    toStartOfHour(event_timestamp) AS hour_start,
    event_type,
    count() AS event_count,
    sum(revenue_micros) AS total_revenue_micros,
    countIf(billable = 1) AS billable_count,
    uniqExact(user_id) AS unique_users,
    now() AS aggregated_at
FROM usage_events
WHERE billable = 1
GROUP BY
    organization_id,
    hour_start,
    event_type;

-- =============================================================================
-- MATERIALIZED VIEW: usage_daily_rollups
-- =============================================================================

CREATE MATERIALIZED VIEW IF NOT EXISTS usage_daily_rollups
ENGINE = SummingMergeTree()
PARTITION BY toYYYYMM(day_start)
ORDER BY (organization_id, day_start, event_type)
TTL day_start + INTERVAL 730 DAY DELETE  -- 2 years retention
POPULATE
AS SELECT
    organization_id,
    toStartOfDay(event_timestamp) AS day_start,
    event_type,
    count() AS event_count,
    sum(revenue_micros) AS total_revenue_micros,
    countIf(billable = 1) AS billable_count,
    uniqExact(user_id) AS unique_users,
    now() AS aggregated_at
FROM usage_events
WHERE billable = 1
GROUP BY
    organization_id,
    day_start,
    event_type;

-- =============================================================================
-- MATERIALIZED VIEW: usage_monthly_rollups
-- =============================================================================

CREATE MATERIALIZED VIEW IF NOT EXISTS usage_monthly_rollups
ENGINE = SummingMergeTree()
PARTITION BY toYear(month_start)
ORDER BY (organization_id, month_start, event_type)
TTL month_start + INTERVAL 1825 DAY DELETE  -- 5 years retention
POPULATE
AS SELECT
    organization_id,
    toStartOfMonth(event_timestamp) AS month_start,
    event_type,
    count() AS event_count,
    sum(revenue_micros) AS total_revenue_micros,
    countIf(billable = 1) AS billable_count,
    uniqExact(user_id) AS unique_users,
    now() AS aggregated_at
FROM usage_events
WHERE billable = 1
GROUP BY
    organization_id,
    month_start,
    event_type;

-- =============================================================================
-- MATERIALIZED VIEW: usage_by_geo_daily
-- =============================================================================

CREATE MATERIALIZED VIEW IF NOT EXISTS usage_by_geo_daily
ENGINE = SummingMergeTree()
PARTITION BY toYYYYMM(day_start)
ORDER BY (organization_id, day_start, geo_country, event_type)
TTL day_start + INTERVAL 365 DAY DELETE
POPULATE
AS SELECT
    organization_id,
    toStartOfDay(event_timestamp) AS day_start,
    geo_country,
    event_type,
    count() AS event_count,
    sum(revenue_micros) AS total_revenue_micros,
    countIf(billable = 1) AS billable_count,
    now() AS aggregated_at
FROM usage_events
WHERE billable = 1 AND geo_country != ''
GROUP BY
    organization_id,
    day_start,
    geo_country,
    event_type;

-- =============================================================================
-- MATERIALIZED VIEW: usage_by_device_daily
-- =============================================================================

CREATE MATERIALIZED VIEW IF NOT EXISTS usage_by_device_daily
ENGINE = SummingMergeTree()
PARTITION BY toYYYYMM(day_start)
ORDER BY (organization_id, day_start, device_type, event_type)
TTL day_start + INTERVAL 365 DAY DELETE
POPULATE
AS SELECT
    organization_id,
    toStartOfDay(event_timestamp) AS day_start,
    device_type,
    event_type,
    count() AS event_count,
    sum(revenue_micros) AS total_revenue_micros,
    countIf(billable = 1) AS billable_count,
    now() AS aggregated_at
FROM usage_events
WHERE billable = 1 AND device_type != ''
GROUP BY
    organization_id,
    day_start,
    device_type,
    event_type;

-- =============================================================================
-- QUERY EXAMPLES
-- =============================================================================

-- Example 1: Get current month usage for an organization
-- SELECT
--     event_type,
--     sum(event_count) AS total_events,
--     sum(total_revenue_micros) / 1000000 AS total_revenue_usd
-- FROM usage_monthly_rollups
-- WHERE
--     organization_id = '550e8400-e29b-41d4-a716-446655440000'
--     AND month_start = toStartOfMonth(now())
-- GROUP BY event_type;

-- Example 2: Get hourly usage for today
-- SELECT
--     hour_start,
--     event_type,
--     sum(event_count) AS events
-- FROM usage_hourly_rollups
-- WHERE
--     organization_id = '550e8400-e29b-41d4-a716-446655440000'
--     AND hour_start >= toStartOfDay(now())
-- GROUP BY hour_start, event_type
-- ORDER BY hour_start ASC;

-- Example 3: Get geo breakdown for last 30 days
-- SELECT
--     geo_country,
--     event_type,
--     sum(event_count) AS total_events,
--     sum(total_revenue_micros) / 1000000 AS revenue_usd
-- FROM usage_by_geo_daily
-- WHERE
--     organization_id = '550e8400-e29b-41d4-a716-446655440000'
--     AND day_start >= today() - INTERVAL 30 DAY
-- GROUP BY geo_country, event_type
-- ORDER BY total_events DESC
-- LIMIT 20;

-- Example 4: Compare device performance
-- SELECT
--     device_type,
--     sum(event_count) AS impressions,
--     sumIf(event_count, event_type = 'click') AS clicks,
--     (clicks / impressions) * 100 AS ctr_percent
-- FROM usage_by_device_daily
-- WHERE
--     organization_id = '550e8400-e29b-41d4-a716-446655440000'
--     AND day_start >= today() - INTERVAL 7 DAY
-- GROUP BY device_type
-- ORDER BY impressions DESC;
