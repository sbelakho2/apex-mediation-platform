SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

DO $$
BEGIN
  IF to_regclass('analytics_impressions_rollback') IS NULL THEN
    EXECUTE 'CREATE TABLE analytics_impressions_rollback AS SELECT * FROM analytics_impressions';
  END IF;
  IF to_regclass('analytics_clicks_rollback') IS NULL THEN
    EXECUTE 'CREATE TABLE analytics_clicks_rollback AS SELECT * FROM analytics_clicks';
  END IF;
  IF to_regclass('analytics_revenue_events_rollback') IS NULL THEN
    EXECUTE 'CREATE TABLE analytics_revenue_events_rollback AS SELECT * FROM analytics_revenue_events';
  END IF;
END$$;

DROP TABLE IF EXISTS analytics_impressions CASCADE;
DROP TABLE IF EXISTS analytics_clicks CASCADE;
DROP TABLE IF EXISTS analytics_revenue_events CASCADE;

-- recreate non-partitioned tables identical to the original definitions
CREATE TABLE analytics_impressions (
  id bigserial PRIMARY KEY,
  event_id uuid NOT NULL,
  observed_at timestamptz NOT NULL,
  publisher_id text NOT NULL,
  app_id text,
  placement_id text,
  adapter_id text,
  adapter_name text,
  ad_unit_id text,
  ad_format text,
  country_code char(2) DEFAULT 'ZZ',
  device_type text,
  os text,
  os_version text,
  session_id text,
  user_id text,
  request_id text,
  status text,
  filled boolean NOT NULL DEFAULT false,
  viewable boolean NOT NULL DEFAULT false,
  measurable boolean NOT NULL DEFAULT false,
  view_duration_ms integer NOT NULL DEFAULT 0,
  latency_ms integer,
  revenue_usd numeric(18,6) NOT NULL DEFAULT 0,
  is_test_mode boolean NOT NULL DEFAULT false,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id)
);

CREATE INDEX idx_analytics_impressions_publisher_observed
  ON analytics_impressions (publisher_id, observed_at DESC);
CREATE INDEX idx_analytics_impressions_adapter_observed
  ON analytics_impressions (adapter_id, observed_at DESC);
CREATE INDEX idx_analytics_impressions_request
  ON analytics_impressions (request_id);

CREATE TABLE analytics_clicks (
  id bigserial PRIMARY KEY,
  event_id uuid NOT NULL,
  observed_at timestamptz NOT NULL,
  impression_id uuid,
  publisher_id text NOT NULL,
  app_id text,
  placement_id text,
  adapter_id text,
  adapter_name text,
  click_url text,
  country_code char(2) DEFAULT 'ZZ',
  device_type text,
  os text,
  session_id text,
  user_id text,
  request_id text,
  time_to_click_ms integer,
  is_verified boolean NOT NULL DEFAULT false,
  is_test_mode boolean NOT NULL DEFAULT false,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id)
);

CREATE INDEX idx_analytics_clicks_publisher_observed
  ON analytics_clicks (publisher_id, observed_at DESC);
CREATE INDEX idx_analytics_clicks_adapter_observed
  ON analytics_clicks (adapter_id, observed_at DESC);
CREATE INDEX idx_analytics_clicks_impression
  ON analytics_clicks (impression_id);

CREATE TABLE analytics_revenue_events (
  id bigserial PRIMARY KEY,
  event_id uuid NOT NULL,
  observed_at timestamptz NOT NULL,
  publisher_id text NOT NULL,
  app_id text,
  placement_id text,
  adapter_id text,
  adapter_name text,
  impression_id uuid,
  revenue_type text NOT NULL,
  revenue_usd numeric(18,6) NOT NULL DEFAULT 0,
  revenue_currency char(3) NOT NULL DEFAULT 'USD',
  revenue_original numeric(18,6),
  exchange_rate numeric(10,6),
  ecpm_usd numeric(18,6),
  country_code char(2) DEFAULT 'ZZ',
  ad_format text,
  os text,
  is_test_mode boolean NOT NULL DEFAULT false,
  reconciliation_status text NOT NULL DEFAULT 'pending',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id)
);

CREATE INDEX idx_analytics_revenue_publisher_observed
  ON analytics_revenue_events (publisher_id, observed_at DESC);
CREATE INDEX idx_analytics_revenue_impression
  ON analytics_revenue_events (impression_id);
CREATE INDEX idx_analytics_revenue_type_observed
  ON analytics_revenue_events (revenue_type, observed_at DESC);

INSERT INTO analytics_impressions
SELECT * FROM analytics_impressions_rollback;
INSERT INTO analytics_clicks
SELECT * FROM analytics_clicks_rollback;
INSERT INTO analytics_revenue_events
SELECT * FROM analytics_revenue_events_rollback;

DROP TABLE IF EXISTS analytics_impressions_rollback;
DROP TABLE IF EXISTS analytics_clicks_rollback;
DROP TABLE IF EXISTS analytics_revenue_events_rollback;
