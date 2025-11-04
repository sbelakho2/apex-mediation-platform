-- 008_sales_automation.sql
-- Database schema for usage metering, dunning management, and email automation

-- Usage alerts tracking
CREATE TABLE IF NOT EXISTS usage_alerts (
  id SERIAL PRIMARY KEY,
  customer_id VARCHAR(255) NOT NULL,
  alert_type VARCHAR(50) NOT NULL, -- 'usage_80', 'usage_90', 'usage_100', 'usage_110'
  usage_amount BIGINT NOT NULL,
  limit_amount BIGINT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_usage_alerts_customer FOREIGN KEY (customer_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_usage_alerts_customer (customer_id),
  INDEX idx_usage_alerts_created (created_at)
);

-- Dunning attempts tracking
CREATE TABLE IF NOT EXISTS dunning_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id VARCHAR(255) NOT NULL,
  subscription_id VARCHAR(255) NOT NULL,
  invoice_id VARCHAR(255) NOT NULL,
  attempt_number INT NOT NULL DEFAULT 0,
  next_retry_at TIMESTAMP,
  status VARCHAR(20) NOT NULL DEFAULT 'pending', -- 'pending', 'retrying', 'succeeded', 'failed', 'suspended'
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_dunning_customer FOREIGN KEY (customer_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_dunning_customer (customer_id),
  INDEX idx_dunning_status (status),
  INDEX idx_dunning_next_retry (next_retry_at),
  UNIQUE INDEX idx_dunning_invoice (invoice_id)
);

-- Events table for async event processing
CREATE TABLE IF NOT EXISTS events (
  id SERIAL PRIMARY KEY,
  event_type VARCHAR(100) NOT NULL,
  data JSONB NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMP,
  error_message TEXT,
  INDEX idx_events_type (event_type),
  INDEX idx_events_processed (processed_at),
  INDEX idx_events_created (created_at)
);

-- Email log for tracking sent emails (prevent duplicates)
CREATE TABLE IF NOT EXISTS email_log (
  id SERIAL PRIMARY KEY,
  customer_id VARCHAR(255) NOT NULL,
  email_type VARCHAR(100) NOT NULL,
  sent_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_email_log_customer FOREIGN KEY (customer_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_email_log_customer (customer_id),
  INDEX idx_email_log_type (email_type),
  INDEX idx_email_log_sent (sent_at)
);

-- Update subscriptions table to track payment failures
ALTER TABLE subscriptions 
ADD COLUMN IF NOT EXISTS failed_payment_count INT NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_payment_failure_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMP;

-- Update API keys table to track suspension
ALTER TABLE api_keys
ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMP;

-- ClickHouse table for fast analytics (run in ClickHouse, not PostgreSQL)
-- This is for reference only, create manually in ClickHouse:
/*
CREATE TABLE IF NOT EXISTS apexmediation.usage_events (
  customer_id String,
  metric_type LowCardinality(String), -- 'impressions', 'api_calls', 'data_transfer'
  quantity UInt64,
  metadata String,
  timestamp DateTime
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (customer_id, timestamp)
TTL timestamp + INTERVAL 1 YEAR; -- Keep 1 year of detailed data
*/

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_usage_records_customer_date 
ON usage_records (customer_id, recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_subscriptions_status 
ON subscriptions (status) WHERE status IN ('active', 'trialing', 'past_due');

-- Add comments for documentation
COMMENT ON TABLE usage_alerts IS 'Tracks usage alert notifications sent to customers';
COMMENT ON TABLE dunning_attempts IS 'Tracks payment retry attempts for failed payments';
COMMENT ON TABLE events IS 'Event queue for async processing (emails, webhooks, etc.)';
COMMENT ON TABLE email_log IS 'Prevents duplicate email sends within time windows';

-- Grant permissions (adjust based on your database user)
-- GRANT SELECT, INSERT, UPDATE ON usage_alerts TO apexmediation_app;
-- GRANT SELECT, INSERT, UPDATE ON dunning_attempts TO apexmediation_app;
-- GRANT SELECT, INSERT, UPDATE ON events TO apexmediation_app;
-- GRANT SELECT, INSERT ON email_log TO apexmediation_app;
