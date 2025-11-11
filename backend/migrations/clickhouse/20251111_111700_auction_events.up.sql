CREATE TABLE IF NOT EXISTS auction_events
(
  ts DateTime,
  auction_id String,
  placement_id String,
  adapter LowCardinality(String),
  event LowCardinality(String),
  latency_ms UInt16,
  deadline_ms UInt16,
  error_code LowCardinality(String) DEFAULT ''
)
ENGINE = MergeTree
PARTITION BY toYYYYMM(ts)
ORDER BY (placement_id, ts, auction_id)
SETTINGS index_granularity = 8192;
