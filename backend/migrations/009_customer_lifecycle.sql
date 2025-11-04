-- Migration 009: Customer Lifecycle & Events
-- Generic events table, customer milestones, usage tracking, and analytics

CREATE TABLE IF NOT EXISTS events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type VARCHAR(100) NOT NULL,
    data JSONB DEFAULT '{}',
    customer_id UUID REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    processed BOOLEAN DEFAULT false,
    processed_at TIMESTAMP WITH TIME ZONE,
    
    INDEX idx_events_type (event_type),
    INDEX idx_events_customer (customer_id),
    INDEX idx_events_created (created_at),
    INDEX idx_events_processed (processed)
);

CREATE TABLE IF NOT EXISTS customer_milestones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    milestone_type VARCHAR(100) NOT NULL, -- 'first_impression', '100_impressions', '1k_impressions', etc.
    milestone_value BIGINT NOT NULL, -- e.g., 100, 1000, 10000
    achieved_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    celebrated BOOLEAN DEFAULT false,
    email_sent BOOLEAN DEFAULT false,
    data JSONB DEFAULT '{}',
    
    INDEX idx_customer_milestones_customer (customer_id),
    INDEX idx_customer_milestones_type (milestone_type),
    INDEX idx_customer_milestones_achieved (achieved_at),
    
    UNIQUE (customer_id, milestone_type)
);

CREATE TABLE IF NOT EXISTS usage_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    record_date DATE NOT NULL DEFAULT CURRENT_DATE,
    impressions BIGINT DEFAULT 0,
    clicks BIGINT DEFAULT 0,
    revenue_cents INTEGER DEFAULT 0,
    api_calls INTEGER DEFAULT 0,
    bandwidth_bytes BIGINT DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    INDEX idx_usage_customer (customer_id),
    INDEX idx_usage_date (record_date),
    
    UNIQUE (customer_id, record_date)
);

CREATE TABLE IF NOT EXISTS usage_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    event_name VARCHAR(100) NOT NULL,
    event_value BIGINT NOT NULL,
    event_metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    stripe_synced BOOLEAN DEFAULT false,
    stripe_synced_at TIMESTAMP WITH TIME ZONE,
    
    INDEX idx_usage_events_customer (customer_id),
    INDEX idx_usage_events_name (event_name),
    INDEX idx_usage_events_created (created_at),
    INDEX idx_usage_events_synced (stripe_synced)
);

CREATE TABLE IF NOT EXISTS analytics_views (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    view_date DATE NOT NULL DEFAULT CURRENT_DATE,
    dashboard_page VARCHAR(100) NOT NULL,
    view_count INTEGER DEFAULT 1,
    total_time_seconds INTEGER DEFAULT 0,
    
    INDEX idx_analytics_views_customer (customer_id),
    INDEX idx_analytics_views_date (view_date),
    INDEX idx_analytics_views_page (dashboard_page),
    
    UNIQUE (customer_id, view_date, dashboard_page)
);

CREATE TABLE IF NOT EXISTS api_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    endpoint VARCHAR(255) NOT NULL,
    method VARCHAR(10) NOT NULL,
    status_code INTEGER NOT NULL,
    response_time_ms INTEGER NOT NULL,
    request_size_bytes INTEGER DEFAULT 0,
    response_size_bytes INTEGER DEFAULT 0,
    ip_address INET,
    user_agent TEXT,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    INDEX idx_api_logs_user (user_id),
    INDEX idx_api_logs_endpoint (endpoint),
    INDEX idx_api_logs_status (status_code),
    INDEX idx_api_logs_created (created_at)
);

CREATE TABLE IF NOT EXISTS sdk_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID REFERENCES users(id) ON DELETE SET NULL,
    event_type VARCHAR(50) NOT NULL, -- 'ad_load', 'ad_show', 'ad_click', 'error', 'anr'
    platform VARCHAR(20) NOT NULL, -- 'android', 'ios', 'unity'
    sdk_version VARCHAR(20),
    app_version VARCHAR(50),
    device_model VARCHAR(100),
    os_version VARCHAR(50),
    event_metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    INDEX idx_sdk_events_customer (customer_id),
    INDEX idx_sdk_events_type (event_type),
    INDEX idx_sdk_events_platform (platform),
    INDEX idx_sdk_events_created (created_at)
);

CREATE TABLE IF NOT EXISTS support_tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    subject VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    priority VARCHAR(20) DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
    status VARCHAR(20) DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'waiting_on_customer', 'resolved', 'closed')),
    assigned_to VARCHAR(255),
    category VARCHAR(50),
    resolution_time_hours INTEGER,
    customer_satisfaction_score INTEGER CHECK (customer_satisfaction_score BETWEEN 1 AND 5),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    INDEX idx_support_tickets_customer (customer_id),
    INDEX idx_support_tickets_status (status),
    INDEX idx_support_tickets_priority (priority),
    INDEX idx_support_tickets_created (created_at)
);

CREATE TABLE IF NOT EXISTS subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    plan_type VARCHAR(50) NOT NULL, -- 'indie', 'studio', 'enterprise'
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('trial', 'active', 'past_due', 'cancelled', 'paused')),
    plan_limit_impressions BIGINT NOT NULL,
    stripe_subscription_id VARCHAR(255) UNIQUE,
    stripe_customer_id VARCHAR(255),
    current_period_start DATE,
    current_period_end DATE,
    trial_start DATE,
    trial_end DATE,
    cancelled_at TIMESTAMP WITH TIME ZONE,
    cancellation_reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    INDEX idx_subscriptions_customer (customer_id),
    INDEX idx_subscriptions_status (status),
    INDEX idx_subscriptions_stripe (stripe_subscription_id),
    
    UNIQUE (customer_id)
);

CREATE TABLE IF NOT EXISTS payment_failures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    subscription_id UUID REFERENCES subscriptions(id) ON DELETE CASCADE,
    amount_cents INTEGER NOT NULL,
    currency VARCHAR(3) DEFAULT 'USD',
    failure_reason TEXT NOT NULL,
    stripe_error_code VARCHAR(100),
    retry_count INTEGER DEFAULT 0,
    next_retry_at TIMESTAMP WITH TIME ZONE,
    resolved BOOLEAN DEFAULT false,
    resolved_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    INDEX idx_payment_failures_customer (customer_id),
    INDEX idx_payment_failures_resolved (resolved),
    INDEX idx_payment_failures_created (created_at)
);

-- Aggregate view for customer activity dashboard
CREATE OR REPLACE VIEW customer_activity_summary AS
SELECT 
    u.id as customer_id,
    u.email,
    s.plan_type,
    s.status as subscription_status,
    COALESCE(ur.total_impressions_30d, 0) as impressions_last_30d,
    COALESCE(ur.total_revenue_cents_30d, 0) as revenue_cents_last_30d,
    COALESCE(av.dashboard_views_7d, 0) as dashboard_views_last_7d,
    COALESCE(al.api_calls_7d, 0) as api_calls_last_7d,
    COALESCE(st.open_tickets, 0) as open_support_tickets,
    COALESCE(pf.recent_payment_failures, 0) as payment_failures_30d,
    u.created_at as customer_since
FROM users u
LEFT JOIN subscriptions s ON u.id = s.customer_id
LEFT JOIN LATERAL (
    SELECT 
        SUM(impressions) as total_impressions_30d,
        SUM(revenue_cents) as total_revenue_cents_30d
    FROM usage_records
    WHERE customer_id = u.id
      AND record_date > CURRENT_DATE - INTERVAL '30 days'
) ur ON true
LEFT JOIN LATERAL (
    SELECT COUNT(*) as dashboard_views_7d
    FROM analytics_views
    WHERE customer_id = u.id
      AND view_date > CURRENT_DATE - INTERVAL '7 days'
) av ON true
LEFT JOIN LATERAL (
    SELECT COUNT(*) as api_calls_7d
    FROM api_logs
    WHERE user_id = u.id
      AND created_at > NOW() - INTERVAL '7 days'
) al ON true
LEFT JOIN LATERAL (
    SELECT COUNT(*) as open_tickets
    FROM support_tickets
    WHERE customer_id = u.id
      AND status IN ('open', 'in_progress')
) st ON true
LEFT JOIN LATERAL (
    SELECT COUNT(*) as recent_payment_failures
    FROM payment_failures
    WHERE customer_id = u.id
      AND created_at > NOW() - INTERVAL '30 days'
      AND resolved = false
) pf ON true
WHERE u.role = 'customer';

COMMENT ON TABLE events IS 'Generic events table for async processing (email triggers, webhooks, background jobs)';
COMMENT ON TABLE customer_milestones IS 'Customer achievement tracking (first impression, 1K impressions, etc.)';
COMMENT ON TABLE usage_records IS 'Daily aggregated usage metrics per customer';
COMMENT ON TABLE usage_events IS 'Granular usage events for Stripe usage-based billing sync';
COMMENT ON TABLE analytics_views IS 'Dashboard page view tracking for engagement scoring';
COMMENT ON TABLE api_logs IS 'API request logs for performance monitoring and rate limiting';
COMMENT ON TABLE sdk_events IS 'SDK telemetry events (ad loads, errors, ANRs)';
COMMENT ON TABLE support_tickets IS 'Customer support ticket tracking';
COMMENT ON TABLE subscriptions IS 'Customer subscription plans and Stripe integration';
COMMENT ON TABLE payment_failures IS 'Failed payment tracking for dunning management';
