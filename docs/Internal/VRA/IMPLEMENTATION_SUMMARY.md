# Verifiable Revenue Auditor (VRA) — Implementation Summary

Status: Initial additive rollout (shadow-first). Default OFF. No serving impact.

This document summarizes the implementation that wires the VRA module described in `VRA.md` into the ApexMediation backend, with safe-by-default flags, storage schemas, routes, and basic tests.

Scope delivered in this iteration
- Isolation and Flags
  - New feature flags (environment-driven via `backend/src/utils/featureFlags.ts`):
    - `VRA_ENABLED` (default: false) — guards all VRA routes
    - `VRA_SHADOW_ONLY` (default: true) — dispute creation acknowledges with 202 and does not write side-effects
    - `VRA_ALLOWED_NETWORKS` — optional CSV allowlist for processing scope
- Storage (ClickHouse)
  - New tables created via migrations under `backend/migrations/clickhouse/20251123_181800_vra_tables.*.sql`:
    - `recon_statements_raw`, `recon_statements_norm`
    - `recon_expected`, `recon_match`, `recon_deltas`, `recon_disputes`
    - `proofs_daily_roots`, `proofs_monthly_digest`
  - Up/Down supported by the standard CH migrator script: `node backend/scripts/runClickHouseMigrations.js`
- Services
  - `backend/src/services/vra/vraService.ts`:
    - `getOverview(params)` — computes conservative overview using CH `revenue_events` (USD-normalized); expected==paid baseline (variance 0) until recon_expected is populated.
    - `getDeltas(query)` — reads `recon_deltas` with pagination and confidence filter.
    - `getMonthlyDigest(month)` — fetches proofs from `proofs_monthly_digest`.
  - All ClickHouse interactions are wrapped in `safeQuery` which degrades to empty results to guarantee “no insights” instead of failures.
- API Routes (guarded)
  - `backend/src/routes/vra.routes.ts` mounted in `routes/index.ts` at `/api/v1` root:
    - `GET /api/v1/recon/overview`
    - `GET /api/v1/recon/deltas`
    - `POST /api/v1/recon/disputes` — returns 202 in shadow mode
    - `GET /api/v1/proofs/revenue_digest?month=YYYY-MM`
  - All routes require auth and are protected by the read-only rate limiter.
- Controllers
  - `backend/src/controllers/vra.controller.ts` orchestrates requests → services → responses, including input validation and shadow-mode behavior.
- Tests
  - `backend/src/routes/__tests__/vra.routes.test.ts` verifies:
    - Feature-disabled returns 404
    - Feature-enabled returns 200 with conservative payload when CH is empty
    - Shadow-mode dispute creation returns 202
    - Revenue digest input validation (bad month → 400)

Out of scope for this iteration (planned next milestones)
- Full ingestion of network statements and normalization (`recon_statements_*`).
- Building `recon_expected` from receipts + SDK paid events; matching algorithm and confidence calibration.
- Delta classification rules (underpay, missing, IVT, FX, timing) population and review queues.
- Daily Merkle roots rolling up to monthly digests issuance (issuance job + signing integration).
- Console pages for Overview/Deltas/Disputes/Certificates.

Operational notes
- Enabling VRA safely for canaries:
  1. Apply CH migrations: `node backend/scripts/runClickHouseMigrations.js`
  2. Start API with `VRA_ENABLED=true` and keep `VRA_SHADOW_ONLY=true` initially.
  3. Hit `/api/v1/recon/overview` and `/api/v1/recon/deltas` to validate surfacing and rate limits.
- Backout plan: set `VRA_ENABLED=false` (routes return 404). No serving paths affected.

Assurance mechanisms (current)
- Read-only data access; no SDK/auction path modifications.
- Shadow-first disputes; no external submissions.
- Input validation and CH-safe queries ensure uptime if ClickHouse is unavailable (logs a warning; returns empty result).

Acceptance gates coverage
- The module is wired and gated; storage, APIs, and flags are in place with tests.
- Final acceptance metrics (coverage ≥90%, variance ≤0.5%, digests with ≥95% coverage) require subsequent ingestion/matching/delta issuance work.

References
- Product spec: `VRA.md`
- Routes: `backend/src/routes/vra.routes.ts`
- Controllers: `backend/src/controllers/vra.controller.ts`
- Services: `backend/src/services/vra/vraService.ts`
- Migrations: `backend/migrations/clickhouse/20251123_181800_vra_tables.*.sql`
- Flags: `backend/src/utils/featureFlags.ts`