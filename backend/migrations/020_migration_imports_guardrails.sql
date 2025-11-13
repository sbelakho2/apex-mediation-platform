-- Additional structures for Migration Studio imports, guardrails, and reporting

-- Track import jobs independently of mappings
CREATE TABLE IF NOT EXISTS migration_imports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    publisher_id UUID NOT NULL REFERENCES publishers(id) ON DELETE CASCADE,
    experiment_id UUID REFERENCES migration_experiments(id) ON DELETE SET NULL,
    placement_id UUID REFERENCES placements(id) ON DELETE SET NULL,
    source TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft', -- draft, pending_review, completed, failed
    summary JSONB DEFAULT '{}'::jsonb,
    error_message TEXT,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

CREATE INDEX idx_migration_imports_publisher ON migration_imports(publisher_id);
CREATE INDEX idx_migration_imports_experiment ON migration_imports(experiment_id);
CREATE INDEX idx_migration_imports_status ON migration_imports(status);

-- Guardrail snapshot metrics (ingested from analytics pipeline)
CREATE TABLE IF NOT EXISTS migration_guardrail_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    experiment_id UUID NOT NULL REFERENCES migration_experiments(id) ON DELETE CASCADE,
    captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    arm TEXT NOT NULL CHECK (arm IN ('control', 'test')),
    impressions BIGINT NOT NULL DEFAULT 0,
    fills BIGINT NOT NULL DEFAULT 0,
    revenue_micros BIGINT NOT NULL DEFAULT 0,
    latency_p95_ms INTEGER,
    latency_p50_ms INTEGER,
    error_rate_percent NUMERIC(6,2),
    ivt_rate_percent NUMERIC(6,2),
    rolling_window_minutes INTEGER NOT NULL DEFAULT 60
);

CREATE INDEX idx_guardrail_snapshots_experiment ON migration_guardrail_snapshots(experiment_id, captured_at DESC);
CREATE INDEX idx_guardrail_snapshots_arm ON migration_guardrail_snapshots(arm);

-- Mode of experiment (shadow vs mirroring)
ALTER TABLE migration_experiments
    ADD COLUMN IF NOT EXISTS mode TEXT NOT NULL DEFAULT 'shadow', -- shadow, mirroring
    ADD COLUMN IF NOT EXISTS last_guardrail_check TIMESTAMPTZ;

-- Ensure guardrails column always has defaults even when null
UPDATE migration_experiments
SET guardrails = COALESCE(guardrails, '{"latency_budget_ms":500,"revenue_floor_percent":-10,"max_error_rate_percent":5,"min_impressions":1000}'::jsonb);