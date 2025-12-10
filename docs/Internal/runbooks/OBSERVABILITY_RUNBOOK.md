# Observability Runbook (Pre‑FT)

Last updated: 2025-11-06
Owner: Platform Engineering

Purpose
- Guide developers/operators to diagnose adapter and auction issues using the built-in, dependency‑free observability.

Key UI Pages
- Observability Overview: /dashboard/observability/overview
  - Shows 7‑day per‑adapter trends (requests, p95 latency) and SLO status badges (OK/WARN/CRIT) for 1h and 24h.
- Adapter Metrics: /dashboard/observability/metrics
  - Point‑in‑time snapshot of counters and p50/p95/p99 latencies; errors by reason.
- Mediation Debugger: /dashboard/observability/debugger
  - Last‑N sanitized events per placement with request/response summaries and timings.

APIs
- GET /v1/metrics/adapters — snapshot
- GET /v1/metrics/adapters/timeseries?days=7 — 5‑minute buckets for the last N days
- GET /v1/metrics/slo — SLO statuses for 1h and 24h windows
- GET /v1/debug/mediation?placement_id=&n=

Common flows
1) Spikes in p99 latency (Overview shows WARN/CRIT)
   - Open Mediation Debugger; filter placement; inspect timings_ms and reasons.
   - Check Adapter Metrics errors (status_5xx vs status_4xx vs timeout). Consider enabling hedging in dev.
2) Elevated error rate
   - In Adapter Metrics, expand "Errors (by reason)"; 4xx => config/auth; 5xx => partner instability.
   - Validate keys and endpoints; rotate creds if needed (never paste secrets; all pages redact).
3) Low fill rate
   - Review floors and below_floor reasons; adjust waterfall ordering or floor CPM.

Notes
- CORS_ORIGIN env must allow your website origin to call the Go Admin APIs.
- All debugger payloads are sanitized: secrets masked, PII dropped; long strings truncated.
- These tools are in‑process and low‑cost, aligned with the ≤ $500/month budget.
