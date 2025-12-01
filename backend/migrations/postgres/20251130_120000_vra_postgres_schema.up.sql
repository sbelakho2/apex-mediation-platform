-- VRA analytics schema on managed Postgres (replacement for ClickHouse recon_* tables)
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE TABLE IF NOT EXISTS recon_statements_raw (
  id bigserial PRIMARY KEY,
  network text NOT NULL,
  schema_ver integer NOT NULL,
  load_id text NOT NULL,
  raw_blob text NOT NULL,
  loaded_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (network, load_id)
);

CREATE INDEX IF NOT EXISTS idx_recon_statements_raw_loaded_at ON recon_statements_raw (loaded_at DESC);

CREATE TABLE IF NOT EXISTS recon_statements_norm (
  id bigserial PRIMARY KEY,
  event_date date NOT NULL,
  app_id text NOT NULL,
  ad_unit_id text NOT NULL,
  country text NOT NULL,
  format text NOT NULL,
  currency char(3) NOT NULL,
  impressions bigint NOT NULL CHECK (impressions >= 0),
  clicks bigint CHECK (clicks IS NULL OR clicks >= 0),
  paid numeric(18,6) NOT NULL,
  ivt_adjustments numeric(18,6),
  report_id text NOT NULL,
  network text NOT NULL,
  schema_ver integer NOT NULL,
  loaded_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recon_statements_norm_app_unit_date ON recon_statements_norm (app_id, ad_unit_id, event_date);
CREATE INDEX IF NOT EXISTS idx_recon_statements_norm_network_date ON recon_statements_norm (network, event_date DESC);

CREATE TABLE IF NOT EXISTS recon_expected (
  id bigserial PRIMARY KEY,
  event_date date NOT NULL,
  request_id text NOT NULL,
  placement_id text NOT NULL,
  expected_value numeric(18,6) NOT NULL,
  currency char(3) NOT NULL,
  floors jsonb NOT NULL DEFAULT '{}'::jsonb,
  receipt_hash text NOT NULL,
  viewability jsonb NOT NULL DEFAULT '{}'::jsonb,
  ts timestamptz NOT NULL DEFAULT now(),
  UNIQUE (request_id)
);

CREATE INDEX IF NOT EXISTS idx_recon_expected_event_date ON recon_expected (event_date, placement_id);
CREATE INDEX IF NOT EXISTS idx_recon_expected_ts ON recon_expected (ts DESC);

CREATE TABLE IF NOT EXISTS recon_match (
  id bigserial PRIMARY KEY,
  statement_id text NOT NULL,
  request_id text NOT NULL,
  link_confidence numeric(5,2) NOT NULL CHECK (link_confidence >= 0 AND link_confidence <= 100),
  keys_used text NOT NULL DEFAULT '',
  matched_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (statement_id, request_id)
);

CREATE INDEX IF NOT EXISTS idx_recon_match_matched_at ON recon_match (matched_at DESC);

CREATE TABLE IF NOT EXISTS recon_match_review (
  id bigserial PRIMARY KEY,
  statement_id text NOT NULL,
  request_id text NOT NULL,
  link_confidence numeric(5,2) NOT NULL CHECK (link_confidence >= 0 AND link_confidence <= 100),
  keys_used text NOT NULL DEFAULT '',
  reasons jsonb NOT NULL DEFAULT '{}'::jsonb,
  matched_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recon_match_review_matched_at ON recon_match_review (matched_at DESC);

CREATE TABLE IF NOT EXISTS recon_deltas (
  id bigserial PRIMARY KEY,
  kind text NOT NULL,
  amount numeric(18,6) NOT NULL,
  currency char(3) NOT NULL,
  reason_code text,
  window_start timestamptz NOT NULL,
  window_end timestamptz NOT NULL,
  evidence_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  confidence real NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_recon_deltas_kind_window ON recon_deltas (kind, window_start);
CREATE INDEX IF NOT EXISTS idx_recon_deltas_evidence ON recon_deltas (evidence_id);

CREATE TABLE IF NOT EXISTS recon_disputes (
  id bigserial PRIMARY KEY,
  dispute_id text NOT NULL,
  network text NOT NULL,
  amount numeric(18,6) NOT NULL,
  status text NOT NULL,
  evidence_uri text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (dispute_id)
);

CREATE INDEX IF NOT EXISTS idx_recon_disputes_network ON recon_disputes (network, created_at DESC);

CREATE TABLE IF NOT EXISTS proofs_daily_roots (
  day date PRIMARY KEY,
  merkle_root text NOT NULL,
  sig text NOT NULL,
  published_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_proofs_daily_roots_published ON proofs_daily_roots (published_at DESC);

CREATE TABLE IF NOT EXISTS proofs_monthly_digest (
  month char(7) PRIMARY KEY,
  digest text NOT NULL,
  sig text NOT NULL,
  coverage_pct numeric(5,2) NOT NULL DEFAULT 0,
  notes text NOT NULL DEFAULT ''
);
