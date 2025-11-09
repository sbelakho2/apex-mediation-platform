-- Migration 008: Email Automation Infrastructure
-- Email queue, templates, personalization, delivery tracking, and A/B testing

CREATE TABLE IF NOT EXISTS email_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    template_name VARCHAR(100) NOT NULL,
    personalization_data JSONB DEFAULT '{}',
    scheduled_for TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    sent_at TIMESTAMP WITH TIME ZONE,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'bounced', 'cancelled')),
    error_message TEXT,
    retries INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    priority INTEGER DEFAULT 5, -- 1-10, lower = higher priority
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_email_queue_status ON email_queue (status);
CREATE INDEX IF NOT EXISTS idx_email_queue_scheduled ON email_queue (scheduled_for);
CREATE INDEX IF NOT EXISTS idx_email_queue_customer ON email_queue (customer_id);
CREATE INDEX IF NOT EXISTS idx_email_queue_template ON email_queue (template_name);

CREATE TABLE IF NOT EXISTS email_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_name VARCHAR(100) UNIQUE NOT NULL,
    subject_line TEXT NOT NULL,
    html_body TEXT NOT NULL,
    text_body TEXT,
    from_email VARCHAR(255) DEFAULT 'noreply@apexmediation.com',
    from_name VARCHAR(255) DEFAULT 'Apex Mediation',
    category VARCHAR(50), -- 'transactional', 'marketing', 'lifecycle'
    personalization_vars TEXT[], -- ['first_name', 'company_name', 'usage_stats']
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_email_templates_name ON email_templates (template_name);
CREATE INDEX IF NOT EXISTS idx_email_templates_category ON email_templates (category);
CREATE INDEX IF NOT EXISTS idx_email_templates_active ON email_templates (active);

CREATE TABLE IF NOT EXISTS email_delivery_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email_queue_id UUID NOT NULL REFERENCES email_queue(id) ON DELETE CASCADE,
    event_type VARCHAR(50) NOT NULL CHECK (event_type IN (
        'sent', 'delivered', 'opened', 'clicked', 'bounced', 'complained', 'unsubscribed'
    )),
    event_timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    metadata JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_email_delivery_queue ON email_delivery_events (email_queue_id);
CREATE INDEX IF NOT EXISTS idx_email_delivery_type ON email_delivery_events (event_type);
CREATE INDEX IF NOT EXISTS idx_email_delivery_timestamp ON email_delivery_events (event_timestamp);

CREATE TABLE IF NOT EXISTS email_ab_tests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    test_name VARCHAR(100) NOT NULL,
    template_name VARCHAR(100) NOT NULL,
    variant_a_subject TEXT NOT NULL,
    variant_b_subject TEXT NOT NULL,
    variant_a_sent INTEGER DEFAULT 0,
    variant_b_sent INTEGER DEFAULT 0,
    variant_a_opened INTEGER DEFAULT 0,
    variant_b_opened INTEGER DEFAULT 0,
    variant_a_clicked INTEGER DEFAULT 0,
    variant_b_clicked INTEGER DEFAULT 0,
    winner VARCHAR(10), -- 'a' or 'b'
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
    start_date DATE NOT NULL DEFAULT CURRENT_DATE,
    end_date DATE,
    confidence_level DECIMAL(3,2),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (test_name, template_name)
);

CREATE INDEX IF NOT EXISTS idx_email_ab_test_name ON email_ab_tests (test_name);
CREATE INDEX IF NOT EXISTS idx_email_ab_test_status ON email_ab_tests (status);

CREATE TABLE IF NOT EXISTS email_unsubscribes (
    customer_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    unsubscribed_from TEXT[] DEFAULT '{}', -- ['marketing', 'lifecycle', 'product_updates']
    unsubscribe_reason TEXT,
    unsubscribed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_email_unsub_date ON email_unsubscribes (unsubscribed_at);

COMMENT ON TABLE email_queue IS 'Outbound email queue processed every minute by EmailAutomationService';
COMMENT ON TABLE email_templates IS 'Email templates with personalization variables for lifecycle emails';
COMMENT ON TABLE email_delivery_events IS 'Webhook events from email provider (SendGrid, Resend, SES)';
COMMENT ON TABLE email_ab_tests IS 'A/B tests for email subject lines and content';
COMMENT ON TABLE email_unsubscribes IS 'Customer unsubscribe preferences by email category';
