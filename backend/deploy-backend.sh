#!/usr/bin/env bash
# DEPRECATED — Fly.io deployment script (do not use)
#
# This script is intentionally disabled. The production plan is DigitalOcean-only:
# - Compute: single droplet `apex-core-1` (FRA1)
# - DB: DO Managed Postgres with `?sslmode=require`
# - Cache: self-hosted Redis on the droplet (private network only)
# - TLS: Let’s Encrypt on the droplet via Nginx; HSTS gated until A/A+
#
# What to use instead:
# - Follow `docs/Internal/Infrastructure/DO_READINESS_CHECKLIST.md` (Sections 10–12)
# - Follow `docs/Internal/Deployment/PRODUCTION_READINESS_CHECKLIST.md` (Infra → Compute + Post‑DO HTTPS/HSTS)
# - Use docker-compose on the droplet as defined in `infrastructure/docker-compose.prod.yml`
# - Evidence tools: `scripts/ops/do_tls_snapshot.sh`, `scripts/ops/local_health_snapshot.sh`
#
# If you need a CI/CD deploy, add a DO-specific GitHub Action or runbook instead of Fly.io.

echo "[DEPRECATED] backend/deploy-backend.sh is disabled. Use the DigitalOcean checklists and compose stack." 1>&2
echo "See: docs/Internal/Infrastructure/DO_READINESS_CHECKLIST.md and docs/Internal/Deployment/PRODUCTION_READINESS_CHECKLIST.md" 1>&2
exit 2
