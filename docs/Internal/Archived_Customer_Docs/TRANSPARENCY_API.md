# Transparency API

Expose verifiable, queryable auction truth to publishers. All responses are scoped to the authenticated publisher.

Base URL: /api/v1/transparency

Authentication: Bearer JWT (publisher-scoped)

---

## Data Model

- auctions (append-only)
- auction_candidates (append-only, child records)
- transparency_signer_keys (key registry)

Example auction payload (response shape):

{
  "auction_id": "uuid",
  "timestamp": "iso8601",
  "publisher_id": "pub_123",
  "app_or_site_id": "app_456",
  "placement_id": "plc_rewarded_home",
  "surface_type": "mobile_app|web|ctv",
  "device_context": { "os": "android", "geo": "US", "att": "authorized", "tc_string_sha256": "..." },
  "candidates": [
    { "source": "network_x", "bid_ecpm": 12.34, "currency": "USD", "response_time_ms": 48, "status": "ok|timeout|no_bid|error", "metadata_hash": "..." }
  ],
  "winner": { "source": "network_x", "bid_ecpm": 12.34, "gross_price": 0.001234, "currency": "USD", "reason": "highest_valid_bid" },
  "fees": { "aletheia_fee_bp": 100, "effective_publisher_share": 0.9 },
  "integrity": { "algo": "ed25519|hmac", "key_id": "k_2025_11", "signature": "..." }
}

Notes:
- tc_string is never stored raw; only tc_string_sha256 is stored for audit joins.
- No PII is stored; device/user IDs are not present in this log.

---

## Endpoints

### GET /auctions

Query parameters:
- publisher_id (optional; defaults to authenticated publisher)
- from, to (ISO-8601 datetime)
- placement_id
- surface (mobile_app|web|ctv)
- geo (ISO country code)
- page (default 1), limit (1–500, default 50)

Response:
{
  "page": 1,
  "limit": 50,
  "count": 50,
  "data": [Auction...]
}

### GET /auctions/{auction_id}

Returns a single auction with its candidates and integrity block.

### GET /summary/auctions

Query parameters:
- publisher_id (defaults to authenticated publisher)
- from, to
- group_by = publisher|placement|geo|surface

Response:
{
  "group_by": "placement",
  "rows": [
    { "group_key": "plc_rewarded_home", "auctions": 10234, "avg_ecpm": 7.12, "total_gross_price": 12.345, "avg_pub_share": 0.9 }
  ]
}

---

## Security & RBAC
- All endpoints require a valid JWT; publisher_id is enforced server-side.
- To prevent cross-tenant access, publisher_id in the token must match any supplied publisher_id query.

## Integrity & Verification
- Each auction row stores integrity fields: {algo, key_id, signature}.
- Public verification keys are available from support along with CLI instructions for ed25519 verification.

## Sampling
- Sampling is configurable per publisher (0.0–1.0) and applied on the write path. Contact support to adjust your sampling level.

## No Self-Preference
- Platform-owned demand (when present) follows the same auction policy and is auditable via this API.
