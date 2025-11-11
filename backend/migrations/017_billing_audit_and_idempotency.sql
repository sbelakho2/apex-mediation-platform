-- Migration: Billing Audit Trail and Idempotency Tables
-- Required for sections 7.2-7.4

-- Billing audit trail for all billing-related actions
CREATE TABLE IF NOT EXISTS billing_audit (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type VARCHAR(100) NOT NULL, -- 'invoice_created', 'payment_succeeded', 'reconciliation', etc.
    actor VARCHAR(255), -- User email or 'system'
    customer_id UUID REFERENCES users(id) ON DELETE SET NULL,
    data JSONB NOT NULL DEFAULT '{}'::jsonb,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_billing_audit_event_type ON billing_audit(event_type);
CREATE INDEX IF NOT EXISTS idx_billing_audit_customer ON billing_audit(customer_id);
CREATE INDEX IF NOT EXISTS idx_billing_audit_created ON billing_audit(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_billing_audit_actor ON billing_audit(actor);

-- Idempotency tracking for reconciliation and other critical operations
CREATE TABLE IF NOT EXISTS billing_idempotency (
    idempotency_key VARCHAR(255) PRIMARY KEY,
    result_data JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_billing_idempotency_created ON billing_idempotency(created_at);

-- Usage alerts tracking
CREATE TABLE IF NOT EXISTS usage_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    alert_type VARCHAR(50) NOT NULL, -- 'usage_80', 'usage_90', 'usage_100', 'usage_110'
    usage_amount BIGINT NOT NULL,
    limit_amount BIGINT NOT NULL,
    email_sent BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_usage_alerts_customer ON usage_alerts(customer_id);
CREATE INDEX IF NOT EXISTS idx_usage_alerts_type ON usage_alerts(alert_type);
CREATE INDEX IF NOT EXISTS idx_usage_alerts_created ON usage_alerts(created_at DESC);

-- Events table for async processing (if not exists)
CREATE TABLE IF NOT EXISTS events (
    id BIGSERIAL PRIMARY KEY,
    event_type VARCHAR(100) NOT NULL,
    data JSONB NOT NULL DEFAULT '{}'::jsonb,
    processed BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type);
CREATE INDEX IF NOT EXISTS idx_events_processed ON events(processed) WHERE NOT processed;
CREATE INDEX IF NOT EXISTS idx_events_created ON events(created_at DESC);

-- Add missing columns to existing tables if needed
DO $$ 
BEGIN
    -- Add stripe_customer_id to users if not exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'stripe_customer_id'
    ) THEN
        ALTER TABLE users ADD COLUMN stripe_customer_id VARCHAR(255) UNIQUE;
        CREATE INDEX idx_users_stripe_customer ON users(stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;
    END IF;

    -- Add api_key to users if not exists (for API authentication)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'api_key'
    ) THEN
        ALTER TABLE users ADD COLUMN api_key VARCHAR(255) UNIQUE;
        CREATE INDEX idx_users_api_key ON users(api_key) WHERE api_key IS NOT NULL;
    END IF;

    -- Add role column to users for RBAC if not exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'role'
    ) THEN
        ALTER TABLE users ADD COLUMN role VARCHAR(50) DEFAULT 'publisher' 
            CHECK (role IN ('publisher', 'admin', 'readonly'));
    END IF;
END $$;

-- Create subscriptions table if not exists (from accounting system)
CREATE TABLE IF NOT EXISTS subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    plan_type TEXT NOT NULL CHECK (plan_type IN ('indie', 'studio', 'enterprise')),
    plan_name TEXT NOT NULL,
    base_price_cents INTEGER NOT NULL,
    currency TEXT NOT NULL DEFAULT 'USD',
    included_impressions INTEGER NOT NULL,
    included_api_calls INTEGER DEFAULT 100000,
    included_data_transfer_gb INTEGER DEFAULT 50,
    overage_rate_cents INTEGER,
    billing_interval TEXT NOT NULL CHECK (billing_interval IN ('monthly', 'annual')),
    current_period_start DATE NOT NULL,
    current_period_end DATE NOT NULL,
    next_billing_date DATE NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('trial', 'active', 'past_due', 'cancelled', 'suspended')),
    trial_end_date DATE,
    cancelled_at TIMESTAMPTZ,
    cancellation_reason TEXT,
    payment_processor TEXT NOT NULL DEFAULT 'stripe' CHECK (payment_processor IN ('stripe', 'paddle', 'manual')),
    stripe_subscription_id TEXT UNIQUE,
    stripe_customer_id TEXT,
    paddle_subscription_id TEXT UNIQUE,
    failed_payment_count INTEGER NOT NULL DEFAULT 0,
    last_failed_payment_at TIMESTAMPTZ,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_customer_id ON subscriptions(customer_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_next_billing_date ON subscriptions(next_billing_date);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_id ON subscriptions(stripe_subscription_id) WHERE stripe_subscription_id IS NOT NULL;

-- Create usage_records table if not exists
CREATE TABLE IF NOT EXISTS usage_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    metric_type TEXT NOT NULL, -- 'impressions', 'api_calls', 'data_transfer'
    quantity INTEGER NOT NULL CHECK (quantity >= 0),
    metadata JSONB DEFAULT '{}'::jsonb,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_usage_records_customer ON usage_records(customer_id);
CREATE INDEX IF NOT EXISTS idx_usage_records_metric ON usage_records(metric_type);
CREATE INDEX IF NOT EXISTS idx_usage_records_recorded ON usage_records(recorded_at DESC);

COMMENT ON TABLE billing_audit IS 'Audit trail for all billing operations';
COMMENT ON TABLE billing_idempotency IS 'Idempotency key tracking for reconciliation and critical operations';
COMMENT ON TABLE usage_alerts IS 'Tracks usage threshold alerts sent to customers';
COMMENT ON TABLE events IS 'Event queue for async processing of emails and webhooks';
