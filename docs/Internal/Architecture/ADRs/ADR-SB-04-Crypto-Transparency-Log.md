# ADR-SB-04 — Cryptographic Transparency Log

## Status
Accepted — 2025-11-19

## Context
Part 0 of the VERIFY-FIRST checklist mandates transparent, cryptographically verifiable auction records. We must choose how to persist the append-only log, manage signer keys, and expose verification endpoints without blocking hot paths.

## Decision
- **Storage:** ClickHouse tables `transparency_receipts` and `transparency_signer_keys` (see `backend/src/utils/clickhouse.schema.ts`) hold canonical payloads plus Ed25519 signatures.
- **Signing:** `backend/src/services/transparencyWriter.ts` canonicalizes each auction, signs with Ed25519, and records metrics + breaker states.
- **Verification APIs:** `/api/v1/transparency/auctions`, `/verify`, and `/keys` (Express routes) provide fetch + verification capabilities documented in `docs/Transparency/VERIFY.md`.
- **Key Management:** Keys live in KMS/Infisical, rotated quarterly, recorded in `transparency_signer_keys` with activation windows.
- **Sampling:** Default 10% sampling, adjustable via `TRANSPARENCY_SAMPLE_BPS` env to balance cost vs coverage.

## Consequences
- Append-only receipts with TTL 365 days satisfy governance requirements and feed auditors.
- Breaking the signer (e.g., ClickHouse outage) triggers breaker + PagerDuty alerts, ensuring availability.
- Additional storage cost (~15 GB/year) accepted for auditability.
- Future changes (e.g., Merkle anchoring) must extend this ADR or spawn a successor (status Proposed).
