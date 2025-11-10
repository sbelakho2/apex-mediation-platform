/**
 * ClickHouse Schema Setup
 * 
 * Creates tables for storing ad events, impressions, clicks, and revenue data
 * with proper partitioning, indexes, and retention policies.
 */

export const CREATE_IMPRESSIONS_TABLE = `
CREATE TABLE IF NOT EXISTS impressions (
  event_id UUID,
  timestamp DateTime64(3),
  publisher_id UUID,
  app_id UUID,
  placement_id UUID,
  adapter_id UUID,
  adapter_name String,
  ad_unit_id String,
  ad_format Enum8('banner' = 1, 'interstitial' = 2, 'rewarded' = 3, 'native' = 4),
  country_code FixedString(2),
  device_type Enum8('phone' = 1, 'tablet' = 2, 'tv' = 3),
  os Enum8('ios' = 1, 'android' = 2),
  os_version String,
  app_version String,
  sdk_version String,
  session_id UUID,
  user_id String,  -- Anonymized/hashed
  request_id UUID,
  bid_price_usd Decimal64(6),
  ecpm_usd Decimal64(6),
  latency_ms UInt32,
  is_test_mode UInt8,
  created_date Date MATERIALIZED toDate(timestamp)
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (publisher_id, adapter_id, timestamp)
TTL toDateTime(timestamp) + INTERVAL 90 DAY  -- Keep 90 days of raw data
SETTINGS index_granularity = 8192;
`;

export const CREATE_BID_LANDSCAPE_TABLE = `
CREATE TABLE IF NOT EXISTS bid_landscape (
  auction_id UUID,
  request_id UUID,
  timestamp DateTime64(3),
  publisher_id UUID,
  app_id UUID,
  placement_id UUID,
  adapter_id String,
  adapter_name String,
  imp_id String,
  bid_price Decimal64(6),
  bid_currency FixedString(3),
  creative_id String,
  advertiser_domain String,
  won UInt8,  -- 1 if this bid won, 0 otherwise
  clearing_price Decimal64(6),
  second_price Decimal64(6),
  auction_duration_ms UInt32,
  total_bids UInt16,
  created_date Date MATERIALIZED toDate(timestamp)
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (publisher_id, timestamp, adapter_id)
TTL toDateTime(timestamp) + INTERVAL 180 DAY  -- Keep 180 days for analysis
SETTINGS index_granularity = 8192;
`;

export const CREATE_CLICKS_TABLE = `
CREATE TABLE IF NOT EXISTS clicks (
  event_id UUID,
  timestamp DateTime64(3),
  impression_id UUID,
  publisher_id UUID,
  app_id UUID,
  placement_id UUID,
  adapter_id UUID,
  adapter_name String,
  click_url String,
  country_code FixedString(2),
  device_type Enum8('phone' = 1, 'tablet' = 2, 'tv' = 3),
  os Enum8('ios' = 1, 'android' = 2),
  session_id UUID,
  user_id String,
  request_id UUID,
  time_to_click_ms UInt32,
  is_verified UInt8,
  is_test_mode UInt8,
  created_date Date MATERIALIZED toDate(timestamp)
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (publisher_id, adapter_id, timestamp)
TTL toDateTime(timestamp) + INTERVAL 90 DAY
SETTINGS index_granularity = 8192;
`;

export const CREATE_REVENUE_EVENTS_TABLE = `
CREATE TABLE IF NOT EXISTS revenue_events (
  event_id UUID,
  timestamp DateTime64(3),
  publisher_id UUID,
  app_id UUID,
  placement_id UUID,
  adapter_id UUID,
  adapter_name String,
  impression_id UUID,
  revenue_type Enum8('impression' = 1, 'click' = 2, 'install' = 3, 'iap' = 4),
  revenue_usd Decimal64(6),
  revenue_currency FixedString(3),
  revenue_original Decimal64(6),
  exchange_rate Decimal64(6),
  ecpm_usd Decimal64(6),
  country_code FixedString(2),
  ad_format Enum8('banner' = 1, 'interstitial' = 2, 'rewarded' = 3, 'native' = 4),
  os Enum8('ios' = 1, 'android' = 2),
  is_test_mode UInt8,
  reconciliation_status Enum8('pending' = 1, 'matched' = 2, 'discrepancy' = 3),
  created_date Date MATERIALIZED toDate(timestamp)
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (publisher_id, adapter_id, timestamp)
TTL toDateTime(timestamp) + INTERVAL 365 DAY  -- Keep 1 year for financial records
SETTINGS index_granularity = 8192;
`;

export const CREATE_PERFORMANCE_METRICS_TABLE = `
CREATE TABLE IF NOT EXISTS performance_metrics (
  timestamp DateTime64(3),
  publisher_id UUID,
  adapter_id UUID,
  metric_type Enum8('latency' = 1, 'timeout' = 2, 'error' = 3, 'fill_rate' = 4),
  metric_value Float64,
  request_id UUID,
  error_code String,
  error_message String,
  created_date Date MATERIALIZED toDate(timestamp)
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (publisher_id, adapter_id, timestamp)
TTL toDateTime(timestamp) + INTERVAL 30 DAY
SETTINGS index_granularity = 8192;
`;

// Materialized views for real-time aggregations
export const CREATE_HOURLY_REVENUE_VIEW = `
CREATE MATERIALIZED VIEW IF NOT EXISTS hourly_revenue_mv
ENGINE = SummingMergeTree()
PARTITION BY toYYYYMM(hour)
ORDER BY (publisher_id, adapter_id, hour)
AS SELECT
  toStartOfHour(timestamp) as hour,
  publisher_id,
  adapter_id,
  adapter_name,
  country_code,
  ad_format,
  count() as impression_count,
  sum(revenue_usd) as total_revenue_usd,
  avg(ecpm_usd) as avg_ecpm_usd
FROM revenue_events
WHERE revenue_type = 'impression'
GROUP BY hour, publisher_id, adapter_id, adapter_name, country_code, ad_format;
`;

export const CREATE_DAILY_STATS_VIEW = `
CREATE MATERIALIZED VIEW IF NOT EXISTS daily_stats_mv
ENGINE = SummingMergeTree()
PARTITION BY toYYYYMM(date)
ORDER BY (publisher_id, date)
AS SELECT
  toDate(timestamp) as date,
  publisher_id,
  app_id,
  count(DISTINCT session_id) as unique_sessions,
  count(DISTINCT user_id) as unique_users,
  count() as total_impressions
FROM impressions
WHERE is_test_mode = 0
GROUP BY date, publisher_id, app_id;
`;

// Indexes for common queries
export const CREATE_INDEX_IMPRESSIONS_COUNTRY = `
-- Skip index for filtering by country
ALTER TABLE impressions ADD INDEX IF NOT EXISTS idx_country (country_code) TYPE set(100) GRANULARITY 4;
`;

export const CREATE_INDEX_REVENUE_COUNTRY = `
ALTER TABLE revenue_events ADD INDEX IF NOT EXISTS idx_country (country_code) TYPE set(100) GRANULARITY 4;
`;

export const CREATE_INDEX_IMPRESSIONS_ADAPTER = `
-- Skip index for adapter filtering
ALTER TABLE impressions ADD INDEX IF NOT EXISTS idx_adapter (adapter_id) TYPE bloom_filter GRANULARITY 4;
`;

export const CREATE_INDEX_REVENUE_ADAPTER = `
ALTER TABLE revenue_events ADD INDEX IF NOT EXISTS idx_adapter (adapter_id) TYPE bloom_filter GRANULARITY 4;
`;

// Transparency: Auctions log tables (append-only)
export const CREATE_AUCTIONS_TABLE = `
CREATE TABLE IF NOT EXISTS auctions (
  auction_id UUID,
  timestamp DateTime64(3),
  publisher_id String,
  app_or_site_id String,
  placement_id String,
  surface_type Enum8('mobile_app' = 1, 'web' = 2, 'ctv' = 3),
  device_os LowCardinality(String),
  device_geo FixedString(2),
  att_status LowCardinality(String),
  tc_string_sha256 FixedString(64),
  winner_source LowCardinality(String),
  winner_bid_ecpm Decimal64(6),
  winner_gross_price Decimal64(9),
  winner_currency FixedString(3),
  winner_reason LowCardinality(String),
  aletheia_fee_bp UInt16,
  sample_bps UInt16,
  effective_publisher_share Float64,
  integrity_algo LowCardinality(String),
  integrity_key_id LowCardinality(String),
  integrity_signature String,
  created_date Date MATERIALIZED toDate(timestamp)
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (publisher_id, timestamp, placement_id)
TTL toDateTime(timestamp) + INTERVAL 180 DAY
SETTINGS index_granularity = 8192;
`;

export const CREATE_AUCTION_CANDIDATES_TABLE = `
CREATE TABLE IF NOT EXISTS auction_candidates (
  auction_id UUID,
  timestamp DateTime64(3),
  source LowCardinality(String),
  bid_ecpm Decimal64(6),
  currency FixedString(3),
  response_time_ms UInt32,
  status LowCardinality(String),
  metadata_hash FixedString(64),
  created_date Date MATERIALIZED toDate(timestamp)
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (auction_id, source)
TTL toDateTime(timestamp) + INTERVAL 180 DAY
SETTINGS index_granularity = 8192;
`;

export const CREATE_TRANSPARENCY_SIGNER_KEYS_TABLE = `
CREATE TABLE IF NOT EXISTS transparency_signer_keys (
  key_id String,
  algo LowCardinality(String), -- e.g., ed25519, hmac
  public_key_base64 String,
  created_at DateTime,
  rotated_at Nullable(DateTime),
  active UInt8
) ENGINE = MergeTree()
ORDER BY key_id;
`;

export const allSchemas = [
  CREATE_IMPRESSIONS_TABLE,
  CREATE_CLICKS_TABLE,
  CREATE_REVENUE_EVENTS_TABLE,
  CREATE_PERFORMANCE_METRICS_TABLE,
  CREATE_BID_LANDSCAPE_TABLE,
  CREATE_HOURLY_REVENUE_VIEW,
  CREATE_DAILY_STATS_VIEW,
  CREATE_AUCTIONS_TABLE,
  CREATE_AUCTION_CANDIDATES_TABLE,
  CREATE_TRANSPARENCY_SIGNER_KEYS_TABLE,
  CREATE_INDEX_IMPRESSIONS_COUNTRY,
  CREATE_INDEX_REVENUE_COUNTRY,
  CREATE_INDEX_IMPRESSIONS_ADAPTER,
  CREATE_INDEX_REVENUE_ADAPTER,
];
