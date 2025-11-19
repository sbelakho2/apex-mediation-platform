-- Migration: Create Ed25519 Key Management
-- Purpose: Store Ed25519 key pairs for cryptographic operations (receipt signing, API auth, etc.)
-- Dependencies: None
-- Author: System
-- Date: 2024

-- Ed25519 Keys Table
CREATE TABLE IF NOT EXISTS ed25519_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Key identification
  key_id VARCHAR(100) NOT NULL UNIQUE,    -- Human-readable key identifier
  
  -- Key material (PEM format)
  public_key_pem TEXT NOT NULL,           -- Ed25519 public key (SPKI format)
  private_key_pem TEXT NOT NULL,          -- Ed25519 private key (PKCS8 format, encrypted at rest)
  
  -- Metadata
  algorithm VARCHAR(20) NOT NULL DEFAULT 'Ed25519' CHECK (algorithm = 'Ed25519'),
  purpose VARCHAR(100) NOT NULL,          -- e.g., 'receipt_signing', 'api_auth', 'webhook_signature'
  
  -- Lifecycle
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE,    -- Optional expiration date
  is_active BOOLEAN NOT NULL DEFAULT true,
  deactivated_at TIMESTAMP WITH TIME ZONE,
  deleted_at TIMESTAMP WITH TIME ZONE     -- Soft delete (keep for audit)
);

-- Indexes
CREATE INDEX idx_ed25519_key_id ON ed25519_keys(key_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_ed25519_purpose ON ed25519_keys(purpose) WHERE deleted_at IS NULL AND is_active = true;
CREATE INDEX idx_ed25519_active ON ed25519_keys(is_active, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_ed25519_expires ON ed25519_keys(expires_at) WHERE expires_at IS NOT NULL AND deleted_at IS NULL;

-- Prevent accidental updates to key material
CREATE OR REPLACE FUNCTION prevent_key_material_update()
RETURNS TRIGGER AS $$
BEGIN
  -- Allow updates to metadata fields only
  IF OLD.public_key_pem != NEW.public_key_pem OR OLD.private_key_pem != NEW.private_key_pem THEN
    RAISE EXCEPTION 'Key material cannot be modified - use key rotation instead';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER prevent_key_update
  BEFORE UPDATE ON ed25519_keys
  FOR EACH ROW
  EXECUTE FUNCTION prevent_key_material_update();

-- Key Usage Audit Log
CREATE TABLE IF NOT EXISTS ed25519_key_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key_id VARCHAR(100) NOT NULL,
  operation VARCHAR(50) NOT NULL,         -- 'sign', 'verify'
  entity_type VARCHAR(50),                -- What was signed/verified (e.g., 'receipt', 'api_request')
  entity_id VARCHAR(255),
  success BOOLEAN NOT NULL,
  error_message TEXT,
  ip_address INET,
  timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Indexes for usage audit
CREATE INDEX idx_ed25519_usage_key ON ed25519_key_usage(key_id, timestamp DESC);
CREATE INDEX idx_ed25519_usage_timestamp ON ed25519_key_usage(timestamp DESC);
CREATE INDEX idx_ed25519_usage_entity ON ed25519_key_usage(entity_type, entity_id);

-- View for active keys with metadata
CREATE OR REPLACE VIEW ed25519_active_keys AS
SELECT 
  key_id,
  public_key_pem,
  algorithm,
  purpose,
  created_at,
  expires_at,
  CASE 
    WHEN expires_at IS NULL THEN true
    WHEN expires_at > NOW() THEN true
    ELSE false
  END as is_valid
FROM ed25519_keys
WHERE deleted_at IS NULL AND is_active = true
ORDER BY created_at DESC;

-- Comments
COMMENT ON TABLE ed25519_keys IS 'Ed25519 key pairs for cryptographic signing and verification';
COMMENT ON COLUMN ed25519_keys.key_id IS 'Human-readable key identifier (e.g., "receipt-signing-2024-q1")';
COMMENT ON COLUMN ed25519_keys.public_key_pem IS 'Ed25519 public key in PEM format (SPKI)';
COMMENT ON COLUMN ed25519_keys.private_key_pem IS 'Ed25519 private key in PEM format (PKCS8) - encrypted at rest';
COMMENT ON COLUMN ed25519_keys.purpose IS 'Intended use of key (receipt_signing, api_auth, webhook_signature)';
COMMENT ON COLUMN ed25519_keys.expires_at IS 'Optional expiration date for key rotation';
COMMENT ON COLUMN ed25519_keys.deleted_at IS 'Soft delete timestamp (keep for audit trail)';

COMMENT ON TABLE ed25519_key_usage IS 'Audit log for Ed25519 key operations';
