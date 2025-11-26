# Console (Next.js) Production Environment — Reference

Purpose: Ensure the Console is production‑ready and aligned with the Infra Migration Plan. No business logic is changed by this document.

---

## Required variables (production)

- NEXT_PUBLIC_API_URL
  - Example: https://api.apexmediation.ee/api/v1
  - Notes: This must be set at build time for Next.js so the client code calls the correct public API origin (behind Nginx with TLS).

- NODE_ENV
  - production

---

## Build and run (local prod‑like)

Build the Console for production using the public API URL you intend to use in prod:
```bash
pushd console >/dev/null
NEXT_PUBLIC_API_URL=https://api.apexmediation.ee/api/v1 \
  npm run build
popd >/dev/null
```

Then, bring up the stack (HTTP only, pre‑DO):
```bash
docker compose -f infrastructure/docker-compose.prod.yml up -d --build
```

Nginx will reverse proxy the Console and Backend on port 80.

---

## Verification

- Open http://localhost/ in a browser after `compose up` and ensure network calls from the Console point to `/api/v1/...` via Nginx.
- Confirm CORS allowlist on the backend includes `https://console.apexmediation.ee` when running in production.

---

## Validation notes (Phase 2)

- Built Console with:
  ```bash
  pushd console >/dev/null
  NEXT_PUBLIC_API_URL=https://api.apexmediation.ee/api/v1 \
    npm run build
  popd >/dev/null
  ```
- Brought up local prod-like stack (HTTP only):
  ```bash
  docker compose -f infrastructure/docker-compose.prod.yml up -d --build
  ```
- Observed in browser DevTools that API requests were sent to `/api/v1/...` and proxied by Nginx to the backend successfully.
- Captured evidence in `docs/Internal/Deployment/local-validation-YYYY-MM-DD/summary.txt` per the Local Validation runbook.

---

## Source files of interest

- infrastructure/production/.env.console.example — example production env for the Console.
- infrastructure/docker-compose.prod.yml — Nginx + service wiring for prod‑like local run.
- infrastructure/nginx/apexmediation.conf — HTTP reverse proxy.
- infrastructure/nginx/apexmediation.ssl.conf — HTTPS reverse proxy (mounted only after certs exist in DO).
