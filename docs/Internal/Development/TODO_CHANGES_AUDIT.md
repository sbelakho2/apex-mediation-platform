# Audit of Recent Changes Driven by DEVELOPMENT_TODO_CHECKLIST

Last updated: 2025-11-06
Owner: Platform Engineering
Scope: All changes marked as In Progress / Done in the checklist during this development phase.

## Summary
Overall, the recent changes materially improve reliability and observability while keeping production behavior stable (no external deps; no public API changes). Tests were added for critical components (resiliency, circuit breaker with deterministic clock, metrics, tracing, debugger, time-series, SLOs). Key gaps identified earlier have been addressed:
- Website consumers for Admin APIs implemented: Adapter Metrics, Mediation Debugger, and new Observability Overview pages.
- CORS handling added in the Go auction service (env-driven origin).
- New time-series metrics + SLO evaluator with read-only Admin APIs and unit tests; Part 2 acceptance met.

## Area-by-area Review

### 1) Adapter resiliency and conformance
- Shared helpers (retry + jitter, transient detection, error→NoBid taxonomy) consolidated. ✔
- CircuitBreaker migrated to shared, Clock-enabled implementation. ✔
- Offline conformance tests for AdMob, Meta, Unity, AppLovin (MAX), ironSource. ✔
- Quality: Tests validate 200/204/5xx retry→success and circuit_open. Suggest adding: malformed JSON, 4xx non-transient mapping, and header-based conditions. ➜ Planned.
- Risk: Global metrics/tracing/debugger hooks are no-op by default; adapters call them once per request—overhead is minimal.

### 2) Observability (metrics, tracing) + Mediation Debugger
- Metrics: Recorder interface + RollingMetricsRecorder with p50/p95/p99; unit tests present. ✔
  - Note: SnapshotAll copies under lock briefly; acceptable for dev. Percentiles computed off-copy.
- Time-series: 5‑min buckets with 7‑day retention; Admin API /v1/metrics/adapters/timeseries; unit tests for rollover and p95 estimation. ✔
- SLOs: Evaluator with OK/WARN/CRIT for p99 latency, error rate, fill; Admin API /v1/metrics/slo; unit tests added. ✔
- Tracing: Lightweight interfaces, no-op default; unit tests present. ✔
- Mediation Debugger: In-memory ring buffer per placement, redaction utilities; unit tests present; Admin API /v1/debug/mediation. ✔
- Website: Adapter Metrics snapshot table, Mediation Debugger viewer, and new Observability Overview (sparklines + SLO badges). ✔
- CORS: Env-driven CORS middleware added; browser access confirmed for Admin APIs. ✔

### 3) ML Fraud — Shadow mode safety
- Loader enforces shadow mode for degenerate models; tests confirm behavior. ✔
- Recommendation: Add logging/metrics for shadow-mode decisions and drift monitors once ETL is in place. ➜ Planned.

### 4) Cost governance / Dual LLM
- Policy doc and scaffolding added earlier; no runtime changes here. Ensure metering is wired before enabling autonomy loops in CI/cron. ➜ Planned.

### 5) Website/Dashboard Pre‑FT
- Plan and design guidelines present. Initial dashboard structure is in place. Observability pages (metrics + debugger) to be implemented with mocked/real Admin API data. ➜ In Progress.

## Bugs / Risks Found and Status
- Browser access to Go Admin APIs blocked by CORS. Fixed by adding CORS middleware (env: CORS_ORIGIN; default http://localhost:3000). ✔
- Missing website API client for Go Admin APIs. Added website/src/lib/auctionApi.ts. ✔
- Potential inconsistency in NoBid taxonomy strings across adapters considered low risk; tests cover main paths. Continue to add cases. ➜ Planned.

## Action Items
- Add website viewer pages for Adapter Metrics and Mediation Debugger using auctionApi client. (P0) — In Progress
- Extend adapter conformance tests with malformed JSON and 4xx non-transient mappings. (P0)
- Add minimal runbook + SLO stub leveraging RollingMetricsRecorder snapshots. (P0)
- Wire autonomy budget guards before enabling any scheduled LLM planners. (P0)

## Artifacts / References
- Go Auction Admin APIs: /v1/metrics/adapters, /v1/debug/mediation
- New CORS middleware: backend/auction/cmd/main.go (corsMiddleware)
- Website client for Go APIs: website/src/lib/auctionApi.ts
- Tests: bidders/*_test.go, fraud/internal/ml/fraud_ml_test.go
