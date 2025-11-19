-- Migration: Create Transparency Receipts
-- Purpose: Cryptographically signed, append-only audit receipts for auction decisions
-- Dependencies: None
-- Author: System
-- Date: 2024

-- Transparency Receipts Table (Append-Only)
CREATE TABLE IF NOT EXISTS transparency_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Auction identification
  req_id VARCHAR(255) NOT NULL,           -- Unique auction request ID
  timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
  placement_id UUID NOT NULL,             -- PlacementBinding ID
  
  -- Auction parameters
  floor_cpm DECIMAL(10, 4) NOT NULL,
  currency VARCHAR(3) NOT NULL,
  
  -- Auction results
  bids JSONB NOT NULL,                    -- Array of {network, bidCpm, currency, latencyMs, status}
  winner JSONB,                           -- {network, bidCpm, currency, normalizedCpm, creativeUrl} or null
  
  -- Hash chain (for tamper detection)
  prev_hash VARCHAR(64),                  -- SHA-256 of previous receipt (null for first)
  hash VARCHAR(64) NOT NULL,              -- SHA-256 of canonical receipt data
  
  -- Cryptographic signature (Ed25519)
  signature TEXT NOT NULL,                -- Ed25519 signature over hash
  signing_key_id VARCHAR(50) NOT NULL,    -- Which key was used to sign
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Indexes for queries
CREATE INDEX idx_transparency_req_id ON transparency_receipts(req_id);
CREATE INDEX idx_transparency_placement ON transparency_receipts(placement_id, timestamp DESC);
CREATE INDEX idx_transparency_timestamp ON transparency_receipts(timestamp DESC);
CREATE INDEX idx_transparency_hash ON transparency_receipts(hash);

-- GIN index for querying bids JSON
CREATE INDEX idx_transparency_bids ON transparency_receipts USING GIN(bids);
CREATE INDEX idx_transparency_winner ON transparency_receipts USING GIN(winner);

-- Prevent updates and deletes (append-only)
CREATE OR REPLACE FUNCTION prevent_transparency_modification()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'Transparency receipts are immutable and cannot be modified';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Transparency receipts are append-only and cannot be deleted';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER prevent_transparency_update
  BEFORE UPDATE OR DELETE ON transparency_receipts
  FOR EACH ROW
  EXECUTE FUNCTION prevent_transparency_modification();

-- View for easy hash chain verification
CREATE OR REPLACE VIEW transparency_chain_view AS
SELECT 
  t1.id,
  t1.req_id,
  t1.timestamp,
  t1.placement_id,
  t1.hash,
  t1.prev_hash,
  t2.hash as actual_prev_hash,
  CASE 
    WHEN t1.prev_hash IS NULL THEN true
    WHEN t1.prev_hash = t2.hash THEN true
    ELSE false
  END as chain_valid
FROM transparency_receipts t1
LEFT JOIN transparency_receipts t2 ON 
  t2.placement_id = t1.placement_id 
  AND t2.timestamp < t1.timestamp
  AND t2.timestamp = (
    SELECT MAX(timestamp) 
    FROM transparency_receipts 
    WHERE placement_id = t1.placement_id 
    AND timestamp < t1.timestamp
  );

-- Comments
COMMENT ON TABLE transparency_receipts IS 'Append-only, cryptographically signed receipts for every auction decision';
COMMENT ON COLUMN transparency_receipts.req_id IS 'Unique auction request identifier';
COMMENT ON COLUMN transparency_receipts.placement_id IS 'PlacementBinding (maps publisher ad-unit to Apex placement)';
COMMENT ON COLUMN transparency_receipts.floor_cpm IS 'Publisher floor price in specified currency';
COMMENT ON COLUMN transparency_receipts.bids IS 'All network bid responses as JSON array';
COMMENT ON COLUMN transparency_receipts.winner IS 'Winning bid details or null if no winner';
COMMENT ON COLUMN transparency_receipts.prev_hash IS 'SHA-256 hash of previous receipt (for chain integrity)';
COMMENT ON COLUMN transparency_receipts.hash IS 'SHA-256 hash of canonical receipt data';
COMMENT ON COLUMN transparency_receipts.signature IS 'Ed25519 signature over hash (verifiable with public key)';
COMMENT ON COLUMN transparency_receipts.signing_key_id IS 'Identifier of Ed25519 key pair used for signing';
