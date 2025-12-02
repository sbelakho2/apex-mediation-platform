-- Bid landscape fact table replaces ClickHouse dependency
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE TABLE IF NOT EXISTS analytics_bid_landscape (
  observed_at timestamptz NOT NULL,
  auction_id text NOT NULL,
  request_id text,
  publisher_id text NOT NULL,
  app_id text,
  placement_id text,
  adapter_id text NOT NULL,
  adapter_name text,
  imp_id text NOT NULL,
  bid_id text NOT NULL,
  bid_price numeric(18,6) NOT NULL DEFAULT 0,
  bid_currency char(3) NOT NULL DEFAULT 'USD',
  creative_id text,
  advertiser_domain text,
  won boolean NOT NULL DEFAULT false,
  clearing_price numeric(18,6) NOT NULL DEFAULT 0,
  second_price numeric(18,6) NOT NULL DEFAULT 0,
  auction_duration_ms integer NOT NULL DEFAULT 0,
  total_bids integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (observed_at, auction_id, adapter_id, bid_id)
) PARTITION BY RANGE (observed_at);

CREATE TABLE IF NOT EXISTS analytics_bid_landscape_p_default
  PARTITION OF analytics_bid_landscape DEFAULT;

CREATE INDEX IF NOT EXISTS idx_analytics_bid_landscape_publisher_observed
  ON analytics_bid_landscape (publisher_id, observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_bid_landscape_adapter_observed
  ON analytics_bid_landscape (adapter_id, observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_bid_landscape_auction_observed
  ON analytics_bid_landscape (auction_id, observed_at DESC);

CREATE UNLOGGED TABLE IF NOT EXISTS analytics_bid_landscape_stage (
  LIKE analytics_bid_landscape INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING STATISTICS
);

TRUNCATE TABLE analytics_bid_landscape_stage;
