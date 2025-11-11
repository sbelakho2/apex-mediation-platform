-- RTB domain tables
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- auctions
CREATE TABLE IF NOT EXISTS auctions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL UNIQUE,
  placement_id text NOT NULL,
  ad_format text NOT NULL CHECK (ad_format IN ('banner','interstitial','rewarded','native')),
  floor_cpm numeric(10,4) NOT NULL DEFAULT 0,
  publisher_id uuid,
  deadline_ms integer NOT NULL,
  outcome text NOT NULL CHECK (outcome IN ('win','no_bid','timeout','error')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_auctions_placement_created ON auctions (placement_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_auctions_publisher_created ON auctions (publisher_id, created_at DESC);

-- bids
CREATE TABLE IF NOT EXISTS bids (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auction_id uuid NOT NULL,
  adapter text NOT NULL,
  cpm numeric(10,4) NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  latency_ms integer,
  status text NOT NULL CHECK (status IN ('win','loss','nobid','timeout','error')),
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bids_auction ON bids (auction_id);
CREATE INDEX IF NOT EXISTS idx_bids_adapter_created ON bids (adapter, created_at DESC);

-- auction_wins
CREATE TABLE IF NOT EXISTS auction_wins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auction_id uuid NOT NULL,
  bid_id uuid NOT NULL,
  signed_kid text NOT NULL,
  signed_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_auction_wins_auction ON auction_wins (auction_id);

-- signing_keys
CREATE TABLE IF NOT EXISTS signing_keys (
  kid text PRIMARY KEY,
  public_key_pem text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  rotated_at timestamptz,
  revoked_at timestamptz
);
