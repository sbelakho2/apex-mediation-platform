-- Migration: Network Credential Vault Tables
-- Purpose: Store encrypted network credentials separately from SDKs/adapters (BYO model)
-- Date: 2025-11-19

-- Main table for encrypted network credentials
CREATE TABLE IF NOT EXISTS encrypted_network_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  publisher_id UUID NOT NULL,
  network VARCHAR(100) NOT NULL, -- 'admob', 'unity', 'ironsource', 'applovin', 'meta', 'moloco', etc.
  credentials_ciphertext TEXT NOT NULL, -- JSON-serialized AesGcmCiphertext
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ NULL,
  
  CONSTRAINT unique_publisher_network UNIQUE(publisher_id, network, deleted_at)
);

-- Create index for faster lookups
CREATE INDEX idx_encrypted_network_credentials_publisher 
  ON encrypted_network_credentials(publisher_id) 
  WHERE deleted_at IS NULL;

CREATE INDEX idx_encrypted_network_credentials_network 
  ON encrypted_network_credentials(network) 
  WHERE deleted_at IS NULL;

-- Audit log for credential access and modifications
CREATE TABLE IF NOT EXISTS credential_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  credential_id UUID NOT NULL REFERENCES encrypted_network_credentials(id),
  action VARCHAR(50) NOT NULL, -- 'CREATE', 'UPDATE', 'ACCESS', 'DELETE', 'ROTATE'
  actor_type VARCHAR(50) NOT NULL, -- 'system', 'user', 'api'
  actor_id VARCHAR(255) NOT NULL, -- user_id, api_key_prefix, or 'system'
  metadata JSONB NULL, -- Additional context (IP, user agent, etc.)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create index for audit queries
CREATE INDEX idx_credential_audit_log_credential 
  ON credential_audit_log(credential_id, created_at DESC);

CREATE INDEX idx_credential_audit_log_actor 
  ON credential_audit_log(actor_id, created_at DESC);

CREATE INDEX idx_credential_audit_log_action 
  ON credential_audit_log(action, created_at DESC);

-- Add comments for documentation
COMMENT ON TABLE encrypted_network_credentials IS 
  'Stores encrypted network credentials for BYO model. Credentials never sent to SDKs/adapters.';

COMMENT ON COLUMN encrypted_network_credentials.credentials_ciphertext IS 
  'AES-256-GCM encrypted JSON containing network-specific credentials (API keys, secrets, etc.)';

COMMENT ON COLUMN encrypted_network_credentials.version IS 
  'Incremented on each credential update for rotation tracking';

COMMENT ON TABLE credential_audit_log IS 
  'Audit trail for all credential access and modifications';

-- Grant appropriate permissions (adjust based on your setup)
-- GRANT SELECT, INSERT, UPDATE ON encrypted_network_credentials TO backend_service;
-- GRANT SELECT, INSERT ON credential_audit_log TO backend_service;
