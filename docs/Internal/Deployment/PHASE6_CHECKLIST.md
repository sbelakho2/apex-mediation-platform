# Phase 6 — Local Prod‑like Infra Verification (HTTP‑only)

Purpose: Verify the stack behavior locally in a production‑like mode without DigitalOcean. Capture evidence for the audit trail. This does not change business logic.

Scope: Nginx (HTTP only), Backend (prod mode), Console (prod build), Redis (private bridge only). HTTPS and HSTS remain disabled pre‑DO.

---

## 1) Prerequisites
- Docker, Docker Compose, curl, Node.js, npm
- From repo root, set a Redis password in the environment (Compose reads it):
  ```bash
  export REDIS_PASSWORD=local-strong-password
  ```

## 2) Start the stack (HTTP‑only)
```bash
docker compose -f infrastructure/docker-compose.prod.yml up -d --build
```
Expected:
- Nginx listens on port 80 only; 443 is not bound
- Backend/Console reachable via Nginx
- Redis has no published public port (only expose: 6379 on private bridge)

## 3) Health via Nginx
```bash
curl -i http://localhost/health
```
Expected: `HTTP/1.1 200 OK`

## 4) Redis verification (internal)
```bash
docker compose -f infrastructure/docker-compose.prod.yml exec backend sh -lc \
  'npm run verify:redis --workspace backend'
```
Expected: AUTH + PING + TTL set/get succeed.

## 5) Evidence bundle (automated helper)
Preferred one‑liner (from repo root):
```bash
REDIS_PASSWORD=local-strong-password \
REDIS_VERIFY=1 \
npm run local:health
```
This creates `docs/Internal/Deployment/local-validation-YYYY-MM-DD/` with:
- `summary.txt` — curl + compose ps
- `verify-redis.txt` — Redis verify transcript

## 6) Optional verifications
- Database (if available):
  ```bash
  export DATABASE_URL="postgresql://<user>:<pass>@<host>:<port>/<db>?sslmode=require"
  npm run verify:db --workspace backend | tee docs/.../verify-db.txt
  ```
- Storage (DRY_RUN):
  ```bash
  DRY_RUN=1 PGHOST=localhost PGPORT=5432 PGDATABASE=example PGUSER=postgres PGPASSWORD=example \
    AWS_ACCESS_KEY_ID=dummy AWS_SECRET_ACCESS_KEY=dummy S3_BUCKET=s3://dummy \
    bash scripts/backup/pg_dump_s3_template.sh | tee docs/.../verify-storage.txt
  ```

## 7) Teardown
```bash
docker compose -f infrastructure/docker-compose.prod.yml down
```

---

Notes
- Keep HTTPS split config unmounted and HSTS commented pre‑DO.
- For `/metrics`, enable Basic Auth or IP allowlist later as documented.
