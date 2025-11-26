# Phase 8 — Evidence Bundle (Pre‑DO)

Purpose: Assemble a small, auditable evidence bundle that proves the stack runs locally in a prod‑like way (HTTP‑only, no DO required). This is infra/docs only — no business logic.

Scope
- Nginx serving on port 80
- Backend health proxy via Nginx
- Redis reachable only on private bridge; verification via backend container
- Optional: DB SSL verify (if any temporary DB available)
- Optional: Storage/backup DRY‑RUN

---

## 1) Start the stack (HTTP‑only)
```bash
export REDIS_PASSWORD=local-strong-password
docker compose -f infrastructure/docker-compose.prod.yml up -d --build
```

Expected:
- Only `80:80` is published by Nginx; `443` remains disabled.
- Redis has no public `ports:` mapping (only `expose: 6379`).

## 2) Collect evidence (helper preferred)
Preferred one‑liner:
```bash
REDIS_PASSWORD=local-strong-password \
REDIS_VERIFY=1 \
npm run local:health
```

This creates a dated folder under:
```
docs/Internal/Deployment/local-validation-YYYY-MM-DD/
```

Contents:
- `summary.txt` — `curl -i http://localhost/health` and `docker compose ps`
- `verify-redis.txt` — transcript of `npm run verify:redis --workspace backend`

## 3) Optional verifications
Database SSL connectivity (if available):
```bash
export DATABASE_URL="postgresql://<user>:<pass>@<host>:<port>/<db>?sslmode=require"
npm run verify:db --workspace backend | tee docs/Internal/Deployment/local-validation-$(date +%F)/verify-db.txt
```

Storage/backup DRY‑RUN:
```bash
DRY_RUN=1 PGHOST=localhost PGPORT=5432 PGDATABASE=example PGUSER=postgres PGPASSWORD=example \
  AWS_ACCESS_KEY_ID=dummy AWS_SECRET_ACCESS_KEY=dummy S3_BUCKET=s3://dummy \
  bash scripts/backup/pg_dump_s3_template.sh | tee docs/Internal/Deployment/local-validation-$(date +%F)/verify-storage.txt
```

## 4) Teardown
```bash
docker compose -f infrastructure/docker-compose.prod.yml down
```

## 5) Definition of Done (DoD)
- [ ] Dated evidence folder exists under `docs/Internal/Deployment/local-validation-YYYY-MM-DD/`
- [ ] `summary.txt` contains Nginx health 200 OK and compose ps
- [ ] `verify-redis.txt` shows AUTH + PING + TTL flow succeeded
- [ ] Optional: `verify-db.txt` present if DB check was run
- [ ] Optional: `verify-storage.txt` present if DRY‑RUN was performed

## 6) Next (tracking)
- Commit the evidence folder (redact if needed).
- Add a dated entry to `CHANGELOG.md` referencing the folder path.

References
- Local validation runbook: `docs/Internal/Deployment/LOCAL_PROD_VALIDATION.md`
- Evidence template: `docs/Internal/Deployment/local-validation-template/README.md`
- Helper script: `scripts/ops/local_health_snapshot.sh`
