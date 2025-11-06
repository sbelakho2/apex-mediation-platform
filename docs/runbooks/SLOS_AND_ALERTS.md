# SLOs and Alerts (Adapter Observability)

Last updated: 2025-11-06
Owner: Platform Engineering

Scope
- Define baseline SLOs and alerting policy for adapters and auction service using in‑process metrics.
- Applies to dev/staging (pre‑FT). Production SLOs may differ and rely on vendor observability.

SLOs (initial)
- Latency p99 per adapter: WARN ≥ 600 ms, CRIT ≥ 1000 ms (from in‑process histogram).
- Error rate per adapter: WARN ≥ 5%, CRIT ≥ 10% (errors / requests over window).
- Fill rate per adapter: WARN ≤ 20%, CRIT ≤ 5% (success / requests over window).
- Evaluation windows: 1h and 24h.

Alerting policy
- Status levels: OK, WARN, CRIT.
- Debounce: require 3 consecutive evaluation intervals (every 5 minutes) before escalating.
- Auto‑recovery: drop to lower severity after 3 consecutive healthy intervals.
- Channels: For now, surface in Website Observability Overview via badges; external paging is out of scope pre‑FT.

Runbooks (common)
- High p99 latency (CRIT):
  - Inspect Mediation Debugger for the adapter; identify timeouts or slow endpoints.
  - Consider enabling hedged requests (AUCTION_HEDGING_ENABLED) and tuning hedge delay.
  - Verify circuit breaker is not flapping; check error reasons.
- High error rate (CRIT):
  - Check error reasons in Adapter Metrics page; 4xx indicates config/auth; 5xx indicates partner instability.
  - Use Debugger to confirm payloads; verify secrets and placement IDs. Rotate keys if needed.
- Low fill (CRIT):
  - Validate floors vs. market; check below_floor reasons and waterfall ordering.
  - Compare to competitor coverage; consider enabling additional adapters.

References
- API endpoints: GET /v1/metrics/adapters, /v1/metrics/adapters/timeseries, /v1/metrics/slo
- Website pages: /dashboard/observability/overview, /dashboard/observability/metrics, /dashboard/observability/debugger
- Code: backend/auction/internal/bidders/{metrics_timeseries.go,slo.go}
