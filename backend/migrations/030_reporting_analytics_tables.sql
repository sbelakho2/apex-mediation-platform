-- Reporting analytics tables required by the Postgres-backed reporting service
-- These tables replace the previous ClickHouse projections so integration tests
-- can exercise reporting endpoints end-to-end using PostgreSQL only.

CREATE TABLE IF NOT EXISTS analytics_revenue_events (
    id BIGSERIAL PRIMARY KEY,
    event_id UUID NOT NULL DEFAULT gen_random_uuid(),
    observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    publisher_id UUID NOT NULL,
    app_id UUID,
    placement_id UUID,
    adapter_id TEXT,
    adapter_name TEXT,
    impression_id UUID,
    revenue_type TEXT NOT NULL DEFAULT 'impression',
    revenue_usd NUMERIC(18,6) NOT NULL DEFAULT 0,
    revenue_currency CHAR(3) NOT NULL DEFAULT 'USD',
    revenue_original NUMERIC(18,6),
    exchange_rate NUMERIC(10,6),
    ecpm_usd NUMERIC(18,6),
    country_code CHAR(2) NOT NULL DEFAULT 'ZZ',
    ad_format TEXT,
    os TEXT,
    is_test_mode BOOLEAN NOT NULL DEFAULT false,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_analytics_revenue_publisher_observed
    ON analytics_revenue_events (publisher_id, observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_revenue_impression
    ON analytics_revenue_events (impression_id);
CREATE INDEX IF NOT EXISTS idx_analytics_revenue_type_observed
    ON analytics_revenue_events (revenue_type, observed_at DESC);

CREATE TABLE IF NOT EXISTS analytics_impressions (
    id BIGSERIAL PRIMARY KEY,
    event_id UUID NOT NULL DEFAULT gen_random_uuid(),
    observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    publisher_id UUID NOT NULL,
    app_id UUID,
    placement_id UUID,
    adapter_id TEXT,
    adapter_name TEXT,
    request_id UUID,
    status TEXT,
    filled BOOLEAN NOT NULL DEFAULT false,
    latency_ms INTEGER,
    revenue_usd NUMERIC(18,6) NOT NULL DEFAULT 0,
    is_test_mode BOOLEAN NOT NULL DEFAULT false,
    meta JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_analytics_impressions_publisher_observed
    ON analytics_impressions (publisher_id, observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_impressions_adapter_observed
    ON analytics_impressions (adapter_id, observed_at DESC);

CREATE TABLE IF NOT EXISTS analytics_sdk_telemetry (
    id BIGSERIAL PRIMARY KEY,
    event_id UUID NOT NULL DEFAULT gen_random_uuid(),
    observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    publisher_id UUID NOT NULL,
    adapter_id TEXT,
    event_type TEXT NOT NULL,
    message TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_analytics_telemetry_publisher_observed
    ON analytics_sdk_telemetry (publisher_id, observed_at DESC);
