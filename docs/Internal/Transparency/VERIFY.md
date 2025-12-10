# Transparency Verification — API, CLI, and Console

_Last updated: 2025-11-18_  
_Owner: Platform Engineering / Trust & Safety_  
_Review Cycle: When transparency implementation changes (next review: when FIX-01 transparency features complete)_

> **FIX-10 governance:** This guide documents transparency verification features. For implementation status, see `docs/Internal/Deployment/PROJECT_STATUS.md` and `docs/Internal/Development/FIXES.md` (FIX-01 covers transparency APIs).

This guide explains how to verify auction integrity records end-to-end using:
- Backend API endpoints
- The Node.js CLI verifier
- Console (Next.js) transparency pages

Prerequisites
- Backend running with transparency enabled: `TRANSPARENCY_ENABLED=1` and `TRANSPARENCY_API_ENABLED=true`
- Postgres migrations for transparency applied (see `backend/migrations/025_transparency_receipts.sql` and `backend/migrations/026_ed25519_keys.sql`). Legacy ClickHouse operators can still seed the archived DDL under `backend/migrations/clickhouse/` if needed.
- An active Ed25519 key pair configured:
  - Private (server): `TRANSPARENCY_PRIVATE_KEY` (PKCS#8 PEM or DER Base64)
  - Public (verify): `TRANSPARENCY_KEY_ID`, `TRANSPARENCY_PUBLIC_KEY_BASE64` (PEM or SPKI DER Base64)
- Publisher-scoped auth token (set `Authorization: Bearer <token>` in requests)

Canonicalization and signing
- Signing payload: deterministic, lexicographically sorted JSON of `{ auction, candidates }` with numeric normalization.
- Algorithm: Ed25519 (`crypto.sign(null, canonicalUtf8, privateKey)` in Node.js)
- The same canonicalizer is used by writer, API verifier, and CLI.

API endpoints
- List auctions (publisher-scoped):
  - `GET /api/v1/transparency/auctions?from=...&to=...&placement_id=...&surface=...&geo=...`
- Auction detail:
  - `GET /api/v1/transparency/auctions/:auction_id?includeCanonical=true`
  - Query parameters:
    - `includeCanonical` (boolean, default `false`): When `true`, includes the canonical payload used for signature verification. Response includes:
      ```json
      {
        "auction_id": "...",
        "timestamp": "2025-11-10T12:34:56Z",
        "publisher_id": "...",
        "canonical": {
          "string": "{\"auction\":{...},\"candidates\":[...]}",
          "truncated": false,
          "size_bytes": 1234
        }
      }
      ```
    - **Canonical truncation:** If the canonical payload exceeds 32KB, it is truncated and `truncated: true` is returned. This prevents large payloads from impacting API response times. The full canonical is always available via the `/verify` endpoint.
- Verify an auction:
  - `GET /api/v1/transparency/auctions/:auction_id/verify`
  - Response:
    ```json
    { "status": "pass|fail|not_applicable|unknown_key", "key_id": "...", "algo": "ed25519", "canonical": "{...}", "canonical_truncated": false, "canonical_size_bytes": 1234, "sample_bps": 250 }
    ```
  - **Canonical metadata:** The response includes `canonical_truncated` (boolean) and `canonical_size_bytes` (number) to indicate if truncation occurred and the original size.
- Active public keys (fallback to env if table empty):
  - `GET /api/v1/transparency/keys`

CLI verifier
- Location: `backend/scripts/transparency-verify.ts`
- Usage (text mode):
  ```bash
  npm --prefix backend run verify:transparency -- \
    --auction <uuid> --publisher <uuid> [--api <url>] [--key <base64_or_PEM>] [--verbose]
  ```
  - Output: Simple text (`PASS`, `FAIL`, `NOT_APPLICABLE`, `UNKNOWN_KEY`)
  - Exit codes: `0` (pass), `1` (fail/error), `2` (usage error)
  
- Usage (JSON mode):
  ```bash
  npm --prefix backend run verify:transparency -- \
    --auction <uuid> --publisher <uuid> --json
  ```
  - Output: Structured JSON with diagnostics:
    ```json
    {
      "status": "PASS",
      "auction_id": "...",
      "publisher_id": "...",
      "timestamp": "2025-11-10T12:34:56Z",
      "key_id": "key-2025-11-10-v2",
      "algo": "Ed25519",
      "canonical": "{...}",
      "canonical_length": 1234,
      "sample_bps": 250,
      "server_verification": {
        "status": "pass",
        "reason": null
      },
      "local_verification": {
        "status": "pass",
        "error": null
      }
    }
    ```
  - Exit codes: Same as text mode (`0` = pass, `1` = fail, `2` = usage error)
  - **Use case:** Programmatic verification, CI/CD pipelines, negative test automation

- Behavior: Fetches detail + verify, re-verifies locally (if key provided or retrieved), prints PASS/FAIL (or JSON), non-zero exit on FAIL.

Console (Updated 2025-11-10)
- Feature flag: set `NEXT_PUBLIC_TRANSPARENCY_ENABLED=true` (and `NEXT_PUBLIC_API_URL` to your backend)
- Pages:
  - **List**: `/transparency/auctions` — Enhanced with:
    - Debounced filter inputs (300ms delay)
    - URL query parameter persistence (bookmarkable/shareable)
    - Lazy-loading verify badges with tooltips
    - Copy buttons for auction and placement IDs
    - Skeleton loaders during data fetch
    - Responsive table with hover states
  - **Detail**: `/transparency/auctions/<auction_id>` — Enhanced with:
    - Professional card-based layout
    - Lazy-loading verification with spinner
    - Status badges with contextual tooltips (PASS/FAIL/NOT_APPLICABLE/UNKNOWN_KEY)
    - Copy buttons on all technical fields (auction_id, placement_id, key_id, signature)
    - Expandable canonical payload viewer with formatted JSON
    - Color-coded candidate status badges
    - Skeleton loaders for graceful loading states
  - **Summary**: `/transparency/summary` — aggregate KPIs

Console UX Features (2025-11-10)
- **Verify Badges**: Click to verify on-demand with loading spinner; tooltips explain each status
  - PASS (green): "Signature verified successfully. This auction record is authentic and has not been tampered with."
  - FAIL (red): "Signature verification failed. [reason]"
  - NOT_APPLICABLE (gray): "Verification not applicable. This auction was not sampled or uses unsupported algorithm."
  - UNKNOWN_KEY (orange): "The signing key is not found in the active key registry. This may indicate a rotated or test key."
- **Copy Affordances**: Icon buttons with checkmark feedback on all technical identifiers
- **Filter Persistence**: All filters sync to URL for bookmarking (e.g., `?from=2025-11-01&geo=US&page=2`)
- **Responsive Design**: Mobile-friendly tables with horizontal scroll and touch-optimized buttons
- **Accessibility**: Full keyboard navigation, ARIA labels, screen reader support

Troubleshooting
- `not_applicable`: The row was not sampled or missing signature/unsupported algorithm; check `TRANSPARENCY_SAMPLE_BPS` and writer flags.
- `unknown_key`: No active public key found for `key_id`. Load the key into `transparency_signer_keys` or set fallback envs.
- `fail`: Signature verification failed — check the canonical payload, numeric precision (eCPM scale), and that the correct public key is used.
- CORS/401: Ensure the client origin matches `CORS_ORIGIN` and pass a valid bearer token. API is publisher-scoped.

Writer runtime behavior & metrics
- Counters exposed: `writes_attempted`, `writes_succeeded`, `writes_failed`, `sampled`, `unsampled`, and `breaker_skipped`. Retrieve via `GET /api/v1/transparency/metrics` or scrape Prometheus names prefixed `transparency_writer_<counter>_total`.
- Gauges: `transparency_writer_breaker_open` (0/1), `transparency_writer_failure_streak`, plus JSON fields `breaker_open` and `breaker_cooldown_remaining_ms` in the metrics endpoint for Console parity.
- Retry/backoff: transient Postgres failures (SQLSTATE `08***`, `40001`, or transport errors such as `ECONNRESET`, `ETIMEDOUT`, `EPIPE`, `ECONNREFUSED`) are retried up to `TRANSPARENCY_RETRY_ATTEMPTS` additional times with jitter between `TRANSPARENCY_RETRY_MIN_DELAY_MS` and `TRANSPARENCY_RETRY_MAX_DELAY_MS` (defaults 3 attempts, 50–250ms).
- Circuit breaker: after `TRANSPARENCY_BREAKER_THRESHOLD` consecutive failures (default 5) the writer pauses sampling writes for `TRANSPARENCY_BREAKER_COOLDOWN_MS` (default 60s). Breaker open/close emits a single WARN/INFO log respectively and increments `breaker_skipped` when dropping attempts.
- Partial writes: if the `auctions` insert succeeds but `auction_candidates` fails, the auction row remains committed. The failure counter increments, breaker state updates, and the metrics endpoint and Prometheus counters reflect the partial error so operators can reconcile gaps without rollback.
- Environment knobs: set `TRANSPARENCY_RETRY_*` and `TRANSPARENCY_BREAKER_*` in addition to `TRANSPARENCY_SAMPLE_BPS`, `TRANSPARENCY_PRIVATE_KEY`, `TRANSPARENCY_KEY_ID`, and `TRANSPARENCY_ENABLED` to tune runtime behavior.
- Automation:
  - Local deterministic regression: `npm --prefix backend run transparency:metrics-check` walks transient success, breaker-open, breaker-skip, and cooldown scenarios while printing JSON + Prometheus samples.
  - Full end-to-end smoke (Docker + API exercise, marked as test env): `npm --prefix backend run transparency:smoke` prepares Postgres/Redis via `docker compose`, drives authenticated RTB bids, can toggle a Postgres outage, and asserts both `/metrics` and `/api/v1/transparency/metrics` include breaker/retry signals before teardown.

References
- Writer and canonicalizer: `backend/src/services/transparencyWriter.ts`
- Controllers: `backend/src/controllers/transparency.controller.ts`
- Routes: `backend/src/routes/transparency.routes.ts`
- Postgres schema: `backend/migrations/025_transparency_receipts.sql`, `backend/migrations/026_ed25519_keys.sql` (legacy ClickHouse DDL lives under `backend/migrations/clickhouse/`).
- CLI: `backend/scripts/transparency-verify.ts`
