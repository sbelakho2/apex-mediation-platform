# Local Prod‑like Validation Runbook (Pre‑DO)

Purpose: Validate that the stack boots locally in a production‑like way without touching business logic and without requiring DigitalOcean resources.

Scope: Nginx (HTTP only), Backend (prod mode), Console (prod build), Redis (private network only). HTTPS remains disabled until real certificates exist. HSTS stays commented.

---

## 1) Prerequisites
- Docker and Docker Compose installed.
- Node.js and npm installed (to run verification scripts).
- From the repo root, ensure basic env values are available for local boot:
  - For Redis authentication in Compose, set `REDIS_PASSWORD` in your shell before starting or provide an `.env` consumed by Compose:
    ```bash
    export REDIS_PASSWORD=local-strong-password
    ```
  - Backend may also read `DATABASE_URL` during verify steps; keep unset for now unless you want to point to a live DB.

## 2) Start the stack (HTTP‑only)
```bash
docker compose -f infrastructure/docker-compose.prod.yml up -d --build
```

Expected:
- Nginx listens on port 80 only (no 443 binding by default).
- Backend reachable via Nginx.
- Redis runs on the private bridge network only (no public port published).

## 3) Health check via Nginx
```bash
curl -i http://localhost/health
```
Expected: `HTTP/1.1 200 OK` with a lightweight body.

## 4) Redis verification (private network)
Run from the backend container to ensure AUTH, PING, and TTL set/get work end‑to‑end.
```bash
docker compose -f infrastructure/docker-compose.prod.yml exec backend sh -lc \
  'npm run verify:redis --workspace backend'
```

If you want to verify externally that Redis is not exposed:
```bash
# From another machine (not the host running Docker):
nmap <host-public-ip> -p 6379   # Expect closed/filtered
```

## 5) Database verification (optional now)
If you have a reachable Postgres instance (local or managed) and want to verify SSL connectivity:
```bash
export DATABASE_URL="postgresql://<user>:<pass>@<host>:<port>/<db>?sslmode=require"
npm run verify:db --workspace backend
```

If not available yet, skip this step for now. You will run it post‑provisioning against DO Managed Postgres in FRA1.

## 6) Storage verification (optional / DRY‑RUN)
If you want to dry‑run the backup script without pushing data:
```bash
DRY_RUN=1 PGHOST=localhost PGPORT=5432 PGDATABASE=example PGUSER=postgres PGPASSWORD=example \
  AWS_ACCESS_KEY_ID=dummy AWS_SECRET_ACCESS_KEY=dummy S3_BUCKET=s3://dummy \
  bash scripts/backup/pg_dump_s3_template.sh
```
This prints the intended `pg_dump` and `aws s3 cp` commands without executing them.

## 7) Console build check (API URL wiring)
Ensure the console uses the production API URL when built in production mode.
```bash
pushd console >/dev/null
NEXT_PUBLIC_API_URL=https://api.apexmediation.ee/api/v1 \
  npm run build
popd >/dev/null
```

## 8) Collect evidence
Create a dated folder and capture command outputs for the audit trail. Follow the evidence bundle convention below.
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

Quick alternative (helper script)
- You can also use the helper script to collect a snapshot automatically:
  ```bash
  # Set REDIS_VERIFY=1 to include Redis verification via backend container
  REDIS_PASSWORD=local-strong-password \
  REDIS_VERIFY=1 \
  bash scripts/ops/local_health_snapshot.sh
  ```
  This will create the same dated evidence folder and populate `summary.txt` and `verify-redis.txt` as applicable.

 Shortcut via npm script
 - From repo root you can also run:
   ```bash
   REDIS_PASSWORD=local-strong-password \
   REDIS_VERIFY=1 \
   npm run local:health
   ```
   This wraps the helper script and writes outputs into the dated folder under `docs/Internal/Deployment/`.

### Evidence bundle convention
- Location: `docs/Internal/Deployment/local-validation-YYYY-MM-DD/`
- Include the following files when possible:
  - `summary.txt` — `curl -i http://localhost/health` and `docker compose ps` outputs
  - `verify-redis.txt` — output from `npm run verify:redis --workspace backend`
  - `verify-db.txt` — output from `npm run verify:db --workspace backend` (optional if a DB is available)
  - `verify-storage.txt` — output from `npm run verify:storage --workspace backend` (optional)
  - Any screenshots or notes relevant to the run

## 9) Teardown
```bash
docker compose -f infrastructure/docker-compose.prod.yml down
```

---

Notes
- Do not enable HTTPS (443) locally until real certificates exist. The split config `infrastructure/nginx/apexmediation.ssl.conf` remains unmounted by default.
- HSTS must remain commented in `infrastructure/nginx/snippets/ssl-params.conf` until you validate A/A+ at SSL Labs post‑provisioning.
- For `/metrics`, you can enable Basic Auth later by creating an htpasswd file and uncommenting the snippet include; see the Infra Plan.
