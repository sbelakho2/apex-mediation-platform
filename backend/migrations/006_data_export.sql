-- Data Export and Warehouse Integration tables

CREATE TABLE IF NOT EXISTS export_jobs (
  id TEXT PRIMARY KEY,
  publisher_id UUID NOT NULL REFERENCES publishers(id) ON DELETE CASCADE,
  data_type TEXT NOT NULL CHECK (data_type IN ('impressions','revenue','fraud_events','telemetry','all')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','completed','failed')),
  format TEXT NOT NULL CHECK (format IN ('csv','parquet','json')),
  destination TEXT NOT NULL CHECK (destination IN ('local','s3','gcs','bigquery')),
  start_date TIMESTAMPTZ NOT NULL,
  end_date TIMESTAMPTZ NOT NULL,
  rows_exported INTEGER NOT NULL DEFAULT 0,
  file_size BIGINT NOT NULL DEFAULT 0,
  location TEXT,
  error TEXT,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_export_jobs_publisher_id ON export_jobs(publisher_id);
CREATE INDEX IF NOT EXISTS idx_export_jobs_status ON export_jobs(status);
CREATE INDEX IF NOT EXISTS idx_export_jobs_created_at ON export_jobs(created_at DESC);

CREATE TABLE IF NOT EXISTS warehouse_syncs (
  id TEXT PRIMARY KEY,
  publisher_id UUID NOT NULL REFERENCES publishers(id) ON DELETE CASCADE,
  warehouse_type TEXT NOT NULL CHECK (warehouse_type IN ('bigquery','redshift','snowflake')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','error')),
  sync_interval INTEGER NOT NULL CHECK (sync_interval >= 1 AND sync_interval <= 168),
  last_sync_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  next_sync_time TIMESTAMPTZ NOT NULL,
  rows_synced BIGINT NOT NULL DEFAULT 0,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_warehouse_syncs_publisher_id ON warehouse_syncs(publisher_id);
CREATE INDEX IF NOT EXISTS idx_warehouse_syncs_status ON warehouse_syncs(status);
CREATE INDEX IF NOT EXISTS idx_warehouse_syncs_next_sync ON warehouse_syncs(next_sync_time);

-- Comments
COMMENT ON TABLE export_jobs IS 'Data export jobs with status tracking and file locations';
COMMENT ON TABLE warehouse_syncs IS 'Scheduled warehouse synchronization configurations';
