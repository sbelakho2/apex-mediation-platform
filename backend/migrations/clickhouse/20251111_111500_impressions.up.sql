CREATE TABLE IF NOT EXISTS impressions
(
  ts DateTime,
  date Date DEFAULT toDate(ts),
  bid_id String,
  auction_id String DEFAULT '',
  placement_id String,
  adapter LowCardinality(String),
  country FixedString(2) DEFAULT '',
  ua_hash FixedString(16) DEFAULT '',
  ip_hash FixedString(16) DEFAULT '',
  cpm Float32,
  currency LowCardinality(String) DEFAULT 'USD'
)
ENGINE = MergeTree
PARTITION BY toYYYYMM(date)
ORDER BY (placement_id, ts, bid_id)
TTL date + toIntervalMonth(18)
SETTINGS index_granularity = 8192;
