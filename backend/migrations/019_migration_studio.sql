-- Migration Studio tables for experiment management, import/mapping, and tracking

-- Experiments table: tracks migration experiments
CREATE TABLE IF NOT EXISTS migration_experiments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    publisher_id UUID NOT NULL REFERENCES publishers(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    app_id UUID REFERENCES apps(id) ON DELETE CASCADE,
    placement_id UUID REFERENCES placements(id) ON DELETE SET NULL,
    
    -- Experiment configuration
    objective TEXT NOT NULL DEFAULT 'revenue_comparison', -- revenue_comparison, fill_rate, latency
    seed TEXT NOT NULL DEFAULT gen_random_uuid()::TEXT, -- Deterministic assignment seed
    mirror_percent INTEGER NOT NULL DEFAULT 0 CHECK (mirror_percent >= 0 AND mirror_percent <= 20), -- 0-20%
    
    -- Status and lifecycle
    status TEXT NOT NULL DEFAULT 'draft', -- draft, active, paused, completed, archived
    activated_at TIMESTAMPTZ,
    paused_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    
    -- Guardrails (persisted config)
    guardrails JSONB NOT NULL DEFAULT '{
        "latency_budget_ms": 500,
        "revenue_floor_percent": -10,
        "max_error_rate_percent": 5,
        "min_impressions": 1000
    }'::jsonb,
    
    -- Metadata
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_migration_experiments_publisher ON migration_experiments(publisher_id);
CREATE INDEX idx_migration_experiments_status ON migration_experiments(status);
CREATE INDEX idx_migration_experiments_placement ON migration_experiments(placement_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_migration_experiments_active_unique
    ON migration_experiments(placement_id, status)
    WHERE status IN ('active', 'paused');

-- Mappings table: maps incumbent adapters/instances to our system
CREATE TABLE IF NOT EXISTS migration_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    experiment_id UUID NOT NULL REFERENCES migration_experiments(id) ON DELETE CASCADE,
    
    -- Incumbent network details (from import)
    incumbent_network TEXT NOT NULL, -- 'ironSource', 'MAX', 'AdMob', etc.
    incumbent_instance_id TEXT NOT NULL,
    incumbent_instance_name TEXT,
    incumbent_waterfall_position INTEGER,
    incumbent_ecpm_cents INTEGER, -- Floor or historical eCPM
    
    -- Our adapter mapping (resolved during import wizard)
    our_adapter_id UUID REFERENCES adapters(id),
    our_adapter_name TEXT,
    mapping_status TEXT NOT NULL DEFAULT 'pending', -- pending, confirmed, skipped, conflict
    mapping_confidence TEXT, -- high, medium, low (auto-mapping confidence)
    
    -- Conflict resolution
    conflict_reason TEXT,
    resolved_by UUID REFERENCES users(id),
    resolved_at TIMESTAMPTZ,
    
    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT unique_incumbent_instance UNIQUE(experiment_id, incumbent_instance_id)
);

CREATE INDEX idx_migration_mappings_experiment ON migration_mappings(experiment_id);
CREATE INDEX idx_migration_mappings_status ON migration_mappings(mapping_status);

-- Events table: logs assignment decisions, guardrail actions, etc.
CREATE TABLE IF NOT EXISTS migration_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    experiment_id UUID NOT NULL REFERENCES migration_experiments(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL, -- assignment, guardrail_pause, guardrail_kill, activation, deactivation
    
    -- Event details
    arm TEXT, -- 'control' or 'test'
    user_identifier TEXT, -- Hashed device/user ID (for deterministic assignment tracking)
    placement_id UUID REFERENCES placements(id),
    
    -- Context
    event_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    reason TEXT,
    triggered_by UUID REFERENCES users(id), -- For manual actions
    
    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_migration_events_experiment ON migration_events(experiment_id);
CREATE INDEX idx_migration_events_type ON migration_events(event_type);
CREATE INDEX idx_migration_events_created_at ON migration_events(created_at);
CREATE INDEX idx_migration_events_user_identifier ON migration_events(user_identifier) WHERE user_identifier IS NOT NULL;

-- Audit trail for sensitive operations
CREATE TABLE IF NOT EXISTS migration_audit (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    experiment_id UUID REFERENCES migration_experiments(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id),
    action TEXT NOT NULL, -- create, activate, pause, update_guardrails, update_mappings, delete
    resource_type TEXT NOT NULL, -- experiment, mapping, assignment
    resource_id UUID,
    
    -- Change tracking
    old_value JSONB,
    new_value JSONB,
    
    -- Metadata
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_migration_audit_experiment ON migration_audit(experiment_id);
CREATE INDEX idx_migration_audit_user ON migration_audit(user_id);
CREATE INDEX idx_migration_audit_created_at ON migration_audit(created_at);

-- Shareable report tokens (read-only, expiring)
CREATE TABLE IF NOT EXISTS migration_report_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    experiment_id UUID NOT NULL REFERENCES migration_experiments(id) ON DELETE CASCADE,
    token TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_accessed_at TIMESTAMPTZ,
    access_count INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_migration_report_tokens_experiment ON migration_report_tokens(experiment_id);
CREATE INDEX idx_migration_report_tokens_token ON migration_report_tokens(token);
CREATE INDEX idx_migration_report_tokens_expires_at ON migration_report_tokens(expires_at);

COMMENT ON TABLE migration_experiments IS 'Tracks migration experiments for A/B testing our stack vs incumbent mediation';
COMMENT ON TABLE migration_mappings IS 'Maps incumbent adapter instances to our adapters during import';
COMMENT ON TABLE migration_events IS 'Logs all events related to experiments (assignments, guardrails, etc.)';
COMMENT ON TABLE migration_audit IS 'Audit trail for sensitive experiment operations';
COMMENT ON TABLE migration_report_tokens IS 'Shareable, read-only report links with expiration';
