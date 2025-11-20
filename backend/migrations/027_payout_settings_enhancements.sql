-- Align payout settings schema with console finance UI
ALTER TABLE payout_settings
  ADD COLUMN IF NOT EXISTS account_name TEXT,
  ADD COLUMN IF NOT EXISTS account_reference TEXT,
  ADD COLUMN IF NOT EXISTS auto_payout BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS backup_method TEXT CHECK (backup_method IS NULL OR backup_method IN ('stripe', 'paypal', 'wire'));

CREATE INDEX IF NOT EXISTS idx_payouts_publisher_scheduled ON payouts (publisher_id, scheduled_for DESC);
