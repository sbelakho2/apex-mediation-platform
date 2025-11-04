-- A/B Testing core tables

CREATE TABLE IF NOT EXISTS ab_experiments (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  type TEXT NOT NULL CHECK (type IN ('floor_price','adapter_priority','placement_optimization','waterfall_order')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','running','paused','completed')),
  publisher_id UUID NOT NULL REFERENCES publishers(id) ON DELETE CASCADE,
  target_sample_size INTEGER NOT NULL CHECK (target_sample_size > 0),
  confidence_level NUMERIC(4,2) NOT NULL DEFAULT 0.95,
  start_date TIMESTAMPTZ,
  end_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ab_experiments_publisher_id ON ab_experiments(publisher_id);
CREATE INDEX IF NOT EXISTS idx_ab_experiments_status ON ab_experiments(status);
CREATE INDEX IF NOT EXISTS idx_ab_experiments_start_date ON ab_experiments(start_date);

CREATE TABLE IF NOT EXISTS ab_variants (
  id TEXT PRIMARY KEY,
  experiment_id TEXT NOT NULL REFERENCES ab_experiments(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  traffic_allocation NUMERIC(5,2) NOT NULL CHECK (traffic_allocation >= 0 AND traffic_allocation <= 100),
  configuration JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ab_variants_experiment_id ON ab_variants(experiment_id);

CREATE TABLE IF NOT EXISTS ab_events (
  id TEXT PRIMARY KEY,
  experiment_id TEXT NOT NULL REFERENCES ab_experiments(id) ON DELETE CASCADE,
  variant_id TEXT NOT NULL REFERENCES ab_variants(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('impression','click','conversion')),
  revenue NUMERIC(18,6) NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ab_events_experiment_id ON ab_events(experiment_id);
CREATE INDEX IF NOT EXISTS idx_ab_events_variant_id ON ab_events(variant_id);
CREATE INDEX IF NOT EXISTS idx_ab_events_type ON ab_events(event_type);
CREATE INDEX IF NOT EXISTS idx_ab_events_created_at ON ab_events(created_at DESC);

-- Comments
COMMENT ON TABLE ab_experiments IS 'Core A/B test experiments';
COMMENT ON TABLE ab_variants IS 'Variants within an A/B test experiment';
COMMENT ON TABLE ab_events IS 'Tracked events contributing to variant metrics';
