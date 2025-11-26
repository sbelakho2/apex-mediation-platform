# DigitalOcean Readiness Checklist (Pre‑/Post‑Provisioning)

Purpose: Prepare the repository, CI, DNS, and credentials so that when a DigitalOcean (DO) account is created, you can provision FRA1 resources and deploy without surprises. Includes post‑provisioning verification (HTTPS/HSTS, DB/Redis, metrics) and evidence capture. This is infra/docs only — no business logic.

Status: Pre‑provisioning complete. Post‑provisioning verification steps included below (Phase 9). CI is set to manual‑only for DO deploys and safely no‑ops if DO secrets are absent.

---

## 0) Repository and CI
- Verify deploy workflow is manual-only until DO is ready
  - File: `.github/workflows/deploy-do.yml`
  - Expected: triggers only on `workflow_dispatch`; last step prints a no-op notice when DO secrets are missing.
- Validate container builds without deployment
  - Run workflow manually to build and push `backend` and `console` images to GHCR (skips droplet deploy if secrets are not set).
 - CI quality gates (Phase 5)
   - Primary workflow: `.github/workflows/ci-all.yml`
   - Coverage:
     - Backend: env schema check, lint, unit tests, migrations verify (with ephemeral services where defined).
     - Console: production build with `NEXT_PUBLIC_API_URL=https://api.apexmediation.ee/api/v1`.
     - Website: production build + Lighthouse budgets, optional visual regression.
   - Governance: mark these jobs as required checks on PRs in repository settings; DO deploy remains manual/no-op.
- Operator runbooks (pre‑DO)
  - Local prod‑like validation: `docs/Internal/Deployment/LOCAL_PROD_VALIDATION.md`
  - Phase 8 evidence bundle checklist: `docs/Internal/Deployment/PHASE8_CHECKLIST.md`
  - Backend env reference: `docs/Internal/Deployment/BACKEND_ENVIRONMENT.md`
  - Console env reference: `docs/Internal/Deployment/CONSOLE_ENVIRONMENT.md`
  - Initial droplet boot commands: `docs/Internal/Deployment/DO_INITIAL_BOOT_COMMANDS.md`

 ## 0.1) Services Set (Phase 4 — minimal prod)
 - Minimal services enabled in production compose:
   - `backend` (API) — private bridge only, exposed to Nginx
   - `console` (Next.js dashboard) — served via Nginx
   - `redis` (self-hosted) — private bridge only, `requirepass`, 512MB cap, `allkeys-lru`, AOF
   - `nginx` (reverse proxy) — HTTP 80 locally; HTTPS split config mounted only after certs exist on DO
 - Intentionally excluded unless explicitly required:
   - Experimental services or local/dev helpers in `services/` or elsewhere
 - If enabling additional services later:
   - Add a commented block in `infrastructure/docker-compose.prod.yml` with no public ports
   - Provide an example env under `infrastructure/production/` (no secrets)
   - Validate with Local Prod-like runbook before flip

## 1) Accounts and Billing
- Create a DigitalOcean account.
- Add a payment method and ensure billing is active.
- Confirm quota is sufficient for:
  - 1 droplet (2 vCPU / 4GB / 80GB) in FRA1
  - 1 Managed PostgreSQL (Basic/Dev) in FRA1
  - Optional: 1 Spaces bucket (FRA1) for offsite object/backups (MinIO is primary)

## 2) Domains and DNS Plan
- Domains: `apexmediation.ee` (or your final domain).
- Plan DNS entries (do not go live yet):
  - `api.apexmediation.ee` → droplet public IP
  - `console.apexmediation.ee` → droplet public IP
  - Reserve `status.apexmediation.ee` (CNAME to GitHub Pages later for Upptime)
- Keep TTL at 300s during cutover windows.

## 3) SSH and Access
- Generate dedicated deploy SSH keypair (ed25519 recommended):
  ```bash
  ssh-keygen -t ed25519 -C "deploy@apexmediation" -f ~/.ssh/apex_do_deploy
  ```
- Store the private key securely (KeePassXC or `pass`; avoid cloud vaults for initial setup).
- Public key will be added to `deploy` user `authorized_keys` on the droplet later.

## 4) GitHub Repository Secrets (do not add until ready)
- Prepare values for:
  - `DROPLET_HOST` — public IP or DNS of the droplet
  - `DEPLOY_USER` — e.g., `deploy`
  - `DEPLOY_SSH_KEY` — contents of the private key generated above
- When DO is ready, add secrets at:
  - GitHub → Repository → Settings → Secrets and variables → Actions → New repository secret

## 5) FRA1 Naming and Sizing (decisions)
- Droplet name: `apex-core-1` (FRA1)
- Managed Postgres:
  - Tier: Basic/Dev
  - DB name: `ad_platform`
  - Roles: `apex_app` (app), `apex_admin` (migrations)
  - Port: `25060`
- Object storage primary: MinIO self-hosted on droplet (private bridge only)
- Offsite (optional): Spaces bucket (FRA1) e.g., `apex-prod-objects` (private by default)

## 6) Environment Variables and Templates
- Backend production template is in `infrastructure/production/.env.backend.example` (uses `sslmode=require`, FRA1 Spaces defaults).
- Console production template is in `infrastructure/production/.env.console.example`.
- When ready, materialize real files out-of-repo or on the droplet; do not commit secrets.
 - See also the environment runbooks listed in Section 0 for exact variable expectations.

## 7) TLS Plan
- Use certbot on the droplet; mount `/etc/letsencrypt` into nginx container (read-only).
- HSTS remains commented until SSL Labs A/A+ is confirmed.
- Optionally protect `/metrics` via Basic Auth (htpasswd snippet provided) or IP allowlist.

## 8) Backup Plan (Postgres → MinIO, optional Spaces offsite)
- Script template: `scripts/backup/pg_dump_s3_template.sh`
- Primary target: MinIO on droplet (S3-compatible)
  - Example env: `S3_ENDPOINT=http://minio:9000`, `S3_BUCKET=s3://apex-prod-backups`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`
- Offsite (optional): DigitalOcean Spaces FRA1 for replication/sync
  - Endpoint: `https://fra1.digitaloceanspaces.com`
- Plan lifecycle retention (30–90 days) on the bucket(s).

## 9) Monitoring and Status
- DO Monitoring alerts (to be configured after droplet exists):
  - CPU/RAM >80% for 5m, Disk >80%, Droplet unreachable.
- Public status page (later): Upptime on GitHub Pages with `status.apexmediation.ee` CNAME.

## 10) Enablement Checklist (flip from “ready” to “live”)
Once the account and secrets exist:
1. Create droplet `apex-core-1` in FRA1; harden host; install Docker.
2. Clone repo to `/opt/apex` on the droplet.
3. Add GH repo secrets: `DROPLET_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY`.
4. Run the GitHub Action manually to build/push images and deploy.
5. Issue certs with certbot; validate HTTPS via SSL Labs; then enable HSTS.
   - See `docs/Internal/Deployment/DO_INITIAL_BOOT_COMMANDS.md` for copy‑ready commands (UFW, Docker install, repo clone, certbot issuance, HTTPS enable, HSTS gating).
6. Wire `DATABASE_URL` with `sslmode=require`; run `npm run verify:db` and migrations.
7. Verify Redis isolation with `npm run verify:redis` and external `nmap`.
8. Capture evidence to `docs/Internal/Deployment/` and update `CHANGELOG.md`.
 9. Optionally enable `/metrics` Basic Auth (see `infrastructure/nginx/snippets/metrics-basic-auth.conf` and runbooks).

---

## 11) Phase 8 — Evidence Bundle (Pre‑DO)
- Goal: Assemble an auditable evidence bundle proving local prod‑like behavior.
- Preferred command (creates dated folder and captures health + Redis verify):
  ```bash
  REDIS_PASSWORD=local-strong-password \
  REDIS_VERIFY=1 \
  npm run local:health
  ```
- Checklist: see `docs/Internal/Deployment/PHASE8_CHECKLIST.md`.
- After capture: commit the folder (redact if needed) and add a dated entry in `CHANGELOG.md` referencing it.

> Delivery note: At the end of Phase 9, merge the infra migration documentation and checklists into a single project‑wide `PRODUCTION_READINESS_CHECKLIST.md` (see delivery section in the Infra Plan). This will be the authoritative sign‑off artifact.

---

## 12) Phase 9 — DO Readiness (Post‑Provisioning Verification)

Goal: Prove production posture on the actual droplet: HTTPS working with modern TLS, HSTS gated and enabled after an A/A+ grade, `DATABASE_URL` enforces TLS, Redis is not publicly reachable, `/metrics` is protected, and HTTP→HTTPS redirects behave correctly. Capture evidence under a dated folder.

Artifacts directory (example): `docs/Internal/Deployment/do-readiness-YYYY-MM-DD/`

Recommended capture script (runs from your laptop, requires the public DNS/IP to be resolvable):
```
bash scripts/ops/do_tls_snapshot.sh api.apexmediation.ee
```
This stores headers/TLS details and basic redirect checks into the evidence directory.

### 12.1 Enable HTTPS (once certs exist)
1. On the droplet host, issue certificates for API and Console:
   ```bash
   apt-get update && apt-get install -y certbot python3-certbot-nginx
   certbot certonly --nginx -d api.apexmediation.ee -d console.apexmediation.ee --email ops@apexmediation.ee --agree-tos --non-interactive
   ```
2. Ensure compose mounts `/etc/letsencrypt` into Nginx (already present in `infrastructure/docker-compose.prod.yml`).
3. Mount HTTPS server blocks (already present in repo):
   - `infrastructure/nginx/apexmediation.ssl.conf` → `/etc/nginx/conf.d/apexmediation.ssl.conf`
   - TLS params: `infrastructure/nginx/snippets/ssl-params.conf`
   - Optionally enable Basic Auth for `/metrics` via `infrastructure/nginx/snippets/metrics-basic-auth.conf`.
4. Expose 443 in compose (only on the droplet):
   - In `infrastructure/docker-compose.prod.yml` under `nginx` service, uncomment `- "443:443"`.
5. Reload Nginx:
   ```bash
   docker compose -f infrastructure/docker-compose.prod.yml up -d nginx
   docker compose -f infrastructure/docker-compose.prod.yml exec nginx nginx -t && \
   docker compose -f infrastructure/docker-compose.prod.yml exec nginx nginx -s reload
   ```

### 12.2 Verify TLS and Redirects
From your laptop:
```bash
# Expect 301/308 redirect to HTTPS
curl -I http://api.apexmediation.ee/health | tee docs/Internal/Deployment/do-readiness-$(date +%F)/verify-redirects.txt

# Expect 200 with HTTP/2 and the server certificate chain
curl -I https://api.apexmediation.ee/health | tee docs/Internal/Deployment/do-readiness-$(date +%F)/verify-tls.txt

# Optional: quick cipher/protocol scan (install testssl.sh or use SSL Labs)
echo "Run SSL Labs and save the HTML/PDF or paste summary grade A/A+ here" \
  | tee -a docs/Internal/Deployment/do-readiness-$(date +%F)/verify-tls.txt
```

Gate HSTS until you have an A/A+ grade. Then enable:
- Add or uncomment in `infrastructure/nginx/snippets/ssl-params.conf`:
  ```nginx
  add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
  ```
- Reload Nginx and confirm the header via `curl -Is https://api.apexmediation.ee/ | grep -i strict-transport-security`.

### 12.3 Database (Managed Postgres) — TLS and Migrations
- Ensure production `DATABASE_URL` enforces TLS (`?sslmode=require`).
- On the droplet or via a runner:
  ```bash
  npm run verify:db --workspace backend | tee docs/Internal/Deployment/do-readiness-$(date +%F)/verify-db.txt
  npm run migrate --workspace backend | tee -a docs/Internal/Deployment/do-readiness-$(date +%F)/verify-db.txt
  ```

### 12.4 Redis — Isolation and Auth
- Verify Redis is not publicly reachable from the Internet:
  - From a different network, run: `nmap api.apexmediation.ee -p 6379` → expect `closed/filtered`.
- Verify in-cluster access with AUTH:
  ```bash
  npm run verify:redis --workspace backend | tee docs/Internal/Deployment/do-readiness-$(date +%F)/verify-redis.txt
  ```

### 12.5 Metrics — Protection
Choose one of:
- IP allowlist in the HTTPS server block for `/metrics` (e.g., allow only droplet’s private IPs/VPN).
- Basic Auth using `metrics-basic-auth.conf` (mount `htpasswd` directory in compose).

Capture proof:
```bash
curl -I https://api.apexmediation.ee/metrics | tee docs/Internal/Deployment/do-readiness-$(date +%F)/verify-metrics-protection.txt
```
Expect 401 (Basic) or 403 (IP‑blocked) from the public Internet.

### 12.6 Evidence Bundle and Changelog
Create a dated directory and save all outputs referenced above. Then add a top entry in `CHANGELOG.md` titled:
"Phase 9: DO Readiness — HTTPS/HSTS, DB TLS, Redis isolation (YYYY‑MM‑DD)" with a link to the evidence folder and one‑line summaries of each verification.

Cross‑links:
- See also `docs/Internal/Deployment/PRODUCTION_READINESS_CHECKLIST.md` → Post‑DO HTTPS/HSTS checklist.
