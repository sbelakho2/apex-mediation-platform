-- Drop RTB domain tables in reverse order
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DROP TABLE IF EXISTS signing_keys;
DROP INDEX IF EXISTS uq_auction_wins_auction;
DROP TABLE IF EXISTS auction_wins;
DROP INDEX IF EXISTS idx_bids_adapter_created;
DROP INDEX IF EXISTS idx_bids_auction;
DROP TABLE IF EXISTS bids;
DROP INDEX IF EXISTS idx_auctions_publisher_created;
DROP INDEX IF EXISTS idx_auctions_placement_created;
DROP TABLE IF EXISTS auctions;
