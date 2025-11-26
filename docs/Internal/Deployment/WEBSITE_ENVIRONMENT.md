# Website (Next.js) Production Environment — Reference

Purpose: Ensure the marketing website is production‑ready and aligned with the Infrastructure Migration Plan (FRA1 + TLS at Nginx). This document does not change business logic.

---

## Required variables (production)

- NEXT_PUBLIC_SITE_URL
  - Example: https://apexmediation.ee
  - Notes: Used by metadata routes (robots/sitemap) and canonical URLs.

- NEXT_PUBLIC_CONSOLE_URL
  - Example: https://console.apexmediation.ee

- NEXT_PUBLIC_API_URL
  - Example: https://api.apexmediation.ee/api/v1
  - Notes: Public API origin behind Nginx with explicit API version path.

- NODE_ENV
  - production

---

## Optional variables

- Analytics
  - NEXT_PUBLIC_ENABLE_GA=false
  - NEXT_PUBLIC_ENABLE_HOTJAR=false
  - Notes: When toggled on, CSP is extended to permit respective hosts.

- Security header gating
  - ENABLE_HSTS=1 (Production only, after SSL Labs A/A+)
  - Notes: HSTS is disabled by default and gated via `ENABLE_HSTS`. Enable only after external TLS validation.

---

## Build and run (local prod‑like)

Build the Website for production using the production URLs:
```
pushd website >/dev/null
NEXT_PUBLIC_SITE_URL=https://apexmediation.ee \
NEXT_PUBLIC_CONSOLE_URL=https://console.apexmediation.ee \
NEXT_PUBLIC_API_URL=https://api.apexmediation.ee/api/v1 \
  npm run build
popd >/dev/null
```

Then, bring up the stack (HTTP only, pre‑DO):
```
docker compose -f infrastructure/docker-compose.prod.yml up -d --build
```

Nginx will reverse proxy the Console and Backend on port 80. HTTPS remains split/unmounted until real certificates exist on DO.

---

## Verification

- Open http://localhost/ in a browser after `compose up`.
  - Check links/buttons: external dashboard links should point to https://console.apexmediation.ee
  - If the site calls the API from the client, verify requests use https://api.apexmediation.ee/api/v1
- Health proxy:
  - `curl -i http://localhost/health` → 200 OK

---

## HSTS policy (aligns with Infra Plan)

- Do not enable HSTS locally or before validating TLS.
- After DO is provisioned and certificates are issued, validate TLS (SSL Labs A/A+). Only then set `ENABLE_HSTS=1` in the website environment so `Strict-Transport-Security` is emitted by Next.js.

---

## Evidence capture

Append results to the dated evidence folder:
```
EVID=docs/Internal/Deployment/local-validation-$(date +%F)
mkdir -p "$EVID"
{
  echo "[WEBSITE BUILD]"; echo "NEXT_PUBLIC_SITE_URL=https://apexmediation.ee NEXT_PUBLIC_CONSOLE_URL=https://console.apexmediation.ee NEXT_PUBLIC_API_URL=https://api.apexmediation.ee/api/v1 npm run build (see website/.next output)";
  echo "\n[NGINX HEALTH]"; curl -i http://localhost/health; echo;
} | tee -a "$EVID"/summary.txt
```

---

## Source files of interest

- infrastructure/production/.env.website.example — example production env for the Website.
- website/next.config.js — security headers (HSTS gated), CSP, default public URLs.
- website/src/app/robots.ts — robots with correct production host/sitemap fallbacks.
- website/src/app/sitemap.ts — sitemap defaults to production host and includes key routes.
- infrastructure/docker-compose.prod.yml — Nginx + service wiring for prod‑like local run.
- infrastructure/nginx/apexmediation.conf — HTTP reverse proxy.
- infrastructure/nginx/apexmediation.ssl.conf — HTTPS reverse proxy (mounted only after certs exist in DO).
