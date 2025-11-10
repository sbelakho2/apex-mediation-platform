### Transparency Verification — API, CLI, and Console

This guide explains how to verify auction integrity records end-to-end using:
- Backend API endpoints
- The Node.js CLI verifier
- Console (Next.js) transparency pages

Prerequisites
- Backend running with transparency enabled: `TRANSPARENCY_ENABLED=1` and `TRANSPARENCY_API_ENABLED=true`
- ClickHouse initialized with the transparency tables (`npm --prefix backend run clickhouse:init`)
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
  - `GET /api/v1/transparency/auctions/:auction_id`
- Verify an auction:
  - `GET /api/v1/transparency/auctions/:auction_id/verify`
  - Response:
    ```json
    { "status": "pass|fail|not_applicable|unknown_key", "key_id": "...", "algo": "ed25519", "canonical": "{...}", "sample_bps": 250 }
    ```
- Active public keys (fallback to env if table empty):
  - `GET /api/v1/transparency/keys`

CLI verifier
- Location: `backend/scripts/transparency-verify.ts`
- Usage:
  ```bash
  npm --prefix backend run verify:transparency -- \
    --auction <uuid> --publisher <uuid> [--api <url>] [--key <base64_or_PEM>] [--verbose]
  ```
- Behavior: Fetches detail + verify, re-verifies locally (if key provided or retrieved), prints PASS/FAIL, non-zero exit on FAIL.

Console
- Feature flag: set `NEXT_PUBLIC_TRANSPARENCY_ENABLED=true` (and `NEXT_PUBLIC_API_URL` to your backend)
- Pages:
  - List: `/transparency/auctions` — filters, integrity badge
  - Detail: `/transparency/auctions/<auction_id>` — integrity panel with verify status and canonical payload
  - Summary: `/transparency/summary` — aggregate KPIs

Troubleshooting
- `not_applicable`: The row was not sampled or missing signature/unsupported algorithm; check `TRANSPARENCY_SAMPLE_BPS` and writer flags.
- `unknown_key`: No active public key found for `key_id`. Load the key into `transparency_signer_keys` or set fallback envs.
- `fail`: Signature verification failed — check the canonical payload, numeric precision (eCPM scale), and that the correct public key is used.
- CORS/401: Ensure the client origin matches `CORS_ORIGIN` and pass a valid bearer token. API is publisher-scoped.

References
- Writer and canonicalizer: `backend/src/services/transparencyWriter.ts`
- Controllers: `backend/src/controllers/transparency.controller.ts`
- Routes: `backend/src/routes/transparency.routes.ts`
- ClickHouse schema: `backend/src/utils/clickhouse.schema.ts`
- CLI: `backend/scripts/transparency-verify.ts`
