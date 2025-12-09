-- VRA (Verification & Revenue Auditor) Ledger Tables
-- Provides cryptographic transparency for ad impressions with hash chain

-- Main VRA ledger table with hash chain entries
CREATE TABLE IF NOT EXISTS vra_ledger (
    entry_id UUID PRIMARY KEY,
    impression_id VARCHAR(255) NOT NULL,
    publisher_id VARCHAR(255) NOT NULL,
    network_id VARCHAR(100) NOT NULL,
    
    -- Hash chain fields
    previous_hash VARCHAR(64) NOT NULL,
    entry_hash VARCHAR(64) NOT NULL,
    signature VARCHAR(64) NOT NULL,
    sequence_number BIGINT NOT NULL,
    
    -- Revenue details (stored in micros for precision)
    gross_revenue_micros BIGINT NOT NULL,
    net_revenue_micros BIGINT NOT NULL,
    currency VARCHAR(3) DEFAULT 'USD',
    
    -- Full entry data as JSON for transparency
    entry_data JSONB NOT NULL,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT vra_ledger_unique_sequence UNIQUE (publisher_id, sequence_number),
    CONSTRAINT vra_ledger_positive_sequence CHECK (sequence_number > 0),
    CONSTRAINT vra_ledger_valid_revenue CHECK (net_revenue_micros <= gross_revenue_micros)
) PARTITION BY RANGE (created_at);

-- Create partitions for the current and next 3 months
DO $$
DECLARE
    start_date DATE := DATE_TRUNC('month', CURRENT_DATE);
    end_date DATE;
    partition_name TEXT;
BEGIN
    FOR i IN 0..3 LOOP
        start_date := DATE_TRUNC('month', CURRENT_DATE) + (i || ' months')::INTERVAL;
        end_date := start_date + INTERVAL '1 month';
        partition_name := 'vra_ledger_' || TO_CHAR(start_date, 'YYYY_MM');
        
        -- Check if partition exists
        IF NOT EXISTS (
            SELECT 1 FROM pg_class c
            JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE c.relname = partition_name
            AND n.nspname = 'public'
        ) THEN
            EXECUTE format(
                'CREATE TABLE %I PARTITION OF vra_ledger FOR VALUES FROM (%L) TO (%L)',
                partition_name,
                start_date,
                end_date
            );
        END IF;
    END LOOP;
END $$;

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS vra_ledger_publisher_id_idx ON vra_ledger (publisher_id);
CREATE INDEX IF NOT EXISTS vra_ledger_network_id_idx ON vra_ledger (network_id);
CREATE INDEX IF NOT EXISTS vra_ledger_impression_id_idx ON vra_ledger (impression_id);
CREATE INDEX IF NOT EXISTS vra_ledger_created_at_idx ON vra_ledger (created_at);
CREATE INDEX IF NOT EXISTS vra_ledger_entry_hash_idx ON vra_ledger (entry_hash);
CREATE INDEX IF NOT EXISTS vra_ledger_publisher_sequence_idx ON vra_ledger (publisher_id, sequence_number);

-- Index for revenue aggregation queries
CREATE INDEX IF NOT EXISTS vra_ledger_publisher_network_created_idx 
    ON vra_ledger (publisher_id, network_id, created_at);

-- Publisher proofs table (cached proofs for faster retrieval)
CREATE TABLE IF NOT EXISTS vra_publisher_proofs (
    proof_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    publisher_id VARCHAR(255) NOT NULL,
    period_start TIMESTAMPTZ NOT NULL,
    period_end TIMESTAMPTZ NOT NULL,
    
    -- Aggregates
    total_impressions BIGINT NOT NULL,
    total_gross_revenue_micros BIGINT NOT NULL,
    total_net_revenue_micros BIGINT NOT NULL,
    
    -- Hash chain verification
    first_entry_hash VARCHAR(64) NOT NULL,
    last_entry_hash VARCHAR(64) NOT NULL,
    entry_count BIGINT NOT NULL,
    
    -- Proof signature
    proof_hash VARCHAR(64) NOT NULL,
    signature VARCHAR(64) NOT NULL,
    
    -- Breakdown by network (JSONB for flexibility)
    by_network JSONB NOT NULL DEFAULT '[]',
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours'),
    
    -- Constraints
    CONSTRAINT vra_proofs_unique_period UNIQUE (publisher_id, period_start, period_end)
);

CREATE INDEX IF NOT EXISTS vra_proofs_publisher_idx ON vra_publisher_proofs (publisher_id);
CREATE INDEX IF NOT EXISTS vra_proofs_expires_idx ON vra_publisher_proofs (expires_at);

-- Reconciliation results table
CREATE TABLE IF NOT EXISTS vra_reconciliations (
    recon_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    publisher_id VARCHAR(255) NOT NULL,
    period_start TIMESTAMPTZ NOT NULL,
    period_end TIMESTAMPTZ NOT NULL,
    
    -- Match status
    matched BOOLEAN NOT NULL,
    variance_percent DECIMAL(10, 4) NOT NULL,
    variance_amount BIGINT NOT NULL,
    
    -- Totals
    our_total_micros BIGINT NOT NULL,
    network_total_micros BIGINT NOT NULL,
    
    -- Discrepancies (JSONB array)
    discrepancies JSONB NOT NULL DEFAULT '[]',
    discrepancy_count INT NOT NULL DEFAULT 0,
    
    -- Network data submitted for reconciliation
    network_data JSONB NOT NULL DEFAULT '[]',
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reviewed_at TIMESTAMPTZ,
    reviewed_by VARCHAR(255)
);

CREATE INDEX IF NOT EXISTS vra_recon_publisher_idx ON vra_reconciliations (publisher_id);
CREATE INDEX IF NOT EXISTS vra_recon_matched_idx ON vra_reconciliations (matched);
CREATE INDEX IF NOT EXISTS vra_recon_period_idx ON vra_reconciliations (period_start, period_end);

-- Cleanup job to remove expired proofs
CREATE OR REPLACE FUNCTION cleanup_expired_vra_proofs()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM vra_publisher_proofs WHERE expires_at < NOW();
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Comments for documentation
COMMENT ON TABLE vra_ledger IS 'Per-impression signed ledger entries with hash chain for cryptographic transparency';
COMMENT ON TABLE vra_publisher_proofs IS 'Cached publisher proofs for reconciliation';
COMMENT ON TABLE vra_reconciliations IS 'Reconciliation results comparing our data with network reports';
COMMENT ON COLUMN vra_ledger.entry_hash IS 'SHA-256 hash of entry data including previous_hash for chain integrity';
COMMENT ON COLUMN vra_ledger.signature IS 'HMAC-SHA-256 signature of entry_hash for tamper evidence';
COMMENT ON COLUMN vra_ledger.sequence_number IS 'Monotonically increasing sequence per publisher for ordering';
