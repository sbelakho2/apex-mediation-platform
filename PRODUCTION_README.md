# Production Deployment Guide

_Audience: deployment devs preparing the ApexMediation stack for the first production launch_
_Last updated: 2025-11-18_

> **FIX-10 governance:** This deployment guide documents _how_ to deploy the platform. For _whether_ the platform is production-ready, see `docs/Internal/Deployment/PROJECT_STATUS.md` and the prioritized backlog in `docs/Internal/Development/FIXES.md`. Note: FIX-07 (quality), FIX-08 (infrastructure), and FIX-09 (automation) have been completed, but FIX-01 through FIX-06 remain in progress.

This guide walks through everything required to ship a fresh production build: prerequisites, quality gates, rollout steps, verification, and known warnings uncovered during FIX-07. Follow each section in order; treat skipped steps as blockers.

---

## TL;DR Checklist

| Phase | Action | Command / Reference |
| --- | --- | --- |
| Prep | Confirm toolchain, Fly.io auth, VPN/SaaS access | [Preflight](#1-preflight-checks) |
| QA | Install deps, run workspace lint/tests, Go integration, targeted k6 suites | [Release Readiness](#2-release-readiness--quality-gates) |
| Deploy | Backend Fly rollout + DB migrations | [Backend Deploy](#3-backend-deploy-flyio) |
| Deploy | Console / web bundle deploy | [Console Deploy](#4-console--website-deploy) |
| Infra | Bring monitoring stack online | [Monitoring Stack](#5-observability--monitoring-stack) |
| Verify | Smoke API/UI, capture screenshots, run Lighthouse and fraud/billing checks | [Verification](#6-post-deploy-verification--smoke-tests) |
| Warn | Review known gaps before sign-off | [Warnings](#7-known-warnings--limitations) |

---

## 1. Preflight Checks

### Tooling & Accounts

- Node.js ≥ 18 and npm ≥ 9 (`node -v`, `npm -v`).
- Go 1.21 for quality integration helpers.
- Docker + docker-compose (monitoring stack, local smoke). Ensure daemon is running.
- k6 CLI (load/perf suites) — `npm install -g k6` or package manager equivalent.
- Fly.io CLI (`fly version`) with prod org access.
- Access to: PostgreSQL primary, ClickHouse, Upstash Redis, Stripe, Resend, S3 (for accounting artifacts), Resend, optional Twilio/Slack/Discord for alerts.
- VPN to reach private staging/prod services if applicable.

### Secrets & Configuration Inventory

| Component | Required Secrets / Config | Source |
| --- | --- | --- |
| Backend Fly app | `DATABASE_URL`, `CLICKHOUSE_URL`, `CLICKHOUSE_PASSWORD`, `UPSTASH_REDIS_URL`, `UPSTASH_REDIS_TOKEN`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `RESEND_API_KEY`, `JWT_SECRET` | `backend/deploy-backend.sh` prompts if missing |
| Console (Next.js) | `NEXT_PUBLIC_API_BASE_URL`, `JWT_SECRET`, `RESEND_API_KEY`, `STRIPE_PUBLIC_KEY`, analytics write key | `console/.env.production` (copy from 1Password) |
| Monitoring stack | `.env` values for Grafana admin password, Resend/Twilio/Slack/Discord hooks, DB/ClickHouse creds | `monitoring/.env` template auto-created |
| Billing load/perf | `BILLING_ORG_ID`, `BILLING_USAGE_TOKEN`/`API_TOKEN`, invoice export bucket | `quality/perf/billing/*.js` |
| Tracking/auction load | `TRACKING_USERNAME`, `TRACKING_PASSWORD`, `TRACKING_API_BASE`, `AUCTION_API_BASE`, optional Bearer token | `quality/load-tests/*` |
| Lighthouse/screenshot capture | `WEBSITE_BASE_URL`, `WEBSITE_SCREENSHOT_HISTORY`, `LHCI_RUNS` | `quality/lighthouse/website.config.cjs`, `quality/tools/capture-website-screenshots.js` |

> ✅ Tip: run `scripts/setup-s3-accounting.sh` and `scripts/install-accounting-deps.sh` ahead of time if billing exports or doc generation are part of the release.

---

## 2. Release Readiness & Quality Gates

1. Sync main & ensure clean tree:
   ```bash
   git fetch origin
   git checkout main
   git pull --ff-only
   git status -sb
   ```
2. Install workspace deps (Node):
   ```bash
   npm install
   ```
3. Backend sanity:
   ```bash
   npm run lint --workspace=backend
   npm run test --workspace=backend
   npm run migrate --workspace=backend # against staging clone first
   ```
4. Console sanity:
   ```bash
   npm run lint --workspace=console
   npm run test --workspace=console
   npm run build --workspace=console
   ```
5. Quality gates:
   ```bash
   pushd quality
   go test ./integration        # ensures helpers + in-memory backend are healthy
   LHCI_RUNS=3 npm run test --workspace=lighthouse || true
   K6_SUMMARY_PATH=artifacts/fraud-summary.json k6 run load-tests/fraud-smoke-test.js
   BILLING_ORG_ID=... BILLING_USAGE_TOKEN=... k6 run perf/billing/usage-api.js
   BILLING_ORG_ID=... BILLING_API_TOKEN=... k6 run perf/billing/invoices-api.js
   BILLING_ORG_ID=... k6 run perf/billing/pdf-load.js
   popd
   ```
   - Override `FRAUD_SUMMARY_FILE` / `K6_SUMMARY_PATH` to avoid `/tmp` permission issues in CI/remote shells.
   - The billing suites fail fast if org or auth tokens are absent — fetch fresh tenant creds before running.
6. Visual + console checks:
   ```bash
   npm run capture:website
   npm run capture:console
   ```
   Screenshots land under `artifacts/website-screenshots/` and `artifacts/console-screenshots/`; only the 5 newest website sets are kept automatically.

Do not proceed until the above passes or signed waivers exist.

---

## 3. Backend Deploy (Fly.io)

1. Export/confirm secrets in Fly (`fly secrets list --app apexmediation-backend-prod`). Missing secrets must be set manually before the script continues.
2. Deploy:
   ```bash
   cd backend
   ./deploy-backend.sh production
   ```
   - Script verifies Fly CLI, app existence, secrets, builds Docker image, deploys to `apexmediation-backend-prod` (region `sjc`).
   - Set `ALLOW_TOML_MUTATION=true` only if you intentionally want to rewrite `fly.toml` (usually avoid in repos).
3. After deploy completes, run health:
   ```bash
   fly status --app apexmediation-backend-prod
   curl https://apexmediation-backend-prod.fly.dev/health
   ```
4. Database migrations: if schema changes land in this release, rerun `npm run migrate --workspace=backend` against production DB immediately after the deploy.
5. Scale + autoscaling:
   ```bash
   fly scale count 4 --app apexmediation-backend-prod
   fly autoscale set min=2 max=10 --app apexmediation-backend-prod
   ```

---

## 4. Console / Website Deploy

1. Ensure `.env.production` contains correct API base URL and analytics keys.
2. Build + deploy via Fly (adjust app name if different):
   ```bash
   cd console
   npm ci
   npm run build
   fly deploy --config fly.toml --app apexmediation-console-prod --ha=false
   ```
3. Post deploy smoke:
   ```bash
   fly status --app apexmediation-console-prod
   curl -I https://apexmediation-console-prod.fly.dev
   ```
4. Run Lighthouse regression from CI-equivalent env (Chrome headless required):
   ```bash
   cd quality/lighthouse
   LHCI_RUNS=3 WEBSITE_BASE_URL=https://apexmediation-console-prod.fly.dev npm run test
   ```

---

## 5. Observability & Monitoring Stack

1. Populate `monitoring/.env` (script generates template if missing).
2. Bring stack online:
   ```bash
   cd monitoring
   ./deploy-monitoring.sh start
   ```
3. Smoke checks (script prints results): Prometheus `http://localhost:9090`, Loki `http://localhost:3100`, Grafana `http://localhost:3000`, Alertmanager `http://localhost:9093`.
4. Optional commands:
   ```bash
   ./deploy-monitoring.sh status
   ./deploy-monitoring.sh logs grafana
   ./deploy-monitoring.sh backup
   ./deploy-monitoring.sh test-alerts
   ```
5. Post boot: import dashboards from `monitoring/grafana/`, configure alert channels, send test alerts before the production window closes.

---

## 6. Post-Deploy Verification & Smoke Tests

1. API + health:
   ```bash
   curl https://apexmediation-backend-prod.fly.dev/api/v1/health
   fly logs --app apexmediation-backend-prod --region sjc | tail -n 200
   ```
2. Console login + billing flows: simulate org admin login, run through invoice generation in the UI, download PDF, ensure Stripe webhooks fire.
3. Fraud + auction load sanity (low RPS to avoid impact):
   ```bash
   cd quality
   FRAUD_SUMMARY_FILE=artifacts/prod-fraud-summary.json VUS=5 DURATION=1m k6 run load-tests/fraud-smoke-test.js
   TRACKING_USERNAME=... TRACKING_PASSWORD=... k6 run load-tests/tracking-load-test.js
   ```
4. Billing perf verification: re-run `perf/billing/*.js` with production tenant IDs, confirm <500 ms p95 for invoices/usage endpoints.
5. Visual baselines: `npm run capture:website` with `WEBSITE_BASE_URL` pointing to production. Archive artifacts and attach to release ticket.
6. Lighthouse report: ensure median scores meet SLOs (≥90 Perf, ≥95 Best Practices). Attach JSON to change ticket.
7. Database + ledger sanity: run read-only smoke queries (`scripts/run-billing-migrations.sh --dry-run`, ad revenue checks via `quality/integration` helpers if needed).

---

## 7. Known Warnings & Limitations

- **Secrets Gate:** `backend/deploy-backend.sh` only checks for _count_ of Fly secrets. Double-check values are current (esp. Stripe/Resend) before deploy.
- **Tracking Tokens:** `quality/load-tests/tracking-load-test.js` fails open if `TRACKING_USERNAME/PASSWORD` are missing. Always run `setup()` minted tokens in staging first to confirm credentials work.
- **Billing Perf Inputs:** `perf/billing/usage-api.js` and `perf/billing/invoices-api.js` require valid `BILLING_ORG_ID` and `BILLING_*_TOKEN`; scripts will 401 if stale. Rotate tokens release-to-release.
- **Fraud Summary Output:** Set `FRAUD_SUMMARY_FILE` or `K6_SUMMARY_PATH` to a writable path (`artifacts/...`). Leaving defaults may try `/tmp`, which fails in CI or limited shells.
- **PDF Load Caching:** `perf/billing/pdf-load.js` caches `ETag` values per virtual user. Clearing k6 state between runs avoids 412 errors when targeting different regions.
- **Website Screenshot Retention:** `quality/tools/capture-website-screenshots.js` purges all but five runs. Copy artifacts elsewhere before rerunning if you need a longer historical trail.
- **Lighthouse Variance:** `quality/lighthouse/website.config.cjs` runs three samples. Expect ~±4 score swing; rerun with warm cache if a single cold run dips below SLO.
- **CI Coverage:** `.github/workflows/ci-all.yml` runs Go integration tests but does not execute k6 suites. Manual perf coverage remains mandatory for prod sign-off.
- **Database Migrations:** There is no automatic migration gating in Fly deploy. Always run migrations manually and capture output.

Document any additional warnings discovered during the window in `CHANGELOG.md` + append here before sign-off.

---

## 8. References & Runbooks

- `backend/deploy-backend.sh` — canonical Fly deployment script.
- `monitoring/deploy-monitoring.sh` — monitoring stack lifecycle.
- `docs/QUICK_START.md` — environment bootstrapping.
- `docs/Internal/Development/FIXES.md` — FIX-07 rationale.
- `quality/` — load/perf/scripts referenced above.
- `scripts/` — automation helpers (`capture-*.sh`, billing migrations, transparency metrics).

For escalations: page #infra Slack channel, then #reliability if SLOs degrade.
