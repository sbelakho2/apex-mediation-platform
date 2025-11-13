-- Shadow and mirroring support tables for Migration Studio

CREATE TABLE IF NOT EXISTS migration_feature_flags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    publisher_id UUID NOT NULL REFERENCES publishers(id) ON DELETE CASCADE,
    app_id UUID REFERENCES apps(id) ON DELETE CASCADE,
    placement_id UUID REFERENCES placements(id) ON DELETE CASCADE,
    shadow_enabled BOOLEAN NOT NULL DEFAULT false,
    mirroring_enabled BOOLEAN NOT NULL DEFAULT false,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_migration_feature_flags_publisher ON migration_feature_flags(publisher_id);
CREATE INDEX IF NOT EXISTS idx_migration_feature_flags_app ON migration_feature_flags(app_id);
CREATE INDEX IF NOT EXISTS idx_migration_feature_flags_placement ON migration_feature_flags(placement_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_migration_feature_flags_scope
ON migration_feature_flags (
    publisher_id,
    COALESCE(app_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(placement_id, '00000000-0000-0000-0000-000000000000'::uuid)
);

CREATE TABLE IF NOT EXISTS migration_shadow_outcomes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    experiment_id UUID NOT NULL REFERENCES migration_experiments(id) ON DELETE CASCADE,
    request_id TEXT NOT NULL,
    placement_id UUID REFERENCES placements(id) ON DELETE SET NULL,
    arm TEXT NOT NULL,
    mode TEXT NOT NULL,
    status TEXT NOT NULL,
    adapter_name TEXT,
    adapter_id TEXT,
    bid_cpm NUMERIC(10,4),
    currency TEXT DEFAULT 'USD',
    latency_ms INTEGER,
    mirror_percent INTEGER,
    bids JSONB NOT NULL DEFAULT '[]'::jsonb,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    error_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_migration_shadow_outcomes_experiment ON migration_shadow_outcomes(experiment_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_migration_shadow_outcomes_status ON migration_shadow_outcomes(status);
CREATE INDEX IF NOT EXISTS idx_migration_shadow_outcomes_mode ON migration_shadow_outcomes(mode);

COMMENT ON TABLE migration_feature_flags IS 'Scoped feature flags for enabling migration experiments per publisher/app/placement';
COMMENT ON TABLE migration_shadow_outcomes IS 'Virtual auction outcomes captured for migration shadow/mirroring experiments';
