-- ApexMediation Analytics Database Schema
-- ClickHouse database for high-volume time-series data

-- Ad Impressions (fact table)
CREATE TABLE IF NOT EXISTS impressions (
    event_id UUID,
    timestamp DateTime64(3),
    date Date DEFAULT toDate(timestamp),
    hour UInt8 DEFAULT toHour(timestamp),
    
    -- Publisher/Placement
    publisher_id UUID,
    placement_id UUID,
    ad_unit_id String,
    
    -- Request
    request_id UUID,
    device_id String,
    device_type Enum8('phone' = 1, 'tablet' = 2, 'tv' = 3, 'unknown' = 4),
    os Enum8('android' = 1, 'ios' = 2, 'other' = 3),
    os_version String,
    app_version String,
    sdk_version String,
    
    -- Auction
    adapter_id UUID,
    network String,
    auction_id UUID,
    bid_price_cents UInt32,
    floor_price_cents UInt32,
    winning_bid_cents UInt32,
    auction_duration_ms UInt16,
    
    -- Revenue
    revenue_cents UInt32,
    currency FixedString(3) DEFAULT 'USD',
    
    -- Geo
    country FixedString(2),
    region String,
    city String,
    
    -- Fraud
    fraud_score Float32,
    fraud_flags Array(String),
    is_fraudulent UInt8 DEFAULT 0,
    
    -- Performance
    load_time_ms UInt16,
    render_time_ms UInt16,
    viewability_percentage UInt8,
    
    -- Metadata
    user_agent String,
    ip_hash FixedString(64),
    session_id UUID,
    
    INDEX idx_publisher publisher_id TYPE minmax GRANULARITY 4,
    INDEX idx_placement placement_id TYPE minmax GRANULARITY 4,
    INDEX idx_date date TYPE minmax GRANULARITY 1,
    INDEX idx_network network TYPE set(100) GRANULARITY 8
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(date)
ORDER BY (publisher_id, placement_id, timestamp)
TTL date + INTERVAL 90 DAY
SETTINGS index_granularity = 8192;

-- Clicks (fact table)
CREATE TABLE IF NOT EXISTS clicks (
    event_id UUID,
    timestamp DateTime64(3),
    date Date DEFAULT toDate(timestamp),
    
    impression_id UUID,
    publisher_id UUID,
    placement_id UUID,
    adapter_id UUID,
    network String,
    
    click_duration_ms UInt16, -- time from impression to click
    
    device_id String,
    device_type Enum8('phone' = 1, 'tablet' = 2, 'tv' = 3, 'unknown' = 4),
    
    country FixedString(2),
    
    fraud_score Float32,
    is_fraudulent UInt8 DEFAULT 0,
    
    INDEX idx_impression impression_id TYPE minmax GRANULARITY 4,
    INDEX idx_publisher publisher_id TYPE minmax GRANULARITY 4
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(date)
ORDER BY (publisher_id, timestamp)
TTL date + INTERVAL 90 DAY;

-- Auctions (for bid landscape analysis)
CREATE TABLE IF NOT EXISTS auctions (
    auction_id UUID,
    timestamp DateTime64(3),
    date Date DEFAULT toDate(timestamp),
    
    publisher_id UUID,
    placement_id UUID,
    request_id UUID,
    
    -- Bids received
    bids_received UInt8,
    bids Array(Tuple(network String, bid_cents UInt32, response_time_ms UInt16)),
    
    -- Winner
    winning_network String,
    winning_bid_cents UInt32,
    floor_price_cents UInt32,
    
    -- Auction performance
    total_duration_ms UInt16,
    timeout_count UInt8,
    error_count UInt8,
    
    filled UInt8,
    
    INDEX idx_publisher publisher_id TYPE minmax GRANULARITY 4
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(date)
ORDER BY (publisher_id, timestamp)
TTL date + INTERVAL 30 DAY;

-- Fraud Events (detailed fraud analysis)
CREATE TABLE IF NOT EXISTS fraud_events (
    event_id UUID,
    timestamp DateTime64(3),
    date Date DEFAULT toDate(timestamp),
    
    publisher_id UUID,
    placement_id UUID,
    impression_id UUID,
    
    fraud_type Enum8('givt' = 1, 'sivt' = 2, 'ml_fraud' = 3, 'anomaly' = 4, 'custom' = 5),
    severity Enum8('low' = 1, 'medium' = 2, 'high' = 3, 'critical' = 4),
    confidence Float32,
    
    device_id String,
    device_fingerprint String,
    ip_hash FixedString(64),
    
    blocked UInt8,
    revenue_blocked_cents UInt32,
    
    detection_method String,
    rule_id UUID,
    metadata String, -- JSON
    
    INDEX idx_publisher publisher_id TYPE minmax GRANULARITY 4,
    INDEX idx_type fraud_type TYPE set(10) GRANULARITY 4
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(date)
ORDER BY (publisher_id, timestamp)
TTL date + INTERVAL 180 DAY;

-- SDK Telemetry (performance monitoring)
CREATE TABLE IF NOT EXISTS sdk_telemetry (
    event_id UUID,
    timestamp DateTime64(3),
    date Date DEFAULT toDate(timestamp),
    
    publisher_id UUID,
    device_id String,
    session_id UUID,
    
    sdk_version String,
    app_version String,
    os String,
    os_version String,
    device_model String,
    
    event_type Enum8('init' = 1, 'ad_load' = 2, 'ad_show' = 3, 'error' = 4, 'crash' = 5, 'anr' = 6),
    
    -- Performance metrics
    load_duration_ms UInt32,
    memory_mb UInt16,
    cpu_percentage UInt8,
    battery_level UInt8,
    network_type Enum8('wifi' = 1, '4g' = 2, '5g' = 3, '3g' = 4, 'other' = 5),
    
    -- Errors
    error_code String,
    error_message String,
    stack_trace String,
    
    is_anr UInt8,
    is_crash UInt8,
    
    metadata String, -- JSON
    
    INDEX idx_publisher publisher_id TYPE minmax GRANULARITY 4,
    INDEX idx_event_type event_type TYPE set(10) GRANULARITY 4
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(date)
ORDER BY (publisher_id, timestamp)
TTL date + INTERVAL 30 DAY;

-- Materialized Views for aggregations

-- Hourly revenue summary
CREATE MATERIALIZED VIEW IF NOT EXISTS revenue_hourly
ENGINE = SummingMergeTree()
PARTITION BY toYYYYMM(date)
ORDER BY (publisher_id, placement_id, date, hour)
AS SELECT
    publisher_id,
    placement_id,
    date,
    hour,
    network,
    count() as impression_count,
    sum(revenue_cents) as total_revenue_cents,
    avg(revenue_cents) as avg_revenue_cents,
    sum(winning_bid_cents) as total_winning_bids_cents,
    avg(auction_duration_ms) as avg_auction_duration_ms,
    countIf(is_fraudulent = 1) as fraud_count,
    sum(load_time_ms) / count() as avg_load_time_ms
FROM impressions
GROUP BY publisher_id, placement_id, date, hour, network;

-- Daily publisher summary
CREATE MATERIALIZED VIEW IF NOT EXISTS publisher_daily
ENGINE = SummingMergeTree()
PARTITION BY toYYYYMM(date)
ORDER BY (publisher_id, date)
AS SELECT
    publisher_id,
    date,
    count() as impressions,
    uniq(device_id) as unique_devices,
    uniq(session_id) as sessions,
    sum(revenue_cents) as revenue_cents,
    avg(revenue_cents) as ecpm_cents,
    countIf(is_fraudulent = 1) as fraud_count,
    countIf(is_fraudulent = 1) / count() * 100 as fraud_rate_percentage
FROM impressions
GROUP BY publisher_id, date;

-- Daily network performance
CREATE MATERIALIZED VIEW IF NOT EXISTS network_daily
ENGINE = SummingMergeTree()
PARTITION BY toYYYYMM(date)
ORDER BY (network, date)
AS SELECT
    network,
    date,
    count() as impressions,
    sum(revenue_cents) as revenue_cents,
    avg(revenue_cents) as avg_ecpm_cents,
    avg(auction_duration_ms) as avg_response_time_ms,
    sum(revenue_cents) / count() as fill_rate_percentage
FROM impressions
GROUP BY network, date;

-- Fraud rate by type
CREATE MATERIALIZED VIEW IF NOT EXISTS fraud_by_type_daily
ENGINE = SummingMergeTree()
PARTITION BY toYYYYMM(date)
ORDER BY (publisher_id, fraud_type, date)
AS SELECT
    publisher_id,
    fraud_type,
    date,
    count() as event_count,
    sum(revenue_blocked_cents) as revenue_blocked_cents,
    avg(confidence) as avg_confidence
FROM fraud_events
GROUP BY publisher_id, fraud_type, date;
