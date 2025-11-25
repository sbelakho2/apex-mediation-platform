-- Add TTL/retention policies for VRA ClickHouse tables

-- Raw statements: retain 12 months (operational troubleshooting only)
ALTER TABLE recon_statements_raw
MODIFY TTL loaded_at + toIntervalMonth(12);

-- Normalized statements: retain 18 months
ALTER TABLE recon_statements_norm
MODIFY TTL event_date + toIntervalMonth(18);

-- Expected: retain 18 months
ALTER TABLE recon_expected
MODIFY TTL ts + toIntervalMonth(18);

-- Match links: retain 18 months
ALTER TABLE recon_match
MODIFY TTL matched_at + toIntervalMonth(18);

-- Deltas: retain 18 months
ALTER TABLE recon_deltas
MODIFY TTL window_start + toIntervalMonth(18);

-- Disputes: retain 36 months (longer ops/audit trail)
ALTER TABLE recon_disputes
MODIFY TTL created_at + toIntervalMonth(36);

-- Daily proofs roots: retain 36 months
ALTER TABLE proofs_daily_roots
MODIFY TTL day + toIntervalMonth(36);

-- Note: proofs_monthly_digest has String "month" key (YYYY-MM). TTL not applied.
-- If needed later, consider adding a Date month_date column to enable TTL.
