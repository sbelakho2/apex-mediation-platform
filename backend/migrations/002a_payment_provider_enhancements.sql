-- Add payment provider support and ledger tracking

-- Add provider and transaction_id columns to payouts table
ALTER TABLE payouts 
  ADD COLUMN IF NOT EXISTS provider TEXT,
  ADD COLUMN IF NOT EXISTS transaction_id TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Create payout_ledger table for double-entry accounting
CREATE TABLE IF NOT EXISTS payout_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payout_id BIGINT NOT NULL REFERENCES payouts(id),
    publisher_id UUID NOT NULL REFERENCES publishers(id),
    amount NUMERIC(12,2) NOT NULL,
    currency TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('debit', 'credit')),
    provider TEXT NOT NULL CHECK (provider IN ('tipalti', 'wise', 'payoneer')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_payout_ledger_payout_id ON payout_ledger(payout_id);
CREATE INDEX IF NOT EXISTS idx_payout_ledger_publisher_id ON payout_ledger(publisher_id);
CREATE INDEX IF NOT EXISTS idx_payout_ledger_created_at ON payout_ledger(created_at);
CREATE INDEX IF NOT EXISTS idx_payouts_status ON payouts(status);
CREATE INDEX IF NOT EXISTS idx_payouts_provider ON payouts(provider);

-- Add comments for documentation
COMMENT ON TABLE payout_ledger IS 'Double-entry ledger for tracking all payout transactions';
COMMENT ON COLUMN payout_ledger.type IS 'debit = money leaving platform, credit = publisher receiving';
COMMENT ON COLUMN payout_ledger.provider IS 'Payment provider used: tipalti, wise, or payoneer';
COMMENT ON COLUMN payouts.provider IS 'Payment provider that processed the payout';
COMMENT ON COLUMN payouts.transaction_id IS 'External transaction ID from payment provider';
