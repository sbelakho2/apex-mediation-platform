ADR-SB-03 — Metrics Cardinality Hygiene & Exemplars Policy
==========================================================

Status: Accepted (2025-11-18)

Context
- Unbounded label values on HTTP metrics (for example raw paths or query parameters) can explode cardinality and harm Prometheus performance.
- We need consistent, low-cardinality labels and a predictable budget.

Decision
- Introduce a `route_id` label derived from Express route templates (for example `/billing/invoices/:id`) instead of concrete paths.
- Add `metricsRouteMiddleware` to capture RED metrics with labels `{ method, route_id, status_code }` only.
- Gate exemplars behind `PROM_EXEMPLARS=1` and keep them disabled by default in production unless capacity is verified.

Guidelines
- Do not add user/tenant/account IDs as labels.
- Prefer booleans/enums over free-text dimension labels.
- Reuse shared helpers from `utils/metricsRoute.ts` and `middleware/metricsRouteMiddleware.ts`.

Alternatives considered
- Per-route manual instrumentation: higher effort and drift risk.

Consequences
- Grafana dashboards should pivot on `route_id` and not on raw paths.
- Alert rules remain stable across deployments.

Validation
- Registry label counts remain within the target budget; dashboards render without high-series warnings.
