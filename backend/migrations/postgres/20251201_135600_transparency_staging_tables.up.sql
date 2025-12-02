-- UNLOGGED staging tables for transparency ingestion
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE UNLOGGED TABLE IF NOT EXISTS transparency_auctions_stage (
  LIKE transparency_auctions INCLUDING DEFAULTS INCLUDING STATISTICS
);

CREATE UNLOGGED TABLE IF NOT EXISTS transparency_auction_candidates_stage (
  LIKE transparency_auction_candidates INCLUDING DEFAULTS INCLUDING STATISTICS
);

TRUNCATE TABLE transparency_auctions_stage;
TRUNCATE TABLE transparency_auction_candidates_stage;
