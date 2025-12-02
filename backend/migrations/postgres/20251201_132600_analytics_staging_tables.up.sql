-- UNLOGGED staging tables for analytics ingestion (guardrail: bulk-friendly staging)
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE UNLOGGED TABLE IF NOT EXISTS analytics_impressions_stage (
  LIKE analytics_impressions INCLUDING DEFAULTS INCLUDING STATISTICS
);

CREATE UNLOGGED TABLE IF NOT EXISTS analytics_clicks_stage (
  LIKE analytics_clicks INCLUDING DEFAULTS INCLUDING STATISTICS
);

CREATE UNLOGGED TABLE IF NOT EXISTS analytics_revenue_events_stage (
  LIKE analytics_revenue_events INCLUDING DEFAULTS INCLUDING STATISTICS
);

TRUNCATE TABLE analytics_impressions_stage;
TRUNCATE TABLE analytics_clicks_stage;
TRUNCATE TABLE analytics_revenue_events_stage;
