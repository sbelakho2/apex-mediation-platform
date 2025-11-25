-- Revert TTL/retention policies for VRA ClickHouse tables

ALTER TABLE recon_statements_raw
REMOVE TTL;

ALTER TABLE recon_statements_norm
REMOVE TTL;

ALTER TABLE recon_expected
REMOVE TTL;

ALTER TABLE recon_match
REMOVE TTL;

ALTER TABLE recon_deltas
REMOVE TTL;

ALTER TABLE recon_disputes
REMOVE TTL;

ALTER TABLE proofs_daily_roots
REMOVE TTL;

-- Note: proofs_monthly_digest never had TTL (month is a String key), nothing to revert.
