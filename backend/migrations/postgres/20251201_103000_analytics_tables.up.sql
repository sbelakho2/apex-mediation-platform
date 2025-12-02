-- Analytics fact tables replacing ClickHouse dependencies
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE TABLE IF NOT EXISTS analytics_impressions (
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

CREATE INDEX IF NOT EXISTS idx_analytics_impressions_publisher_observed
  ON analytics_impressions (publisher_id, observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_impressions_adapter_observed
  ON analytics_impressions (adapter_id, observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_impressions_request
  ON analytics_impressions (request_id);

CREATE TABLE IF NOT EXISTS analytics_clicks (
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

CREATE INDEX IF NOT EXISTS idx_analytics_clicks_publisher_observed
  ON analytics_clicks (publisher_id, observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_clicks_adapter_observed
  ON analytics_clicks (adapter_id, observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_clicks_impression
  ON analytics_clicks (impression_id);

CREATE TABLE IF NOT EXISTS analytics_revenue_events (
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

CREATE INDEX IF NOT EXISTS idx_analytics_revenue_publisher_observed
  ON analytics_revenue_events (publisher_id, observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_revenue_impression
  ON analytics_revenue_events (impression_id);
CREATE INDEX IF NOT EXISTS idx_analytics_revenue_type_observed
  ON analytics_revenue_events (revenue_type, observed_at DESC);

CREATE TABLE IF NOT EXISTS analytics_performance_metrics (
  id bigserial PRIMARY KEY,
  observed_at timestamptz NOT NULL,
  publisher_id text NOT NULL,
  adapter_id text,
  metric_type text NOT NULL,
  metric_value double precision NOT NULL,
  request_id text,
  error_code text,
  error_message text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_analytics_perf_publisher_metric
  ON analytics_performance_metrics (publisher_id, metric_type, observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_perf_adapter
  ON analytics_performance_metrics (adapter_id, observed_at DESC);

CREATE TABLE IF NOT EXISTS analytics_creative_scans (
  id bigserial PRIMARY KEY,
  scan_id uuid NOT NULL,
  observed_at timestamptz NOT NULL,
  publisher_id text NOT NULL,
  creative_id text,
  app_id text,
  adapter_id text,
  passed boolean NOT NULL DEFAULT true,
  risk_score numeric(5,2) NOT NULL DEFAULT 0,
  blocked_category text,
  blocked_reason text,
  violations jsonb NOT NULL DEFAULT '[]'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (scan_id)
);

CREATE INDEX IF NOT EXISTS idx_analytics_creative_scans_publisher
  ON analytics_creative_scans (publisher_id, observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_creative_scans_category
  ON analytics_creative_scans (blocked_category);

CREATE TABLE IF NOT EXISTS analytics_sdk_telemetry (
  id bigserial PRIMARY KEY,
  event_id uuid NOT NULL,
  observed_at timestamptz NOT NULL,
  publisher_id text NOT NULL,
  adapter_id text,
  event_type text NOT NULL,
  severity text,
  message text,
  error_message text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id)
);

CREATE INDEX IF NOT EXISTS idx_analytics_sdk_telemetry_publisher
  ON analytics_sdk_telemetry (publisher_id, observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_sdk_telemetry_adapter
  ON analytics_sdk_telemetry (adapter_id, observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_sdk_telemetry_event_type
  ON analytics_sdk_telemetry (event_type, observed_at DESC);

CREATE TABLE IF NOT EXISTS analytics_fraud_events (
  id bigserial PRIMARY KEY,
  event_id uuid NOT NULL,
  observed_at timestamptz NOT NULL,
  publisher_id text NOT NULL,
  request_id text,
  blocked boolean NOT NULL DEFAULT false,
  fraud_type text,
  revenue_blocked_cents bigint NOT NULL DEFAULT 0,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id)
);

CREATE INDEX IF NOT EXISTS idx_analytics_fraud_publisher
  ON analytics_fraud_events (publisher_id, observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_fraud_type
  ON analytics_fraud_events (fraud_type, observed_at DESC);
