# Backend Production Environment — Reference (FRA1, TLS, Postgres‑first)

Purpose: Provide a concise, operator‑friendly reference for the backend runtime environment variables aligned with the Infra Migration Plan. No business logic is changed by this document.

---

## Required variables (production)

- DATABASE_URL
  - Example (DO Managed PG FRA1):
    - postgresql://apex_app:<PASSWORD>@<HOST>:25060/ad_platform?sslmode=require
  - Notes: sslmode=require is mandatory. Start without CA pinning; add later if desired.

- REDIS_URL
  - Example (compose private network):
    - redis://:<REDIS_PASSWORD>@redis:6379/0
  - Notes: Password must be set; Redis is not exposed publicly, only on the private bridge.

- CORS_ALLOWLIST
  - Example:
    - https://console.apexmediation.ee,https://apexmediation.ee
  - Notes: Comma‑separated list; no spaces recommended.

- NODE_ENV
  - production

- PORT
  - Default in compose: 8080 (Nginx proxies to this upstream)

---

## Optional variables

- STORAGE (S3‑compatible)
  - AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY
  - AWS_DEFAULT_REGION: eu-central-1 (common for SDKs when using FRA1)
  - S3 endpoint for Spaces FRA1: https://fra1.digitaloceanspaces.com

- Telemetry / Error tracking
  - SENTRY_DSN or GLITCHTIP_DSN

- Logging
  - LOG_LEVEL: info (default), warn, error, debug (avoid in prod unless needed)

---

## Health and Metrics expectations

- /health
  - Lightweight liveness/readiness indicator; should return HTTP 200 when the service is healthy.
  - Proxied via Nginx on both HTTP (local) and later HTTPS (post‑certs).

- /metrics (optional)
  - Exposed by the backend if enabled. Protect at Nginx using either IP allowlist or Basic Auth.
  - For Basic Auth: use infrastructure/nginx/snippets/metrics-basic-auth.conf and mount ./nginx/htpasswd.

---

## Verification commands (operators)

- Database connectivity
  - npm run verify:db --workspace backend
  - With expected tables: VERIFY_DB_EXPECT_TABLES="users,subscriptions,publisher_bank_accounts" npm run verify:db --workspace backend

- Redis connectivity & isolation
  - npm run verify:redis --workspace backend
  - External scan (expect closed/filtered): nmap <droplet-ip> -p 6379

- Storage (signed URL flow) — optional
  - npm run verify:storage --workspace backend

---

## Source files of interest

- infrastructure/docker-compose.prod.yml — service wiring; Redis flags; Nginx mounts.
- infrastructure/nginx/apexmediation.conf — HTTP proxy, /health, /metrics locations.
- infrastructure/nginx/apexmediation.ssl.conf — HTTPS server blocks (mount only after certs).
- infrastructure/nginx/snippets/ssl-params.conf — Hardened TLS params; HSTS commented by default.
- infrastructure/production/.env.backend.example — prod env template aligned to FRA1.
- backend/scripts/verifyDb.ts, verifyRedis.ts, verifyStorage.ts — verification scripts.

---

## Startup warnings (production posture) and how to fix them

When `NODE_ENV=production`, the backend emits non‑blocking warnings at startup to help operators align the runtime with the Infra Migration Plan. These do not change business logic or fail the process; they are guidance only.

- DATABASE_URL missing sslmode=require
  - Warning text: “DATABASE_URL does not include sslmode=require — add ?sslmode=require for managed Postgres in production.”
  - Fix: Ensure your connection string ends with `?sslmode=require` (or includes it as a query parameter). Example:
    - `postgresql://apex_app:<PASSWORD>@<HOST>:25060/ad_platform?sslmode=require`

- REDIS_URL without password or pointing to a raw/public IP
  - Warning text 1: “REDIS_URL has no password — set a strong password and require AUTH in production.”
  - Fix: Set `REDIS_PASSWORD` and use a URL like `redis://:<REDIS_PASSWORD>@redis:6379/0`. Redis must require AUTH.
  - Warning text 2: “REDIS_URL points to a raw IP — ensure Redis is not publicly exposed and is reachable only on private network.”
  - Fix: Target the private Docker bridge hostname (usually `redis`) or `localhost` if applicable. Do not publish 6379 publicly; rely on `expose: 6379` only in Compose.

- CORS allowlist missing production origins
  - Warning text: “CORS allowlist does not include https://console.apexmediation.ee — add it for production.” (and similarly for the apex root domain)
  - Fix: Set `CORS_ALLOWLIST` to include both production origins, comma‑separated with no spaces:
    - `CORS_ALLOWLIST=https://console.apexmediation.ee,https://apexmediation.ee`

See also
- Infra Plan: TLS, FRA1, Postgres‑first, Redis self‑hosted posture.
- DO Readiness Checklist for the flip steps once DigitalOcean is provisioned.
