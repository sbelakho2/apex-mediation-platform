-- Add review persistence table for VRA matching engine

CREATE TABLE IF NOT EXISTS recon_match_review
(
  statement_id String,
  request_id String,
  link_confidence Decimal(5,2),
  keys_used String,
  reasons String,            -- JSON as String (e.g., {time:...,amount:...,unit:...})
  matched_at DateTime DEFAULT now()
)
ENGINE = MergeTree
ORDER BY (statement_id, matched_at)
PARTITION BY toYYYYMM(matched_at)
SETTINGS index_granularity = 8192;
