# /ready Alert Path Evidence — 2025-12-07

Artifacts
- `grafana-panels.json` — exported panels (Postgres replica lag, Redis hit ratio, `/ready` status sparkline).
- `alertmanager-rules.yml` — Alertmanager group wiring `ready_probe_degraded` and `redis_cache_hit_low`.
- Command output (`npm run test:infra -- ready-alerts`) verifying alert evaluations succeed in CI.

CLI capture:
```
$ npm run test:infra -- ready-alerts
> ready_alerts()
PASS  alerts/ready-alerts.test.ts
  ✓ emits warning when /ready latency > 500ms (43 ms)
  ✓ fires critical when replica lag > 5s (5 ms)
  ✓ requires Grafana dashboard json to load (12 ms)
```

Notes
- Grafana snapshot exported from `Monitoring/ready-dashboard.json` (panel IDs 12, 14, 17) at 2025-12-07 22:40 UTC.
- Alerting pipeline tested against staging Prometheus scraping DigitalOcean droplet.
