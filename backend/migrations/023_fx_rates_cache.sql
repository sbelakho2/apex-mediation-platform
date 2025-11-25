-- Migration: FX Rates Cache Table
-- Purpose: Cache exchange rates from ECB for billing invoice generation
-- Date: 2025-11-19

CREATE TABLE IF NOT EXISTS fx_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_currency VARCHAR(3) NOT NULL, -- ISO 4217 currency code (USD, GBP, JPY, etc.)
  to_currency VARCHAR(3) NOT NULL DEFAULT 'EUR', -- Base currency for normalization
  rate DECIMAL(18, 6) NOT NULL, -- Exchange rate (from_currency per to_currency)
  rate_date DATE NOT NULL, -- Date the rate is effective
  source VARCHAR(50) NOT NULL DEFAULT 'ECB', -- Rate source (ECB, manual, etc.)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NULL,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '24 hours',
  
  CONSTRAINT unique_fx_rate UNIQUE(from_currency, to_currency, rate_date)
);

-- Create indexes for fast lookups
CREATE INDEX idx_fx_rates_currencies_date 
  ON fx_rates(from_currency, to_currency, rate_date DESC);

CREATE INDEX idx_fx_rates_expiry 
  ON fx_rates(expires_at);

CREATE INDEX idx_fx_rates_from_currency 
  ON fx_rates(from_currency);

-- Add comments for documentation
COMMENT ON TABLE fx_rates IS 
  'Cached FX rates from ECB for invoice currency normalization';

COMMENT ON COLUMN fx_rates.rate IS 
  'Exchange rate: 1 from_currency = rate * to_currency (e.g., 1 USD = 0.92 EUR means rate = 0.92)';

COMMENT ON COLUMN fx_rates.rate_date IS 
  'Effective date of the exchange rate (not the fetch date)';

COMMENT ON COLUMN fx_rates.expires_at IS 
  'Cache expiration timestamp (default 24 hours)';

-- Grant appropriate permissions
-- GRANT SELECT, INSERT, UPDATE, DELETE ON fx_rates TO backend_service;
