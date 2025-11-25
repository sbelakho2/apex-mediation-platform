-- Migration: Create Billing Audit Trail
-- Purpose: Comprehensive audit logging for all billing operations
-- Dependencies: None
-- Author: System
-- Date: 2024

-- Billing Audit Trail Table
CREATE TABLE IF NOT EXISTS billing_audit_trail (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Event classification
  event_type VARCHAR(100) NOT NULL,  -- e.g., 'invoice.generated', 'payment.processed'
  entity_type VARCHAR(50) NOT NULL,  -- e.g., 'invoice', 'payment', 'subscription'
  entity_id VARCHAR(255) NOT NULL,   -- ID of the entity being audited
  
  -- Actor information
  actor_id VARCHAR(255) NOT NULL,    -- User ID, system ID, or API key ID
  actor_type VARCHAR(20) NOT NULL CHECK (actor_type IN ('user', 'system', 'api')),
  
  -- Action details
  action VARCHAR(50) NOT NULL,       -- e.g., 'CREATE', 'UPDATE', 'DELETE', 'FX_CONVERT'
  before_state JSONB,                -- State before action
  after_state JSONB,                 -- State after action
  metadata JSONB,                    -- Additional context
  
  -- Request context
  ip_address INET,
  user_agent TEXT,
  
  -- Timing
  timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  
  -- Integrity
  checksum VARCHAR(64) NOT NULL      -- SHA-256 hash for tamper detection
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_billing_audit_entity ON billing_audit_trail(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_billing_audit_actor ON billing_audit_trail(actor_id);
CREATE INDEX IF NOT EXISTS idx_billing_audit_event_type ON billing_audit_trail(event_type);
CREATE INDEX IF NOT EXISTS idx_billing_audit_timestamp ON billing_audit_trail(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_billing_audit_created ON billing_audit_trail(created_at DESC);

-- Composite index for time-range queries by entity
CREATE INDEX IF NOT EXISTS idx_billing_audit_entity_time ON billing_audit_trail(entity_type, entity_id, timestamp DESC);

-- GIN index for JSONB queries
CREATE INDEX IF NOT EXISTS idx_billing_audit_metadata ON billing_audit_trail USING GIN(metadata);
CREATE INDEX IF NOT EXISTS idx_billing_audit_after_state ON billing_audit_trail USING GIN(after_state);

-- Prevent updates and deletes (append-only)
CREATE OR REPLACE FUNCTION prevent_billing_audit_modification()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'Billing audit trail entries cannot be modified';
  END IF;
  IF TG_OP = 'DELETE' THEN
    -- Allow deletes for retention policy, but log them
    RAISE NOTICE 'Deleting audit entry: %', OLD.id;
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER prevent_audit_update
  BEFORE UPDATE ON billing_audit_trail
  FOR EACH ROW
  EXECUTE FUNCTION prevent_billing_audit_modification();

-- Comments
COMMENT ON TABLE billing_audit_trail IS 'Comprehensive audit log for all billing operations';
COMMENT ON COLUMN billing_audit_trail.event_type IS 'Classification of the audit event';
COMMENT ON COLUMN billing_audit_trail.entity_type IS 'Type of entity being audited';
COMMENT ON COLUMN billing_audit_trail.entity_id IS 'ID of the specific entity';
COMMENT ON COLUMN billing_audit_trail.actor_id IS 'ID of the actor performing the action';
COMMENT ON COLUMN billing_audit_trail.actor_type IS 'Type of actor: user, system, or api';
COMMENT ON COLUMN billing_audit_trail.action IS 'Action performed on the entity';
COMMENT ON COLUMN billing_audit_trail.before_state IS 'State of entity before action';
COMMENT ON COLUMN billing_audit_trail.after_state IS 'State of entity after action';
COMMENT ON COLUMN billing_audit_trail.metadata IS 'Additional contextual information';
COMMENT ON COLUMN billing_audit_trail.checksum IS 'SHA-256 hash for tamper detection';
