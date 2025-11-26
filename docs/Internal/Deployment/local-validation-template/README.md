# Local Validation Evidence Bundle — Template

Purpose: Provide a consistent structure for capturing outputs from a local prod‑like validation run (HTTP‑only, pre‑DO). Copy this folder to a dated path like:

```
docs/Internal/Deployment/local-validation-YYYY-MM-DD/
```

Recommended files
- summary.txt — Include:
  - `curl -i http://localhost/health`
  - `docker compose -f infrastructure/docker-compose.prod.yml ps`
- verify-redis.txt — Output of:
  - `docker compose -f infrastructure/docker-compose.prod.yml exec backend sh -lc 'npm run verify:redis --workspace backend'`
- verify-db.txt (optional) — If a DB is available:
  - `DATABASE_URL=...sslmode=require npm run verify:db --workspace backend`
- verify-storage.txt (optional) — If storage is configured:
  - `npm run verify:storage --workspace backend`
- notes.md — Any context, screenshots, or observations

Quick commands
```bash
mkdir -p docs/Internal/Deployment/local-validation-$(date +%F)
{
  echo "[HEALTH]"; curl -i http://localhost/health; echo;
  echo "\n[COMPOSE PS]"; docker compose -f infrastructure/docker-compose.prod.yml ps; echo;
} | tee docs/Internal/Deployment/local-validation-$(date +%F)/summary.txt

docker compose -f infrastructure/docker-compose.prod.yml exec backend sh -lc \
  'npm run verify:redis --workspace backend' \
  | tee docs/Internal/Deployment/local-validation-$(date +%F)/verify-redis.txt
```

Notes
- Keep HTTPS unmounted locally until real certificates exist on DO.
- HSTS remains commented until SSL Labs A/A+ is confirmed in production.
- Protect `/metrics` if exposed beyond localhost (Basic Auth snippet or IP allowlist).
