SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

DO $$
BEGIN
  IF to_regclass('transparency_auction_candidates_rollback') IS NULL THEN
    EXECUTE 'CREATE TABLE transparency_auction_candidates_rollback AS SELECT * FROM transparency_auction_candidates';
  END IF;
  IF to_regclass('transparency_auctions_rollback') IS NULL THEN
    EXECUTE 'CREATE TABLE transparency_auctions_rollback AS SELECT * FROM transparency_auctions';
  END IF;
END$$;

DROP TABLE IF EXISTS transparency_auction_candidates CASCADE;
DROP TABLE IF EXISTS transparency_auctions CASCADE;

-- Recreate the original non-partitioned tables
CREATE TABLE transparency_auctions (
  id bigserial PRIMARY KEY,
  auction_id uuid NOT NULL,
  observed_at timestamptz NOT NULL,
  publisher_id text NOT NULL,
  app_or_site_id text NOT NULL,
  placement_id text NOT NULL,
  surface_type text NOT NULL CHECK (surface_type IN ('mobile_app', 'web', 'ctv')),
  device_os text NOT NULL,
  device_geo char(2) NOT NULL DEFAULT 'US',
  att_status text NOT NULL DEFAULT 'unknown',
  tc_string_sha256 char(64) NOT NULL DEFAULT repeat('0', 64),
  winner_source text NOT NULL,
  winner_bid_ecpm numeric(18,6) NOT NULL,
  winner_gross_price numeric(18,6) NOT NULL,
  winner_currency char(3) NOT NULL DEFAULT 'USD',
  winner_reason text NOT NULL,
  aletheia_fee_bp integer NOT NULL DEFAULT 150,
  sample_bps integer NOT NULL DEFAULT 0,
  effective_publisher_share numeric(9,6) NOT NULL,
  integrity_algo text NOT NULL,
  integrity_key_id text NOT NULL,
  integrity_signature text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (auction_id)
);

CREATE INDEX idx_transparency_auctions_publisher_observed
  ON transparency_auctions (publisher_id, observed_at DESC);
CREATE INDEX idx_transparency_auctions_placement_observed
  ON transparency_auctions (placement_id, observed_at DESC);
CREATE INDEX idx_transparency_auctions_observed
  ON transparency_auctions (observed_at DESC);

CREATE TABLE transparency_auction_candidates (
  id bigserial PRIMARY KEY,
  auction_id uuid NOT NULL REFERENCES transparency_auctions (auction_id) ON DELETE CASCADE,
  observed_at timestamptz NOT NULL,
  source text NOT NULL,
  bid_ecpm numeric(18,6) NOT NULL,
  currency char(3) NOT NULL DEFAULT 'USD',
  response_time_ms integer NOT NULL DEFAULT 0,
  status text NOT NULL,
  metadata_hash char(64) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_transparency_candidates_auction
  ON transparency_auction_candidates (auction_id, observed_at DESC);
CREATE INDEX idx_transparency_candidates_source
  ON transparency_auction_candidates (source, observed_at DESC);

INSERT INTO transparency_auctions (
  id,
  auction_id,
  observed_at,
  publisher_id,
  app_or_site_id,
  placement_id,
  surface_type,
  device_os,
  device_geo,
  att_status,
  tc_string_sha256,
  winner_source,
  winner_bid_ecpm,
  winner_gross_price,
  winner_currency,
  winner_reason,
  aletheia_fee_bp,
  sample_bps,
  effective_publisher_share,
  integrity_algo,
  integrity_key_id,
  integrity_signature,
  created_at
)
SELECT
  id,
  auction_id,
  observed_at,
  publisher_id,
  app_or_site_id,
  placement_id,
  surface_type,
  device_os,
  device_geo,
  att_status,
  tc_string_sha256,
  winner_source,
  winner_bid_ecpm,
  winner_gross_price,
  winner_currency,
  winner_reason,
  aletheia_fee_bp,
  sample_bps,
  effective_publisher_share,
  integrity_algo,
  integrity_key_id,
  integrity_signature,
  created_at
FROM transparency_auctions_rollback;

INSERT INTO transparency_auction_candidates (
  id,
  auction_id,
  observed_at,
  source,
  bid_ecpm,
  currency,
  response_time_ms,
  status,
  metadata_hash,
  created_at
)
SELECT
  id,
  auction_id,
  observed_at,
  source,
  bid_ecpm,
  currency,
  response_time_ms,
  status,
  metadata_hash,
  created_at
FROM transparency_auction_candidates_rollback;

DROP TABLE IF EXISTS transparency_auction_candidates_rollback;
DROP TABLE IF EXISTS transparency_auctions_rollback;
