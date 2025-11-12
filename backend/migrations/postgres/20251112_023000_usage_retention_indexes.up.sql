-- Add helpful indexes to support data retention purges
-- Usage events by created_at
CREATE INDEX IF NOT EXISTS idx_usage_events_created_at ON usage_events (created_at);

-- Billing audit by created_at (if table exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'billing_audit'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_billing_audit_created_at ON billing_audit (created_at);
  END IF;
END $$;
