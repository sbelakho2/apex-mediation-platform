-- Drop VRA analytics tables from Postgres
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

DROP TABLE IF EXISTS proofs_monthly_digest;
DROP TABLE IF EXISTS proofs_daily_roots;
DROP TABLE IF EXISTS recon_disputes;
DROP TABLE IF EXISTS recon_deltas;
DROP TABLE IF EXISTS recon_match_review;
DROP TABLE IF EXISTS recon_match;
DROP TABLE IF EXISTS recon_expected;
DROP TABLE IF EXISTS recon_statements_norm;
DROP TABLE IF EXISTS recon_statements_raw;
