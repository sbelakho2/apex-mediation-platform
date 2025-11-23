-- VRA ClickHouse tables per VRA.md

CREATE TABLE IF NOT EXISTS recon_statements_raw
(
  network LowCardinality(String),
  schema_ver UInt32,
  load_id String,
  raw_blob String,
  loaded_at DateTime DEFAULT now()
)
ENGINE = MergeTree
ORDER BY (network, load_id)
PARTITION BY toYYYYMM(loaded_at)
SETTINGS index_granularity = 8192;

CREATE TABLE IF NOT EXISTS recon_statements_norm
(
  event_date Date,
  app_id String,
  ad_unit_id String,
  country String,
  format LowCardinality(String),
  currency FixedString(3),
  impressions UInt64,
  clicks Nullable(UInt64),
  paid Decimal(18,6),
  ivt_adjustments Nullable(Decimal(18,6)),
  report_id String,
  network LowCardinality(String),
  schema_ver UInt32,
  loaded_at DateTime DEFAULT now()
)
ENGINE = MergeTree
ORDER BY (app_id, ad_unit_id, event_date)
PARTITION BY toYYYYMM(event_date)
SETTINGS index_granularity = 8192;

CREATE TABLE IF NOT EXISTS recon_expected
(
  event_date Date,
  request_id String,
  placement_id String,
  expected_value Decimal(18,6),
  currency FixedString(3),
  floors String,        -- JSON as String
  receipt_hash String,
  viewability String,   -- JSON as String
  ts DateTime
)
ENGINE = MergeTree
ORDER BY (placement_id, ts)
PARTITION BY toYYYYMM(ts)
SETTINGS index_granularity = 8192;

CREATE TABLE IF NOT EXISTS recon_match
(
  statement_id String,
  request_id String,
  link_confidence Decimal(5,2),
  keys_used String,
  matched_at DateTime DEFAULT now()
)
ENGINE = MergeTree
ORDER BY (statement_id, matched_at)
PARTITION BY toYYYYMM(matched_at)
SETTINGS index_granularity = 8192;

CREATE TABLE IF NOT EXISTS recon_deltas
(
  kind LowCardinality(String),
  amount Decimal(18,6),
  currency FixedString(3),
  reason_code String,
  window_start DateTime,
  window_end DateTime,
  evidence_id String,
  created_at DateTime DEFAULT now(),
  confidence Float32 DEFAULT 0
)
ENGINE = MergeTree
ORDER BY (kind, window_start)
PARTITION BY toYYYYMM(window_start)
SETTINGS index_granularity = 8192;

CREATE TABLE IF NOT EXISTS recon_disputes
(
  dispute_id String,
  network LowCardinality(String),
  amount Decimal(18,6),
  status LowCardinality(String),
  evidence_uri String,
  created_at DateTime DEFAULT now(),
  updated_at DateTime DEFAULT now()
)
ENGINE = MergeTree
ORDER BY (dispute_id, created_at)
PARTITION BY toYYYYMM(created_at)
SETTINGS index_granularity = 8192;

CREATE TABLE IF NOT EXISTS proofs_daily_roots
(
  day Date,
  merkle_root String,
  sig String,
  published_at DateTime DEFAULT now()
)
ENGINE = MergeTree
ORDER BY (day)
PARTITION BY toYYYYMM(day)
SETTINGS index_granularity = 8192;

CREATE TABLE IF NOT EXISTS proofs_monthly_digest
(
  month String,            -- YYYY-MM
  digest String,
  sig String,
  coverage_pct Decimal(5,2),
  notes String DEFAULT ''
)
ENGINE = MergeTree
ORDER BY (month)
SETTINGS index_granularity = 8192;
