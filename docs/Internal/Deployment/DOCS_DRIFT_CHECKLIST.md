# Docs Drift Checklist — Infra Plan, Runbooks, and Repo Artifacts

Purpose: Provide a quick, repeatable checklist to verify that documentation and runbooks match the actual repository files and configurations. Run this check before major milestones (pre‑DO flip, pre‑cutover) and whenever infra files change. Infra/docs only — no business logic.

---

## 1) Paths referenced in Infra Plan and Checklists exist

Verify these files are present (paths relative to repo root):
- infrastructure/docker-compose.prod.yml
- infrastructure/nginx/apexmediation.conf
- infrastructure/nginx/apexmediation.ssl.conf
- infrastructure/nginx/snippets/ssl-params.conf
- infrastructure/nginx/snippets/metrics-basic-auth.conf
- infrastructure/production/.env.backend.example
- infrastructure/production/.env.console.example
- infrastructure/production/.env.website.example
- scripts/backup/pg_dump_s3_template.sh
- scripts/ops/local_health_snapshot.sh
- docs/Internal/Deployment/LOCAL_PROD_VALIDATION.md
- docs/Internal/Deployment/PHASE6_CHECKLIST.md
- docs/Internal/Deployment/BACKEND_ENVIRONMENT.md
- docs/Internal/Deployment/CONSOLE_ENVIRONMENT.md
- docs/Internal/Deployment/WEBSITE_ENVIRONMENT.md
- docs/Internal/Deployment/DO_INITIAL_BOOT_COMMANDS.md
- docs/Internal/Infrastructure/DO_READINESS_CHECKLIST.md
- docs/Internal/Infrastructure/INFRASTRUCTURE_MIGRATION_PLAN.md

Command (optional helper):
```bash
grep -n "infrastructure/\|scripts/\|docs/Internal/" docs/Internal/Infrastructure/INFRASTRUCTURE_MIGRATION_PLAN.md | sed -n '1,120p'
```

## 2) Critical snippets match guidance

Spot‑check these items for parity with docs:
- Nginx `/metrics` location includes commented examples for IP allowlist and Basic Auth; snippet path is `/etc/nginx/snippets/metrics-basic-auth.conf`.
- `ssl-params.conf` has HSTS commented and OCSP stapling settings per plan.
- docker‑compose.prod.yml:
  - Only `80:80` published by default; `443:443` and SSL config mount are gated until certs exist.
  - Redis has no public `ports:` and is configured with `--requirepass`, `--maxmemory 512mb`, `--maxmemory-policy allkeys-lru`, `--appendonly yes`.
  - Optional htpasswd and `/etc/letsencrypt` mounts exist for Nginx.
- Env templates reflect FRA1 defaults and `sslmode=require` for Postgres.

## 3) CI governance reflects plan

Confirm CI jobs exist and match guidance:
- `.github/workflows/ci-all.yml` jobs present:
  - `backend` (lint/tests/env schema)
  - `website-a11y-perf` (build + Lighthouse + token lint)
  - `console-build` (production build with `NEXT_PUBLIC_API_URL`)
  - `forbidden-dev-urls` (repo guard)
  - `deploy-workflow-safety` (ensures DO deploy is manual/no‑op pre‑DO)
- `.github/workflows/deploy-do.yml` triggers only on `workflow_dispatch`.

## 4) Run local prod‑like validation (pre‑DO)

Follow the runbook to verify health and Redis:
```bash
export REDIS_PASSWORD=local-strong-password
docker compose -f infrastructure/docker-compose.prod.yml up -d --build
REDIS_VERIFY=1 npm run local:health
```

Expected: `summary.txt` and `verify-redis.txt` under `docs/Internal/Deployment/local-validation-YYYY-MM-DD/`.

## 5) Record outcomes and update CHANGELOG

- Add a dated entry in `CHANGELOG.md` summarizing the drift check and any corrections made (docs only), and link to the evidence folder if created.
