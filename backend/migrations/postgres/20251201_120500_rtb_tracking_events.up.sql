CREATE TABLE IF NOT EXISTS rtb_tracking_events (
  id BIGSERIAL PRIMARY KEY,
  event_type TEXT NOT NULL CHECK (event_type IN ('imp', 'click')),
  bid_id TEXT NOT NULL,
  placement_id TEXT NOT NULL,
  adapter TEXT NOT NULL,
  cpm NUMERIC(12, 6) NOT NULL DEFAULT 0,
  ua_hash TEXT,
  ip_hash TEXT,
  observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_rtb_tracking_events_observed
  ON rtb_tracking_events (observed_at DESC);

CREATE INDEX IF NOT EXISTS idx_rtb_tracking_events_bid
  ON rtb_tracking_events (bid_id, event_type);

CREATE INDEX IF NOT EXISTS idx_rtb_tracking_events_adapter
  ON rtb_tracking_events (adapter, observed_at DESC);
