-- Thompson Sampling for Dynamic Bid Floor Optimization

CREATE TABLE IF NOT EXISTS thompson_sampling_experiments (
    adapter_id UUID NOT NULL REFERENCES adapters(id),
    geo TEXT NOT NULL,
    format TEXT NOT NULL,
    currency TEXT NOT NULL DEFAULT 'USD',
    candidates JSONB NOT NULL,
    last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (adapter_id, geo, format)
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_thompson_sampling_adapter_id 
  ON thompson_sampling_experiments(adapter_id);
CREATE INDEX IF NOT EXISTS idx_thompson_sampling_geo 
  ON thompson_sampling_experiments(geo);
CREATE INDEX IF NOT EXISTS idx_thompson_sampling_format 
  ON thompson_sampling_experiments(format);
CREATE INDEX IF NOT EXISTS idx_thompson_sampling_last_updated 
  ON thompson_sampling_experiments(last_updated DESC);

-- Add comments for documentation
COMMENT ON TABLE thompson_sampling_experiments IS 
  'Thompson Sampling experiments for dynamic bid floor optimization using Bayesian multi-armed bandit';
COMMENT ON COLUMN thompson_sampling_experiments.candidates IS 
  'JSON array of bid floor candidates with alpha/beta parameters for Beta distribution';
COMMENT ON COLUMN thompson_sampling_experiments.geo IS 
  'Geographic region (e.g., US, UK, FR)';
COMMENT ON COLUMN thompson_sampling_experiments.format IS 
  'Ad format (e.g., banner, interstitial, rewarded_video)';
