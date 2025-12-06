# Production Readiness Checklist

This is the single, self-contained runbook to take the system to production on DigitalOcean. It consolidates prerequisites, environment materialization, deployment, HTTPS/HSTS, DB/Redis verification, metrics protection, evidence capture, and rollback guidance. Cross-links point to deeper runbooks where needed, but all critical commands are summarized here for operator convenience.

> **DigitalOcean CLI policy:** All cloud interactions below must be executed from Bash using [`doctl`](https://docs.digitalocean.com/reference/doctl/) or the S3-compatible tooling called out in each section. Do not click through the DigitalOcean UI; if a step is missing a CLI, stop and add it here before proceeding.

## Outcomes by the end of this checklist
- Staging stack is online behind Nginx with valid TLS (API required; Console optional) and HSTS enabled for API.
- Backend health/readiness rely exclusively on Postgres + Redis with migrations applied; legacy ClickHouse gating is permanently removed and should never reappear.
- Evidence captured locally for TLS/HSTS and local health snapshot.
- Sandbox org/apps/placements exist; Android test app validated end-to-end; matrix items progressed in order.
- Load/soak, billing usage, and VRA tests planned and executable with clear acceptance criteria.

## Prerequisites (one-time)
- [X] Domain configured: `api.apexmediation.ee`, `console.apexmediation.ee` (TTL 300s)
- [X] DigitalOcean account with billing enabled
- [X] Install and authenticate `doctl`: `brew install doctl && doctl auth init --context Apex-project`
- [X] Provisioning decisions documented (FRA1, droplet size 2 vCPU/4GB/80GB, DO Managed Postgres Basic/Dev)
- [X] SSH keypair for deploy user created and stored in a local encrypted vault (KeePassXC or `pass`)
- [X] GitHub repo secrets prepared (add when ready): `DROPLET_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY`
- [X] Production `.env` templates reviewed:
  - Backend: `infrastructure/production/.env.backend.example` (requires `?sslmode=require`)
  - Console: `infrastructure/production/.env.console.example`
- [X] Evidence tooling verified locally: `scripts/ops/local_health_snapshot.sh`, `scripts/ops/do_tls_snapshot.sh`
- [X] Clone repo to `/home/deploy/` on the droplet
- [X] Materialize `.env` files from templates (do not commit secrets)
- [X] Start stack HTTP-only: `docker compose -f infrastructure/docker-compose.prod.yml up -d` and verify `http://<ip>/health`
- [X] Issue certs with certbot, mount `/etc/letsencrypt`, enable `infrastructure/nginx/apexmediation.ssl.conf`, expose 443
- [X] From your laptop run: `npm run do:tls` to capture TLS/HSTS evidence

## 0.0 Staging Bring-up and Full Sandbox Matrix

### 0.0.0 Staging Stack Online (HTTP → TLS/HSTS)
- [x] Materialize runtime envs on droplet only (do not commit):
  - `/home/deploy/Ad-Project/infrastructure/production/.env.backend` (Managed Postgres `?sslmode=require` or `no-verify` during staging), Redis URL, secrets (`JWT_SECRET`, `COOKIE_SECRET`, optional `CSRF_SECRET`).
- [x] Start core services (backend, redis, postgres) behind Nginx on HTTP (port 80):
  - `NGINX_PORT=80 docker compose -f infrastructure/docker-compose.prod.yml up -d`
  - Verify `curl -i http://<ip>/health`.
- [x] Enable TLS for API (and Console when ready):
  - Stop Nginx container, issue certs with certbot on host; mount `/etc/letsencrypt` in Nginx; expose 443 via `docker-compose.override.yml`.
  - Verify `curl -I https://api.apexmediation.ee/health`.
  - Console TLS (when Console service is enabled): either reuse the API cert if SAN includes `console.apexmediation.ee`, or issue a dedicated console cert; verify `curl -I https://console.apexmediation.ee/`.
- [x] Evidence capture: run `npm run do:tls` from laptop and archive artifacts under `docs/Internal/Deployment/do-readiness-YYYY-MM-DD`.
- [x] Nginx dynamic upstreams: proxy to `backend:8080` (and `console:3000`) with Docker DNS resolver to avoid stale-IP 502s.
- [x] Health/Readiness are Postgres + Redis only (legacy ClickHouse gates must stay removed): `/health` OK; `/ready` relies on DB/Redis latency and basic cache checks.
  - `2025-12-06` verification snapshot (post redeploy):
    - `curl -Is https://api.apexmediation.ee/health` → `HTTP/2 200` with HSTS; same hardened headers emitted via nginx + backend middleware.
    - `curl -s https://api.apexmediation.ee/ready | jq` → `{ "status": "ready", "database": { "connected": true, "latency_ms": 73 }, "redis": { "ready": true }, "replica": { "hasReplicas": false }, "staging": { "totalRows": 0 }, ... }`. Readiness gate is live and returns HTTP 200 for operators/CI.
### Post‑DO HTTPS/HSTS Verification (Phase 9)
- [x] Once HTTPS is live, run `scripts/ops/do_tls_snapshot.sh` (or `npm run do:tls`) from your workstation to archive redirects/TLS/HSTS output — executed on **2025-12-03** against `api.apexmediation.ee`; artifacts live under `docs/Internal/Deployment/do-readiness-2025-12-03/`.
- [x] Ensure the bundle contains `verify-redirects.txt`, `verify-tls.txt`, and `verify-hsts.txt` with SSL Labs A/A+ notations — latest run includes all three files with HTTP→HTTPS, HTTP/2/TLS 1.3, Strict-Transport-Security evidence plus the "✅ A+ SSL rating" deliverable captured in `docs/Internal/Deployment/DEPLOYMENT_ROADMAP.md` (Week 6 summary).
- [x] Keep HSTS commented until the API cert consistently scores A/A+, then re-run the script and capture the enforcement snapshot — HSTS stayed disabled in `infrastructure/nginx/snippets/ssl-params.conf` until the 2025-12-03 SSL Labs pass; production nodes now emit the header via `backend/src/middleware/securityHeaders.ts` (NODE_ENV=production) and the same snapshot preserved the enforcement state. Re-run `scripts/ops/do_tls_snapshot.sh api.apexmediation.ee` after each cert renewal.

### 0.0.1 Environments, Fixtures & Common Test Data
- [x] Provision dedicated staging endpoints (`STAGING_API_BASE`, `STAGING_CONSOLE_BASE`) and an isolated staging database — `.github/workflows/deploy-staging.yml` and `docs/Internal/Deployment/CI_CD_GUIDE.md` define the hosts (`https://api-staging.apexmediation.ee`, `https://console-staging.apexmediation.ee`) plus `STAGING_DATABASE_URL/STAGING_REDIS_URL` secrets the pipeline requires.
- [x] Create sandbox org **Apex Sandbox Studio** with Android, iOS, Unity, Android TV/CTV, and tvOS apps. *(Seeded 2025-12-04 via managed Postgres using `doadmin` — connection string `postgres://doadmin@apexmediation-db-do-user-29825488-0.m.db.ondigitalocean.com:25060/apexmediation?sslmode=no-verify`.)*
  - Publisher ID `138f62be-5cee-4c73-aba4-ba78ea77ab44` now exists in `publishers`.
  - App inventory (all tied to the publisher above):

    | Platform          | App Name                       | Bundle ID                    | App ID                                 |
    | ----------------- | ------------------------------ | ---------------------------- | -------------------------------------- |
    | Android           | Apex Sandbox Android           | `com.apex.sandbox.android`   | `7bcfc807-1834-4d69-a1ca-27e258f4ce75` |
    | iOS               | Apex Sandbox iOS               | `com.apex.sandbox.ios`       | `6b8213e3-b331-40b8-a32f-2bac1678e737` |
    | Unity             | Apex Sandbox Unity             | `com.apex.sandbox.unity`     | `26c1c1eb-9fe1-4d3d-9218-6a2d863d57ac` |
    | Android TV / CTV  | Apex Sandbox Android TV/CTV    | `com.apex.sandbox.androidtv` | `3a6dac72-aa81-44af-909c-5b48ab9cbe67` |
    | tvOS              | Apex Sandbox tvOS              | `com.apex.sandbox.tvos`      | `f79cd436-751a-4e26-b2cc-298d1029f794` |

  - Verification: `docker run --rm -e PGPASSWORD=$DOADMIN_PASS postgres:16 psql 'sslmode=require host=apexmediation-db-do-user-29825488-0.m.db.ondigitalocean.com port=25060 user=doadmin dbname=apexmediation' -c "SELECT company_name, COUNT(*) apps FROM apps WHERE publisher_id='138f62be-5cee-4c73-aba4-ba78ea77ab44' GROUP BY 1;"`
- [x] Give every app at least two interstitial placements, two rewarded placements, and one banner slot with consistent IDs. *(All 25 placements inserted 2025-12-04; IDs follow the `sandbox-<platform>-<type>-<nn>` naming convention and live in `placements`.)*
  - Each platform received five placements — two interstitial, two rewarded, one banner — using deterministic UUIDs so they can be referenced safely in SDK configs.
  - Quick reference (per app):

    | App                              | Placement ID                             | Placement Name                | Type         |
    | -------------------------------- | ---------------------------------------- | ----------------------------- | ------------ |
    | Apex Sandbox Android             | `edcbe420-5e96-4c0f-b7ee-e5a10eb11db3`   | Android Interstitial 01       | interstitial |
    |                                  | `92fe3cb3-8028-4a65-aacf-c9916b2efc29`   | Android Interstitial 02       | interstitial |
    |                                  | `b8372490-f300-49e8-b7c2-a77fc04f85e9`   | Android Rewarded 01           | rewarded     |
    |                                  | `631c2a8a-94b8-4448-8d56-a7cddb280ea5`   | Android Rewarded 02           | rewarded     |
    |                                  | `47998e9f-dfbe-4ba9-922c-3001f106722e`   | Android Banner 01             | banner       |
    | Apex Sandbox iOS                 | `26c8907d-7635-4a13-a94b-6c3b12af1779`   | iOS Interstitial 01           | interstitial |
    |                                  | `3b94ce00-15d2-4b96-9d1e-b096cd12cdb9`   | iOS Interstitial 02           | interstitial |
    |                                  | `ca610a0c-8607-4a38-8a21-9cbfd3018b7b`   | iOS Rewarded 01               | rewarded     |
    |                                  | `83d155c1-d3ab-413a-8d6f-bb282d4a058b`   | iOS Rewarded 02               | rewarded     |
    |                                  | `bdf98482-e3c8-4792-bc06-7e98f7184d08`   | iOS Banner 01                 | banner       |
    | Apex Sandbox Unity               | `3d1094ab-a85b-4737-a749-d8a153a0f026`   | Unity Interstitial 01         | interstitial |
    |                                  | `7f7f250e-48c0-4a89-9015-5c6cea325b3e`   | Unity Interstitial 02         | interstitial |
    |                                  | `074b2dc7-3173-4da0-aba0-250f3f129df1`   | Unity Rewarded 01             | rewarded     |
    |                                  | `e159286d-7f60-437c-9f58-83aebdcdbf13`   | Unity Rewarded 02             | rewarded     |
    |                                  | `f6e7aa9b-09c5-4644-bf56-f8ab781ac62d`   | Unity Banner 01               | banner       |
    | Apex Sandbox Android TV/CTV      | `28f1d412-71d4-486b-93c7-e3d7101f2b2c`   | Android TV Interstitial 01    | interstitial |
    |                                  | `15d8efc7-0e45-4eb8-9eec-47eedb8424bb`   | Android TV Interstitial 02    | interstitial |
    |                                  | `916aa3f1-b875-45f9-b672-bb6461ceadf4`   | Android TV Rewarded 01        | rewarded     |
    |                                  | `430810ca-0549-4755-ae74-cd0df596cfee`   | Android TV Rewarded 02        | rewarded     |
    |                                  | `1a5c9eca-b8b7-4b9a-b8a7-2ec5942d5645`   | Android TV Banner 01          | banner       |
    | Apex Sandbox tvOS                | `8a94e8fd-8995-4b17-b308-38f1104d1e84`   | tvOS Interstitial 01          | interstitial |
    |                                  | `d8f4ec50-cde4-47b7-a139-ed02bd1f88d8`   | tvOS Interstitial 02          | interstitial |
    |                                  | `090ce110-b9dc-4722-93dd-8bd3fcfdb2e0`   | tvOS Rewarded 01              | rewarded     |
    |                                  | `24ed4867-b16e-4a4b-b8ac-43dd05788a81`   | tvOS Rewarded 02              | rewarded     |
    |                                  | `f7defcdc-33e5-41f3-8577-2bceb73015d3`   | tvOS Banner 01                | banner       |

  - Verification: `SELECT a.name, pl.type, pl.name, pl.id FROM placements pl JOIN apps a ON a.id = pl.app_id WHERE a.publisher_id='138f62be-5cee-4c73-aba4-ba78ea77ab44' ORDER BY a.name, pl.type, pl.name;`
- [x] Stand up FakeNetworkA (always fill), FakeNetworkB (random fill/no-fill), and FakeNetworkC (slow/timeout) plus Starter (~$3k), Growth (~$50k), and Scale (~$150k) revenue scripts. *(Run `npm run sandbox:bootstrap --workspace backend` to upsert adapters/configs/waterfalls + sandbox logins/Stripe, then `npm run sandbox:revenue:starter|growth|scale --workspace backend` to synthesize 30-day revenue (~$3k, ~$50k, ~$150k) across all placements. Scripts are idempotent and scoped to publisher `138f62be-5cee-4c73-aba4-ba78ea77ab44`; use `--dry-run`/`--keep-history` flags when needed.)*
- [x] Issue staging logins (`owner@`, `dev@`, `finance@apex-sandbox.test`) and enable Stripe test mode with customer + card/ACH/SEPA methods. *(Same bootstrap script hashes deterministic passwords (override via `SANDBOX_USER_PASSWORD`), seeds the three users, and provisions a Stripe test customer with 4242 card + `btok_us_verified` (ACH) + `btok_sepa_debit`. Follow up by sending Resend invites if you need fresh magic links.)*
- [x] Ensure every SDK build (Android, iOS, Unity, tvOS/CTV, Web) ships adapters for every network API/SDK in scope (FakeNetworkA/B/C + partner networks) so request/response parity is validated end-to-end — captured in `docs/Adapters/SUPPORTED_NETWORKS.md` and the adapters inventory section of `docs/Internal/SANDBOX_TESTING_READINESS_2025-11-13.md` (all 15 partner networks stubbed across platforms).

### 0.0.2 Android Test App – Full E2E SDK Sandbox
- [x] Ship debug-only **ApexSandboxAndroid** with SDK status panel, Init/Load/Show buttons, GDPR/CCPA/LAT toggles, and rolling request log.
- [x] Pass happy-path flows: single initialize call, interstitial/rewarded load→show→callback order, banners refresh without layout issues.
- [x] Exercise error states: airplane mode, FakeNetworkB no-fill, FakeNetworkC timeout, and invalid placement IDs without crashes.
- [x] Stress lifecycle: rotation, background/foreground swaps, rapid Show spam → ensure one show at a time and consistent callbacks.
- [x] Flip consent/privacy toggles (GDPR, CCPA, COPPA, LAT, test mode) and confirm metadata in staging logs.
- [x] Run a 30-minute soak cycling placements; verify no ANRs, crashes, or runaway memory in Android Studio profiler.

### 0.0.3 iOS Test App – Full E2E SDK Sandbox
- [x] Build **ApexSandboxiOS** with Init/Load/Show buttons, consent/ATT toggles, and debug overlay (config version, request ID, last error).
- [x] Confirm `MediationSDK.initialize` idempotency plus clean interstitial/rewarded callback sequences.
- [x] Validate error handling for Wi-Fi drop, invalid placement IDs, and FakeNetworkC timeout; UI stays responsive.
- [x] Stress lifecycle: background mid-load, orientation change, rapid Show taps → no duplicate presenters or crashes.
- [x] Simulate ATT allow/deny plus GDPR/CCPA toggles and confirm outbound metadata updates.
- [x] Complete 30-minute soak run with Crashlytics instrumentation and zero crashes/memory leaks.

Implementation/validation guide (iOS)

Prerequisites
- [X] macOS 14+ (Sonoma), Xcode 16.x with iOS 17+ simulators installed
- [X] Apple Developer Team (for on-device runs; not required for Simulator)
- [X] CocoaPods 1.15+

Project layout
- Create the test app under: `Test Apps/ApexSandboxiOS/`
  - `ApexSandboxiOS.xcodeproj` (or `.xcworkspace` if using CocoaPods)
  - Targets: `ApexSandboxiOS` (app)
  - Bundle ID suggestion: `ee.apexmediation.sandbox.ios`
  - Deployment target: iOS 15.0+
  - Architectures: arm64 + x86_64 (for Simulator via Rosetta where applicable)

SDK integration
- via CocoaPods:
  - Create `Podfile` in `Test Apps/ApexSandboxiOS/`:
    ```ruby
    platform :ios, '15.0'
    use_frameworks!
    target 'ApexSandboxiOS' do
      pod 'MediationSDK', :path => '../../sdk/ios' # adjust path or use remote spec when published
      # Optional: Crashlytics
      pod 'Firebase/Crashlytics'
    end
    ```
  - Run `pod install` and open the workspace

UI and debug overlay
- Main screen controls (create with UIKit or SwiftUI):
  - [x] Initialize (one button)
  - [x] Load Interstitial, Show Interstitial (two buttons)
  - [x] Load Rewarded, Show Rewarded (two buttons)
  - [x] Consent toggles: GDPR, CCPA, COPPA, Test mode
  - [x] ATT toggle (triggers ATT prompt or simulates allow/deny in Simulator)
  - [x] Debug overlay (non-blocking): shows config version, last request ID, last error code/message, and current consent/ATT states

Initialize + idempotency
- Expected behavior:
  - Multiple `MediationSDK.initialize(context:options:)` calls are safe (no crash, no duplicate observers); subsequent calls are no-ops.
  - Logs include a single SDK version banner; subsequent calls log "already initialized".
- Steps:
  - [x] Tap Initialize multiple times; verify only one initialization path is executed.
  - [x] Confirm callbacks or readiness notifications fire once.

Interstitial/Rewarded flows
- Expected behavior:
  - Clean callback sequences: `onLoad → onShow → onClick? → onClose` with no duplicates, exactly once per show.
  - Show blocked if not loaded; Show after load succeeds; subsequent load allowed post‑close.
- Steps:
  - [x] Load Interstitial → Show → verify callback order and no duplicates
  - [x] Load Rewarded → Show → verify reward callback and dismissal

Error handling validations
- Wi‑Fi drop:
  - [x] Disable Network Link Conditioner or turn off Wi‑Fi in Simulator during load
  - Expect: `onLoadFailed(timeout/network)` no UI freeze; retry works after network returns
- Invalid placement IDs:
  - [x] Use an intentionally invalid placement, expect immediate error and readable message
- FakeNetworkC timeout (if test adapter available):
  - [x] Toggle FakeNetworkC and verify timeout path; app UI stays responsive

Lifecycle stress tests
- [x] Background app mid‑load; return and ensure no crashes; pending load either times out or resumes per SDK design
- [x] Rotate device (portrait↔landscape) during load/show; no duplicate presenters; orientation respected when showing
- [x] Rapid "Show" taps while an ad is already presenting; ensure only one presentation occurs and additional taps are ignored/debounced

ATT + consent toggles
- [x] Simulator: Features → Privacy → Tracking → Reset (then request again)
- [x] Present ATT request via SDK or app; test both allow/deny
- [x] Toggle GDPR/CCPA/COPPA; confirm outbound metadata updates (inspect network console or SDK debug logs)

30‑minute soak run with Crashlytics
- Setup (optional but recommended):
  - [x] Add Firebase (Crashlytics) to the app; initialize on launch; verify a test log appears in Firebase console
- Soak procedure:
  - [x] Start a 30‑minute loop: Load→Show interstitial, then Load→Show rewarded; rotate device every 2–3 minutes; background/foreground twice
  - [x] Monitor Xcode memory graph; ensure no runaway memory
  - [x] Expect zero crashes and no ANRs; Crashlytics should remain empty for fatal/non‑fatal issues

Evidence capture (store under repo)
- Directory: `docs/Internal/QA/ios-sandbox/<YYYY-MM-DD>/`
  - [ ] `screenshots/` (initialization, consent toggles, ATT prompt, debug overlay, callback console)
  - [ ] `videos/` short clips of load/show flows and lifecycle stress
  - [ ] `logs/console.txt` exported from Xcode (filter by MediationSDK tag)
  - [ ] `results.json` with summary: SDK version, iOS version/device, pass/fail for each checklist item

Acceptance criteria
- [x] Initialize idempotent (no duplicate observers; single version banner)
- [x] Interstitial and Rewarded flows deliver exactly-once callback sequences
- [x] App remains responsive during network loss/timeout/invalid placement tests
- [x] No crashes under lifecycle stress; no duplicate presenters
- [x] ATT + GDPR/CCPA toggles reflect in outbound metadata
- [x] 30‑minute soak: zero crashes, stable memory profile

Notes
- Use a dedicated sandbox API org and apps/placements mirroring Android sandbox to keep parity across platforms.
- If the SDK provides a Mediation Debugger, expose an entry in the sandbox app to open it and capture a screenshot in the evidence bundle.

### 0.0.4 Unity Test Project – Multi-Platform SDK Sandbox
- [x] Create **ApexSandboxUnity** (single-scene) with Init, Load/Show Interstitial, Load/Show Rewarded, optional Banner, and status console.
- [x] Export Android and iOS builds; ensure Unity wrapper wiring matches native SDK versions.
- [x] Verify Unity callbacks fire exactly once per show and map errors (no-fill/timeout/network) into Unity enums/strings.
- [x] Ensure Unity consent toggles propagate down to native layers (check staging logs) and that placement IDs/configs match mobile builds.

### 0.0.5 Android TV / CTV Test App
- [x] Build **ApexSandboxCTV-Android** with remote-friendly focus UI and full-screen ad surface (1080p + 4K).
- [x] Validate SDK init plus interstitial/rewarded load+show on real Android TV/Fire TV hardware or emulator; Back button dismisses gracefully.
- [x] Confirm lifecycle resilience (Home → other app → return) and smooth handling of Ethernet/Wi-Fi toggles mid-load.
- [x] Ensure logging tags requests with `platform=android_tv` (or similar) for analytics segmentation.

### 0.0.6 tvOS / CTV Test App
- [x] Build **ApexSandboxCTV-tvOS** with focus-driven UI (Init, Show Interstitial, Show Rewarded) and test on Apple TV.
- [x] Confirm show flows mirror iOS while respecting TV navigation semantics (one presentation at a time).
- [x] Test background/foreground transitions and rapid button presses without crashes; verify logs carry `platform=tvos`.

### 0.0.7 Console & Dashboard Sandbox Tests
- [ ] Run signup/login/password-reset flows on staging console; confirm verification emails via Resend and session handling.
- [ ] Create org/apps through UI, generate API keys, and verify persistence in DB plus availability in staging SDK configs.
- [ ] CRUD placements with validation (no duplicates, required fields) and confirm propagation to test apps.
- [ ] Configure FakeNetworkA/B/C adapters (placeholders only), ensure secrets never log, and toggle per-placement enablement.
- [ ] Validate dashboards: revenue/eCPM/fill charts show sandbox data, drill-down + time-range filters work, and widgets stay in sync.
- [ ] Exercise Mediation Debugger entries from sandbox apps; inspect timelines/no-bid reasons, confirm pagination + filters + PII redaction.
- [ ] Surface network auction logs and/or hashed bid/commitment payloads per request so publishers can export evidence (meets transparency pledges); verify SDKs stream these artifacts and console exposes filters/downloads.
- [ ] Validate end-to-end transparency exports and redaction: cross-check exported CSV/JSON against `docs/Internal/Transparency/DATA_FLOW_AND_COMPLIANCE.md` (hashing/salting rules, no raw device IDs without lawful basis). Ensure operators can access per-request `auction_root`, `bid_commitment`, reasons, and clearing price without PII.

Postgres-only analytics/readiness (from migration plan and changelog):
- Reporting, quality monitoring, transparency, billing usage, and export APIs read from Postgres fact tables and replicas. No ClickHouse dependency.
- `/ready` reports Postgres/Redis health (latency, replica lag, cache hit), not ClickHouse; alerts/dashboards track replica lag and query budgets.

### 0.0.8 Website / Landing Page Sandbox Tests
- [ ] Deploy staging marketing site (e.g., `staging.apexmediation.ee`) and verify `/`, `/pricing`, `/docs`, `/legal/*` routes 
- [ ] Confirm navigation, signup redirect into staging console, and “Request demo” form delivering to Resend/CRM sandbox.
- [x] Check content parity: BYO tiers (Starter 0%, Growth 2.5%, Scale 2.0%, Enterprise 1–1.5%) and no legacy managed-demand copy (see `website/src/app/%5B...slug%5D/page.tsx` “Fees & payment terms” section referencing the exact tier percentages).
- [x] Run website security header/unit suite: `npm --prefix website run test` (2025-12-06 run on Sadok MBP; Jest suite green, confirming HSTS + CSP coverage under `website/src/__tests__/security.headers.test.js`).
- [ ] Perform responsive sweep (desktop/tablet/360px mobile) to ensure no layout overlap or broken sections.
- [ ] Validate title/meta/canonical tags plus custom 404 behavior and absence of broken links.

### 0.0.9 Billing, Usage & Stripe Sandbox Tests
- [ ] Generate synthetic usage for Starter (<$10k), Growth (~$50k), and Scale (~$150k) apps; run aggregation job and confirm tier assignments.
- [ ] Trip Starter cap by exceeding $10k to ensure backend flips `requires_payment_method` and console shows upgrade banner/feature blocks.
- [ ] Create Stripe test customer, send metered events, finalize invoice, and confirm webhook transitions local invoice (open→paid) and PDF shows Bel Consulting OÜ + Wise SEPA/ACH text.
- [ ] Use Stripe Customer Portal link from console to add test card, run charge, and verify states in Stripe + console UI.
- [ ] Send “upcoming invoice”, “invoice paid”, and “payment failed” email previews; assert plan/dollar amounts and Resend logs.
- [ ] Simulate payment failure to test dunning job, console status transitions, and notification fan-out.

### 0.0.10 VRA / Reconciliation Sandbox Tests
- [ ] Run multi-day sandbox traffic (impressions/clicks/paid events) and craft matching, under-reported, and FX-mismatched network statements.
- [ ] Execute VRA pipeline; verify `recon_statements_norm`, `recon_expected`, `recon_match`, and `recon_deltas` contain correct classifications.
- [ ] Review console VRA overview metrics, deltas filtering (app/network/date), and dispute-kit ZIP (CSV + receipt summary).
- [ ] Validate Proof-of-Revenue: daily roots + monthly digest generation plus hash verification tooling.
 - [ ] Cross‑reference `docs/Internal/VRA/IMPLEMENTATION_SUMMARY.md` for expected table names, flows, and evidence examples.

### 0.0.11 Cron Jobs, Emails & Automation (Staging)
- [ ] Run staging cron/worker stack (usage aggregation daily, Stripe sync, email queue) and confirm zero crashes in logs.
- [ ] Verify failure alerting for jobs, plus render sandbox-triggered emails in test inboxes.

### 0.0.12 Light Load & Soak Test (End-to-End)
- [ ] Drive 1–5 RPS `loadAd` + reporting traffic via script/k6/Gatling for ≥1 hour across sandbox apps.
- [ ] Keep API p95 within targets, error rate <1%, low Sentry noise, and stable CPU/memory on staging droplet.
- [ ] Capture heap/CPU snapshots and export Grafana/Prometheus panels for run evidence.

### 0.0.13 Final Readiness Gate (system operational + tested)
- [ ] 0.0.0 complete: HTTP → TLS/HSTS (API), evidence archived; Console TLS verified or consciously deferred.
- [ ] 0.0.1 seeded: org/apps/placements present; migrations applied; readiness `/ready` green (Postgres + Redis only).
- [ ] 0.0.2 Android app green: happy path, errors, lifecycle, 30‑minute soak.
- [ ] Website, Billing, VRA, Cron/Automation checkpoints planned or executed as applicable; any deferred items are tracked with owners/dates.
- [ ] Rollback/runbook documented; on‑call dashboards and alerts show the new Postgres‑only signals (replica lag, cache hit, query p95).

### 0.0.14 SDK Privacy, Lifecycle & Observability Audit
- [ ] Privacy & identifiers
  - [x] iOS: enforce ATT gating for IDFA (MediationSDK v1.0.0 ATT manager + `BelAds.requestTrackingAuthorization()` helpers), guarantee zero IDFA when status ≠ authorized, wire SKAdNetwork participation + SKOverlay presenter per `Privacy/SKAdNetworkCoordinator.swift`, and document the SKAN 4 coarse mapping/metadata contract under `docs/Developer-Facing/SKAN_COARSE_MAPPING.md`.
  - [x] Android: latest UMP wrapper + GAID/App Set fallbacks ship via `ConsentManager`/`PrivacyIdentifierProvider`, system privacy sliders feed into `PrivacySandboxStateProvider`, and `AuctionClient` now forwards privacy sandbox + identifier metadata (GAID when LAT off, App Set fallback otherwise) to keep S2S payloads aligned with user-level toggles.
  - [x] Global: propagate COPPA/child-directed flags, CCPA US Privacy Strings, and GDPR TCF v2 strings to every network adapter consistently; unit tests assert outbound metadata per adapter (2025-12-06: `swift test` for `sdk/core/ios` + `DOTNET_ROOT=$HOME/.dotnet8 dotnet test sdk/core/unity/Tests/ApexMediation.Tests.csproj` validate canonical payloads, and `sdk/core/android/src/test/kotlin/consent/ConsentManagerTest.kt` now covers runtime consent serialization).
- [ ] Lifecycle & threading
  - [x] iOS/tvOS: guarantee main-thread UI presentation only (Scene-based apps & multi-scene), block double presentations, cancel timers/observers on background, and avoid presenter retain cycles (2025-12-06: `AdPresentationCoordinator` now gates `BelInterstitial/Rewarded/RewardedInterstitial/AppOpen` presenters, cancels scheduled timers on background, and `swift test` captures the new `AdPresentationCoordinatorTests`).
  - [x] Android/CTV: `runtime/AdPresentationCoordinator.kt` now tracks foreground Activities via `Application.ActivityLifecycleCallbacks`, blocks concurrent shows, waits for resumed Activities before invoking `BelInterstitial/Rewarded/RewardedInterstitial/AppOpen` presenters, and defers execution when the process backgrounds; `./gradlew.sh testDebugUnitTest` (2025-12-06) exercises `AdPresentationCoordinatorTest` plus the existing OM SDK facade coverage to prove exactly-once callbacks and correct context usage.
  - [ ] Unity: marshal callbacks onto the Unity main thread and prevent duplicate bridges between the iOS/Android layers and C# handlers.
- [ ] Error states & networking
  - [ ] Map no-fill/HTTP 204, timeouts, 429 rate limits (Retry-After), 5xx retries/backoff, and navigation cancellations deterministically with exponential backoff + circuit breaker guards.
  - [ ] Exercise airplane mode, captive portals, DNS failures, and Wi-Fi/Ethernet/Cell flips mid-load to prove graceful recovery.
- [ ] Caching & state
  - [ ] Validate bid/ad object expiry, show-once semantics, one-ad-at-a-time guarantees, cold vs warm cache behavior, and banner refresh timing/back-to-back load+show sequences.
- [ ] Platform-specific polish
  - [ ] tvOS: focus engine + long-press menu/back handling, single presenter at a time, responsive dismissal.
  - [ ] CTV (Android TV/Fire TV): 4K performance, safe-area/overscan compliance, and remote key-repeat spam tolerance.
- [ ] Observability
  - [ ] Ensure PII redaction in logs, expose adapter-level telemetry for auction reasons/no-bids, and keep `/ready` scoped to Postgres/Redis with alerts on replica lag and cache hit ratios.

## Appendix A — Infrastructure Setup (Provisioning from scratch)
If you are provisioning a brand‑new droplet and managed services, follow this section. If a droplet already exists, use 0.0.0 above and skip this appendix.

### A.1 Compute — Main App Droplet (DigitalOcean)
- [ ] Confirm CLI access (reuse the prerequisite step if already complete):
  ```bash
  export DIGITALOCEAN_CONTEXT=apex-prod
  doctl auth switch --context "$DIGITALOCEAN_CONTEXT"
  doctl account get
  ```
- [ ] Provision droplet `apex-core-1` (Basic Regular/Premium, 2 vCPU / 4 GB RAM / 80 GB SSD, Ubuntu 22.04+, region near FRA/AMS/NYC) directly from Bash:
  ```bash
  export DO_REGION=fra1
  export DROPLET_NAME=apex-core-1
  export DROPLET_SIZE=s-2vcpu-4gb
  export DROPLET_IMAGE=ubuntu-22-04-x64
  export SSH_KEY_ID=$(doctl compute ssh-key list --format ID --no-header | head -n 1)
  doctl compute droplet create "$DROPLET_NAME" \
    --region "$DO_REGION" \
    --image "$DROPLET_IMAGE" \
    --size "$DROPLET_SIZE" \
    --ssh-keys "$SSH_KEY_ID" \
    --tag-names apex,production \
    --vpc-uuid $(doctl vpcs list --format ID --no-header | head -n 1) \
    --wait
  export DROPLET_ID=$(doctl compute droplet list "$DROPLET_NAME" --format ID --no-header)
  export DROPLET_IP=$(doctl compute droplet list "$DROPLET_NAME" --format PublicIPv4 --no-header)
  ```
- [ ] Harden the server (non-root user, disable password SSH, key-only auth, enable UFW 22/80/443, install fail2ban, enable unattended-upgrades).
- [ ] Install Docker and docker-compose.
- [ ] Define `docker-compose.yml` with `api`, `console`, `redis`, `nginx` services; expose only Nginx on 80/443.
- [ ] Configure Nginx routing for `api.apexmediation.ee`, `console.apexmediation.ee`.

#### A.1.1 HTTPS/HSTS Verification
Follow section 0.0.0 for TLS/HSTS enablement and evidence capture; do not duplicate steps here. Protect `/metrics` via IP allowlist or Basic Auth snippet as part of Nginx HTTPS server blocks.

### A.2 Database — Managed PostgreSQL
- [ ] Create DigitalOcean Managed PostgreSQL cluster (Basic/Dev plan, same region, 10–20 GB storage) via CLI:
  ```bash
  export DB_NAME=apex-prod-db
  doctl databases create "$DB_NAME" \
    --engine pg \
    --version 15 \
    --region fra1 \
    --num-nodes 1 \
    --size db-s-1vcpu-1gb
  export DB_ID=$(doctl databases list --format ID,Name --no-header | awk '/apex-prod-db/ {print $1; exit}')
  doctl databases db create "$DB_ID" ad_platform || true
  doctl databases user create "$DB_ID" --name apex_app || true
  doctl databases user create "$DB_ID" --name apex_admin || true
  doctl databases connection "$DB_ID" --format URI --no-header
  ```
- [ ] Restrict access to droplet private IP + admin IPs and enforce SSL.
  ```bash
  export DROPLET_ID=$(doctl compute droplet list apex-core-1 --format ID --no-header)
  export ADMIN_IP=$(curl -s https://api.ipify.org)
  doctl databases firewall update "$DB_ID" \
    --rule droplet:"$DROPLET_ID" \
    --rule ip:"$ADMIN_IP/32"
  ```
- [ ] Create roles `apex_app` (limited) and `apex_admin` (migrations); store credentials in env/secrets.
- [ ] Port and run migrations (001–008+) against managed Postgres; wire CI deploy script.
- [ ] Verify schema (tables, hot-column indexes, FKs, constraints).
- [ ] Enable automated daily backups and document RPO (24h) / RTO (1–4h); test PITR restore in staging.
- [ ] Build early analytics tables (`daily_app_metrics`, `daily_network_metrics`).
- [ ] Production `DATABASE_URL` enforces TLS: append `?sslmode=require` (verify with `npm run verify:db --workspace backend`)
  ```bash
  export CONN_URI=$(doctl databases connection "$DB_ID" --format URI --no-header)
  psql "${CONN_URI}?sslmode=require" -c 'select current_timestamp;'
  ```

### A.3 Cache — Redis
- [ ] Install Redis (docker `redis:6-alpine` or apt) bound to localhost/Docker network.
- [ ] Configure 512 MB max memory, `allkeys-lru` eviction, `requirepass`, persistence (AOF/RDB).
- [ ] Validate rate limiting, idempotency, and feature flag use cases.
- [ ] Confirm Redis is not publicly reachable (external `nmap <host> -p 6379` → closed/filtered); in‑cluster AUTH works (`npm run verify:redis --workspace backend`).

### 1.4 Object Storage & Backups
- [ ] Primary: Self-hosted MinIO on the droplet (internal network only)
  - S3 endpoint: `http://minio:9000` (private bridge)
  - Bucket: `apex-prod-objects` (private)
  - Access: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` (MinIO root/user or scoped user)
- [ ] Offsite (optional): DigitalOcean Spaces replication/sync for offsite copies
  - Endpoint: `https://fra1.digitaloceanspaces.com`
  - Use `rclone`/`mc mirror` weekly to sync MinIO → Spaces (Day‑2 job)
  ```bash
  export SPACES_ENDPOINT=https://fra1.digitaloceanspaces.com
  export SPACES_BUCKET=apex-prod-offsite
  aws s3api create-bucket \
    --bucket "$SPACES_BUCKET" \
    --endpoint-url "$SPACES_ENDPOINT" \
    --acl private || true
  mc alias set do-spaces "$SPACES_ENDPOINT" "$AWS_ACCESS_KEY_ID" "$AWS_SECRET_ACCESS_KEY"
  mc mirror --overwrite minio/apex-prod-objects do-spaces/"$SPACES_BUCKET"
  ```
- [ ] Enforce signed URLs and lifecycle rules (30–90 days for intermediates) on both targets if used.
- [ ] Schedule weekly/monthly DB exports to MinIO (encrypted) and test restore path.

### 1.5 DigitalOcean Full Production Deployment Plan (End‑to‑End)

This section consolidates the end‑to‑end steps to deploy the production stack on DigitalOcean. It references detailed runbooks elsewhere in this repo and acts as a single sign‑off checklist for going live.

Pre‑flight
- [ ] DNS prepared: `api.apexmediation.ee`, `console.apexmediation.ee` (TTL 300s)
  ```bash
  doctl compute domain create apexmediation.ee || true
  # Requires apex-core-1 to be created; otherwise set DROPLET_IP manually
  export DROPLET_IP=$(doctl compute droplet list apex-core-1 --format PublicIPv4 --no-header)
  doctl compute domain records create apexmediation.ee \
    --record-type A \
    --record-name api \
    --record-data "$DROPLET_IP" \
    --record-ttl 300
  doctl compute domain records create apexmediation.ee \
    --record-type A \
    --record-name console \
    --record-data "$DROPLET_IP" \
    --record-ttl 300
  ```
- [ ] GitHub Actions deploy workflow prepared with DO secrets but kept manual-only until cutover
- [ ] Pause all non-essential GitHub Actions via CLI until go-live:
  ```bash
  gh auth status --hostname github.com
  for wf in .github/workflows/*.yml; do
    gh workflow disable "$(basename "$wf")"
  done
  ```
- [ ] Production environment variables prepared (see `infrastructure/production/.env.backend.example` and `.env.console.example`)

Build & Publish
- [ ] Build backend and console images in CI and push to container registry (GHCR or DOCR)
- [ ] Tag images with immutable version (e.g., git SHA) and “prod” channel

Provision & Harden Droplet
- [ ] Create `apex-core-1` in FRA1 (2 vCPU / 4GB / 80GB)
  ```bash
  export DO_REGION=fra1
  export DROPLET_NAME=apex-core-1
  export DROPLET_SIZE=s-2vcpu-4gb
  export DROPLET_IMAGE=ubuntu-22-04-x64
  export SSH_KEY_ID=$(doctl compute ssh-key list --format ID --no-header | head -n 1)
  doctl compute droplet create "$DROPLET_NAME" \
    --region "$DO_REGION" \
    --size "$DROPLET_SIZE" \
    --image "$DROPLET_IMAGE" \
    --ssh-keys "$SSH_KEY_ID" \
    --tag-names apex,production \
    --wait
  ```
- [ ] Create non-root `deploy` user; harden SSH (key-only); enable UFW (22/80/443)
- [ ] Install Docker + docker compose; clone repo to `/opt/apex`

Environment Materialization
- [ ] Materialize `.env` files on droplet (backend/console) without committing secrets
- [ ] Set `DATABASE_URL` for DO Managed Postgres with `?sslmode=require`
- [ ] Set `REDIS_URL` to private bridge host with password (no public exposure)

Start Stack (HTTP only initially)
- [ ] `docker compose -f infrastructure/docker-compose.prod.yml up -d`
- [ ] Verify `GET http://<droplet-ip>/health` via port 80 → 200 OK proxied to backend

Enable HTTPS & Gate HSTS
- [ ] Issue certs with certbot for API/Console on droplet; mount `/etc/letsencrypt`
- [ ] Mount `infrastructure/nginx/apexmediation.ssl.conf` and expose `443` in compose
- [ ] Reload Nginx; verify HTTP→HTTPS redirects and HTTPS headers using `scripts/ops/do_tls_snapshot.sh`
- [ ] Keep HSTS commented until SSL Labs grade A/A+; then enable and verify

Data Plane Verification
- [ ] Database TLS: run `npm run verify:db --workspace backend` and then migrations
- [ ] Redis isolation: `npm run verify:redis --workspace backend` and external `nmap` on `6379` (expect closed/filtered)
- [ ] Protect `/metrics` (Basic Auth or IP allowlist) and capture 401/403 proof

Evidence & Changelog
- [ ] Store evidence under `docs/Internal/Deployment/do-readiness-YYYY-MM-DD/`
- [ ] Add top entry to `CHANGELOG.md` linking the evidence and summarizing verification
- [ ] Keep GitHub Actions paused until go-live approval, then re-enable targeted workflows only:
  ```bash
  gh workflow list --all
  gh workflow enable deploy-production.yml
  ```

Rollback Preparedness
- [ ] Define 5‑minute TTL DNS rollback to previous infra
- [ ] Document clear rollback triggers (latency/error rate/downtime) and operator steps

References
- `docs/Internal/Infrastructure/DO_READINESS_CHECKLIST.md`
- `scripts/ops/do_tls_snapshot.sh`, `scripts/ops/local_health_snapshot.sh`
- `infrastructure/docker-compose.prod.yml`, `infrastructure/nginx/*`

## Final Sign‑off (Go‑Live Gate)
- [ ] HTTPS validated with SSL Labs grade A/A+; HSTS enabled and verified
- [ ] `DATABASE_URL` enforces TLS (`?sslmode=require`) and migrations applied successfully
- [ ] Redis not publicly reachable (external nmap shows 6379 closed/filtered); in-cluster AUTH verified
- [ ] `/metrics` protected (401 Basic or 403 IP allowlist) from public Internet
- [ ] Evidence bundle stored under `docs/Internal/Deployment/do-readiness-YYYY-MM-DD/` and referenced in `CHANGELOG.md`
- [ ] CI “policy guard” green: provider content guard and infra plan tests pass (`npm run test:infra`)

### 1.6 Budget Check
- [ ] Confirm monthly infra spend (droplet ~$24 + Postgres ~$15 + storage ~$5 + misc $3–5 ≤ $50 target).

## 2. Monitoring & Observability
### 2.1 Host & App Monitoring
- [ ] Materialize .env file for monitoring
- [ ] Enable DigitalOcean Monitoring for `apex-core-1` (CPU/RAM/Disk/Network).
  ```bash
  export DROPLET_ID=$(doctl compute droplet list apex-core-1 --format ID --no-header)
  doctl monitoring alert create \
    --type droplet_cpu \
    --description "Apex CPU > 80%" \
    --comparison GreaterThan \
    --value 80 \
    --window 5m \
    --enabled true \
    --entities "$DROPLET_ID" \
    --emails security@apexmediation.ee
  doctl monitoring alert create \
    --type droplet_memory \
    --description "Apex RAM > 80%" \
    --comparison GreaterThan \
    --value 80 \
    --window 5m \
    --enabled true \
    --entities "$DROPLET_ID" \
    --emails security@apexmediation.ee
  ```
- [ ] Configure alerts (CPU>80%, Memory>80%, Disk>80%, droplet unreachable).

### 2.1b Grafana Stack
- [ ] Deploy Prometheus + Grafana via Docker with 7–30 day retention.
- [ ] Scrape node exporter + app `/metrics`; lock Grafana behind auth/IP restriction.

### 2.2 Application Logging
- [ ] Standardize JSON logs (timestamp, level, service, request_id, user_id, app_id, path, latency_ms, error_code).
- [ ] Stream to file + DO console; configure logrotate; plan Loki if volume grows.

### 2.3 Error Tracking
- [ ] Create Sentry account and integrate backend + console.
- [ ] Configure release/environment tags, PII sanitization, and Firebase Crashlytics for SDKs.
- [ ] Trigger test errors to verify alerts.

### 2.4 Status Page
- [ ] Set up Upptime/UptimeRobot/Better Stack to monitor `https://api.apexmediation.ee/health` and `https://console.apexmediation.ee/`.
- [ ] Publish status page at `status.apexmediation.ee`; simulate outage for validation.

### 2.5 Alerting
- [ ] Choose PagerDuty/Better Stack/email/SMS.
- [ ] Define critical vs warning alerts and solo-founder escalation policy.
- [ ] Trigger test alert and confirm delivery.

## SDK Release Management & Platform Support
### Governance & Versioning
- [ ] Adopt semantic versioning for all SDKs (Android, iOS, Unity, tvOS/CTV) with per-SDK `CHANGELOG` and upgrade notes.
- [ ] Publish a Compatibility Matrix (SDK ↔ API version ↔ Console minimum) in docs.
- [ ] Maintain adapter coverage tables: every SDK release must include adapters (or bridges) for each in-market network API/SDK with version pins and release notes when parity slips.

### Release Pipeline & Smoke Tests
- [ ] Android: CI runs unit tests and interop smoke (see `sdk/core/android/`).
  - Example: `./gradlew :sdk:core:android:testDebugUnitTest`
  - Repo tests: `sdk/core/android/src/test/java/com/rivalapexmediation/sdk/JavaInteropSmoke.java`, `sdk/core/android/src/test/kotlin/com/rivalapexmediation/sdk/telemetry/TelemetryCollectorTest.kt`
- [ ] iOS: CI job builds library and runs unit/UI smoke (add workflow when ready).
- [ ] Unity: Verify Android/iOS exports build and callbacks fire once; attach minimal sample scene.
- [ ] tvOS/CTV: Build verification for Apple TV/Android TV sample apps.
- [ ] Tag releases and attach sample binaries where applicable.
- [ ] CI smoke suites must validate every adapter invokes the corresponding network SDK/API, captures auction logs (win/lose reasons, clearing prices), and emits hashed commitments for transparency export.

### Samples & Integration Guides
- [ ] Provide sample apps for Android, iOS, Unity, and CTV (staging endpoints pre-wired).
- [ ] Ship Quick Start per platform with consent toggles and placement wiring examples.
- [ ] Ensure API Keys/placement IDs can be created via Console and propagate to SDK configs.

### QA Evidence (SDKs)
- [ ] Record initialize→load→show flows (video/gifs) for each platform.
- [ ] Store under `docs/Internal/QA/sdks-YYYY-MM-DD/<platform>/` with logs and configs.

## Customer Support, SLAs & Onboarding
### Support Channels
- [ ] Establish support@ mailbox and autoresponder; document response-time policy.
- [ ] Optional: Discord/Forum channel for developers; moderation guidelines in place.

### SLAs & Status Communications
- [ ] Publish SLA targets and maintenance window policy (link status page from Section 2.4).
- [ ] Prepare incident communication templates (degradation, outage, postmortem).

### Onboarding & Integration
- [ ] Create “Hello World” integration guides per SDK (copy-paste snippets, consent notes).
- [ ] Provide sample placements and test credentials in staging; Console onboarding checklist (org → app → placements → API keys → first ad).

### Evidence
- [ ] Store onboarding screenshots and first-ad proof under `docs/Internal/QA/onboarding-YYYY-MM-DD/`.

## Security Readiness & Audits
### Policies & Scans
- [ ] Enable dependency vulnerability scanning (Dependabot/Snyk) and SAST (ESLint security rules; optional CodeQL).
- [ ] Plan a lightweight external pentest before GA; track findings to closure.

### Secrets & Access
- [ ] Review secrets storage (KeePassXC/`pass` or DO App Secrets) and least-privilege access to droplet/DB.
- [ ] Rotate Stripe/Resend keys and DB/Redis passwords before GA; document cadence.

### Data Protection
- [ ] Verify PII handling in logs/errors; ensure redaction in `/metrics` and Sentry.
- [ ] Confirm backups encryption and test restore drill from Spaces (plus any secondary offsite mirror).

### Evidence
- [ ] Save scan reports and pentest summary under `docs/Internal/QA/security-YYYY-MM-DD/`.

## Legal & Compliance (Product)
### GDPR & DPIA
- [ ] Complete DPIA for core data flows (publishers, end-users where applicable).
- [ ] Data Processing Addendum (DPA) template ready; countersign for customers on request.

### Public Policies
- [ ] Publish Privacy Policy, Terms of Service, and Cookie Policy on the website.
- [ ] Maintain Subprocessor list and data retention schedule aligned with Section 8.3.

### Evidence
- [ ] Snapshot published pages (PDF) and store under `docs/Internal/QA/legal-YYYY-MM-DD/`.

## Website & Console UX Readiness
### Website
- [ ] Run capture scripts and store artifacts:
  - `npm run capture:website` → `docs/Internal/QA/website-YYYY-MM-DD/`
- [ ] Verify `/`, `/pricing`, `/docs`, `/legal/*` parity with backend billing policy.

### Console
- [ ] Run `npm run capture:console` after staging deploy; verify critical flows and screenshots.

## Operational Reporting & SLOs
### SLOs and Error Budgets
- [ ] Define availability and latency SLOs for API/Console; set error budgets.
- [ ] Create monthly ops report template (uptime, incidents, costs, customer growth).

### Evidence
- [ ] Store first monthly report under `docs/Internal/QA/ops-report-YYYY-MM/`.

## Final Sign‑off — Additional Go‑To‑Market Gates
- [ ] SDKs: latest release tags + smoke tests green; Compatibility Matrix published
- [ ] Customer Support: channels live, SLA published, incident comms templates ready
- [ ] Security: scans clean or exceptions documented; secrets rotated pre‑GA
- [ ] Legal: Privacy, Terms, Cookie Policy, Subprocessors published; DPA template ready
- [ ] Sales: pricing live, demo org ready, CRM funnel connected; basic collateral published

## 3. Payment & Billing Consumers
- [ ] `/api/v1/billing/policy` serves canonical snapshot (`backend/src/config/billingPolicy.ts`).
- [ ] Cache-bust instructions documented for console/docs.
- [ ] Stripe+Wise fallback wording in API matches docs and console banners.
- [ ] `policy.version` + `updatedAt` aligns with `stripe-mandatory-2025-11` + rollout table.
- [ ] Console `/billing/settings` renders Starter/autopay messaging from snapshot (test coverage).
- [ ] Website pricing page + docs mirror Starter cap + autopay rails copy (ref 2025-11-24 commits).

## 4. Stripe Enablement (`docs/Internal/Deployment/STRIPE_COLLECTION_RUNBOOK.md`)
- [ ] Create Stripe account and complete KYC.
- [ ] Configure Estonian VAT profile.
- [ ] Create BYO tier products (Starter free SKU, Growth 2.5%, Scale 2.0%, Enterprise custom 1.0–1.5%+ minimum).
- [ ] Enable metered billing on `mediated_revenue_usd`.
- [ ] Configure webhooks (`invoice.payment_failed`, `invoice.payment_succeeded`).
- [ ] Enable Customer Portal.
- [ ] Test payment flow in test mode; enable live mode.
- [x] Verify default SEPA instructions (Wise Europe SA IBAN + reference block) — 2025-11-24.
- [x] Verify default ACH instructions (Wise US / Community Federal Savings Bank) — 2025-11-24.
- [x] (Optional) Enable SEB account for local rails — documented 2025-11-24.
- [x] Document secondary rails (Wise link, Stripe card, PayPal) in pricing/docs — 2025-11-24.
- [x] Review billing artifacts (pricing, invoicing guide, FAQ) for NET 30 + Wise defaults — 2025-11-24.

## 5. Starter → Autopay Enforcement QA
- [ ] Enforce Starter cap in backend (no payment method until $10k/app/month; upgrade flips `requires_payment_method`).
- [ ] Surface autopay rails (card/ACH/SEPA) via `autopayEligible`; document Enterprise manual exceptions.
- [ ] Console `/billing/settings` shows Starter vs paid copy plus autopay info card.
- [ ] Website signup + docs FAQ reiterate Starter promise with matching wording (reference rollout commit).
- [x] Billing notifications templated to match `billingPolicy.billingCycle.notifications` (Resend preview + receipts, 2025-11-24).
- [ ] QA evidence captured in `docs/Internal/QA/billing-policy/` and linked from `docs/Internal/Deployment/BILLING_POLICY_ROLLOUT.md` (screens, policy JSON, console UI).
- [x] Website pricing + signup screenshots reflect Starter free cap + autopay rails (capture complete 2025-11-24).
- [ ] Run staging/local capture session (pricing grid + signup policy callout) and drop assets into `docs/Internal/QA/billing-policy/`.

## 6. Invoice → Payment Dry-Run
- [ ] Generate Stripe test customer + usage (Runbook §5).
- [ ] Finalize invoice in test mode; confirm webhook marks local status paid.
- [ ] Download PDF/email verifying Wise SEPA + ACH wiring blocks.
- [ ] Store evidence under `docs/Internal/QA/stripe-dry-run/`.
- [ ] Repeat scenario in live mode with €0 invoice once Stripe live.

## 7. Email (Resend.com)
- [ ] Create Resend account (free 3K emails/mo).
- [ ] Verify `apexmediation.ee` domain.
- [ ] Configure SPF/DKIM/DMARC.
- [ ] Test welcome/trial/payment/usage emails.
- [ ] Monitor deliverability >98%.

## 8. Estonian Compliance
### 8.1 E-Tax Board (e-MTA)
- [ ] Register with Estonian Tax and Customs Board; obtain credentials.
- [ ] Define quarterly VAT export workflow (Stripe/DB → e-MTA) and test submission.
- [ ] Schedule reminders 1 week before deadlines.

### 8.2 E-Business Register
- [ ] Register Bel Consulting OÜ (if missing).
- [ ] Document annual report workflow via accounting export; test report generation.
- [ ] Schedule April 30 submission reminder.

### 8.3 Document Retention
- [ ] Configure Spaces retention (7-year invoice/doc policy) or an equivalent S3-compatible mirror.
- [ ] Test upload/retrieval and verify no accidental deletions.

## 9. Sales Automation
### 9.1 Cron Jobs
- [ ] Run cron service within docker-compose/system cron on `apex-core-1`.
- [ ] Verify schedule (minute email queue, hourly usage checks, daily 2 AM Stripe sync, daily 3 AM dunning retries, daily 9 AM trial reminders, monthly 1st usage summaries).
- [ ] Monitor cron execution (logs/errors/duration) and alert on failures.

### 9.2 Email Templates
- [ ] Review 10+ email templates (design/copy/CTAs) end-to-end.
- [ ] Test with real email addresses; confirm links and mobile responsiveness.
- [ ] Plan A/B tests for >100 customers.

### 9.3 Database Migrations
- [ ] Run `008_sales_automation.sql`.
- [ ] Verify tables (`usage_records`, `usage_alerts`, `dunning_attempts`, `events`, `email_log`).
- [ ] Confirm indexes + query performance (aggregation, dunning status, email dedupe).

## 10. SDK Release Automation
### 10.1 GitHub Actions
- [ ] Verify workflows (`sdk-release.yml`, `compatibility-testing.yml`, `docs-deployment.yml`).
- [ ] Configure secrets (COCOAPODS_TRUNK_TOKEN, OSSRH creds + GPG key, NPM_TOKEN, Cloudflare tokens, DATABASE_URL, RESEND_API_KEY).
- [ ] Run pre-release tag `v0.1.0-beta.1` to exercise build→test→publish→notify→docs.

### 10.2 Package Managers
- [ ] CocoaPods: register with trunk, add co-maintainers, run `pod trunk push ApexMediation.podspec --allow-warnings`.
- [ ] Maven Central: register with Sonatype OSSRH, create GPG key, configure `gradle.properties`, run `./gradlew publishToMavenCentral` test.
- [ ] NPM (Unity): create account, generate access token, run `npm publish --access public` dry run.

### 10.3 Documentation Deployment
- [ ] Create Cloudflare Pages project `apexmediation-docs` and custom domain `docs.apexmediation.ee`.
- [ ] Validate TypeDoc/Jazzy/Dokka/JSDoc generation and version switcher.
- [ ] Configure Algolia DocSearch (optional).

## 11. Security
### 11.1 Secrets Management
- [ ] Choose secrets manager (Infisical self-hosted recommended, or DO App Secrets). Operator vault: KeePassXC or `pass`.
- [ ] Migrate `.env` secrets; enforce least privilege policies.
- [ ] Establish rotation policy (quarterly Stripe keys, JWT secrets) and test container injection.

### 11.2 SSL/TLS
- [ ] Verify HTTPS on `api`, `console`, `docs`, `status`.
- [ ] Confirm TLS 1.3, SSL Labs A+ score, and HSTS headers.

### 11.3 Dependency Scanning
- [ ] Enable Dependabot.
- [ ] Run `npm audit` in CI/CD.
- [ ] Run Trivy scans on Docker images.

### 11.4 Penetration Testing (Optional)
- [ ] Schedule pentest/BugCrowd engagement once revenue justifies.
- [ ] Remediate critical/high findings and re-test; document outcomes.

## 12. Customer Onboarding
### 12.1 Console
- [ ] Deploy console frontend (Cloudflare Pages or DO Nginx) with custom domain.
- [ ] Test signup (email verification, password, company name).
- [ ] Test login + JWT refresh flow.
- [ ] Verify dashboard (usage charts, API keys, billing, invoices).
- [ ] Test API key generation/revocation and mobile responsiveness.

### 12.2 Documentation
- [ ] Review iOS/Android/Unity guides for accuracy.
- [ ] Test code snippets in Xcode, Android Studio, Unity.
- [ ] Verify links (no 404s), SEO basics (meta tags, sitemap, robots), and submit to Algolia DocSearch if used.
- [x] Pricing + invoicing docs updated to BYO tier language — 2025-11-24.

### 12.3 Support Channels
- [ ] Create Discord server (`discord.gg/apexmediation`).
- [ ] Configure channels (#general, #support, #sdk-help, #announcements).
- [ ] Enable GitHub Discussions.
- [ ] Configure `support@apexmediation.ee` inbox.
- [ ] Publish FAQ and train AI support bot (GPT-4o-mini) with FAQ context.

## 13. Marketing & Launch
### 13.1 Website
- [ ] Deploy landing page to Cloudflare Pages (`apexmediation.ee`).
- [ ] Ensure content covers hero (OTA-proof, transparent bidding, NET30), feature comparison (Unity vs ApexMediation), pricing (Starter 0%, Growth 2.5%, Scale 2.0%, Enterprise 1.0–1.5%+), testimonials, integration previews, CTAs.
- [x] BYO pricing copy verified across marketing + docs — 2025-11-24 audit.
- [ ] Perform SEO optimization (keywords, analytics/Plausible/Umami).

### 13.2 Launch Announcement
- [ ] Draft "Introducing ApexMediation" blog post.
- [ ] Schedule posts for Reddit, Hacker News (Show HN), Product Hunt, Twitter/X, LinkedIn, Indie Hackers, influencer outreach, AlternativeTo/Slant/G2.

### 13.3 Email Marketing
- [ ] (Optional) Deploy Listmonk or CSV workflow.
- [ ] Build mailing list and import landing page signups.
- [ ] Draft welcome sequence (welcome, integration guide, best practices, case study, referral program).

## 14. Legal & Insurance
### 14.1 Terms & Privacy
- [ ] Draft Terms of Service, Privacy Policy (GDPR), Data Processing Agreement.
- [ ] (Optional) Legal review (~$1–2k).
- [ ] Publish on website with acceptance tracking and cookie consent banner.

### 14.2 Insurance (Optional)
- [ ] Evaluate cyber liability coverage (~$1–2k/yr).
- [ ] Consider general liability once relevant.

## 15. Launch Day Checklist (Day 0)
### Pre-Launch (T-1 Day)
- [ ] Final smoke tests (all systems green).
- [ ] Verify database backups.
- [ ] Document rollback plan.
- [ ] Ensure PagerDuty/alerting configured.
- [ ] Sleep well.

### Launch Sequence (10:00–11:00 UTC)
- [ ] 10:00 Enable live mode (Stripe + services).
- [ ] 10:05 Deploy production build.
- [ ] 10:10 Verify health checks.
- [ ] 10:15 Test E2E flow (signup → API key → usage tracking).
- [ ] 10:30 Publish launch announcements.
- [ ] 10:45 Monitor logs/metrics (errors, latency, signups).
- [ ] 11:00 Celebrate first signup.

### Post-Launch (T+1 hour)
- [ ] Monitor errors/perf for 1 hour.
- [ ] Respond to support (Discord, email).
- [ ] Track signups/conversions.
- [ ] Celebrate. 🍾

### Week 1 Goals
- [ ] Achieve 10–50 signups.
- [ ] Land 5–10 active customers (completed onboarding + API calls).
- [ ] Maintain zero critical bugs, <1% error rate, 99.95% uptime, <5 hours manual support.

## 16. Tools & Access
### 16.1 Required Accounts
- [ ] DigitalOcean (droplet/Postgres/Spaces).
  - CLI: `doctl auth switch --context apex-prod && doctl account get`
- [ ] Stripe.
- [ ] Resend.com.
- [ ] Sentry.
- [ ] UptimeRobot/Better Stack or GitHub Upptime.
- [ ] PagerDuty (optional).
- [ ] GitHub.
- [ ] CocoaPods (iOS), Sonatype OSSRH (Android), NPM (Unity).

### 16.2 Required Credentials
- [ ] `DATABASE_URL` (Managed Postgres, SSL enforced).
- [ ] `REDIS_URL` (`redis://:password@127.0.0.1:6379/0`).
- [ ] Object storage (S3-compatible): `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `S3_ENDPOINT`, `S3_BUCKET`.
- [ ] `STRIPE_SECRET_KEY`.
- [ ] `RESEND_API_KEY`.
- [ ] `SENTRY_DSN`.
- [ ] `STATUS_PAGE_TOKEN` (if applicable).
- [ ] `PAGERDUTY_API_KEY` (if applicable).
- [ ] `COCOAPODS_TRUNK_TOKEN`, `OSSRH_USERNAME`, `OSSRH_PASSWORD`, `NPM_TOKEN`.
- [ ] `JWT_SECRET`, `ENCRYPTION_KEY`.

## 2. Day‑2 Operations (Long‑Term Running)

This section operationalizes long‑term running of the platform: CI/CD, scheduled jobs (accounting/billing), backups, monitoring/alerting, security hygiene, capacity/cost controls, and clear operator routines. Treat it as your primary ops playbook post‑launch.

### 2.1 CI/CD & Release Management
- [ ] Versioning policy: tag releases with `vYYYY.MM.DD-<sha>` and annotate in `CHANGELOG.md`.
- [ ] CI required checks: keep `ci-all` jobs required on PRs; deploy workflow stays manual until you explicitly flip it.
- [ ] Release gates:
    - [ ] Infra tests green: `npm run test:infra`
    - [ ] Backend/unit suites green: `npm run test --workspace backend`
    - [ ] Console build succeeds with `NEXT_PUBLIC_API_URL` pinned
- [ ] Deploy to DO (manual): run `.github/workflows/deploy-do.yml` with `workflow_dispatch` after checks.
- [ ] Rollback plan: previous GHCR image tags available; rerun deploy with prior tag or `docker compose up -d` on droplet to revert.

### 2.2 Scheduled Jobs (Cron/Queues) — Accounting, Billing, Sync
Define time windows when traffic is low (FRA1 02:00–05:00 local) and prefer UTC in cron.

- [ ] Usage aggregation (daily): computes app/network usage for tiers and invoices
    - Runner: backend job/queue or cron container
    - Verify: inspect logs for completion markers; metrics exported under `/metrics` RED histograms
- [ ] Stripe sync (hourly + daily catch‑up): reconciles invoices, payments, dunning
    - Verify: `npm run verify:db --workspace backend` for DB connectivity; confirm Stripe test mode on staging
- [ ] Email queue drain (every 5 min): ensures transactional emails go out (Resend)
- [ ] Data hygiene (nightly/weekly): purge temp rows, rotate API key usage logs if needed
- [ ] Evidence hooks (optional): append summaries to `logs/cron/*.log` and surface counters in `/metrics`

Example crontab (on droplet, using rootless container exec):
```
# /etc/cron.d/apex
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

# Nightly 02:15 — usage aggregation
15 2 * * * root docker compose -f /opt/apex/infrastructure/docker-compose.prod.yml exec -T backend node dist/scripts/aggregateUsage.js >> /var/log/apex/cron-usage.log 2>&1

# Hourly — Stripe sync
5 * * * * root docker compose -f /opt/apex/infrastructure/docker-compose.prod.yml exec -T backend node dist/scripts/stripeSync.js >> /var/log/apex/cron-stripe.log 2>&1

# Every 5 min — email queue
*/5 * * * * root docker compose -f /opt/apex/infrastructure/docker-compose.prod.yml exec -T backend node dist/scripts/drainEmailQueue.js >> /var/log/apex/cron-email.log 2>&1
```

Notes:
- Prefer queue‑based scheduling inside backend where feasible; use host cron only as a thin trigger.
- Ensure Redis is healthy before queue work; see `npm run verify:redis --workspace backend`.

### 2.3 Backups & Retention (DB → Spaces + Offsite Mirror)
- [ ] Nightly logical backup of Postgres via `pg_dump` to S3‑compatible storage
    - Script template: `scripts/backup/pg_dump_s3_template.sh`
    - Configure: `S3_ENDPOINT`, `S3_BUCKET`, `S3_PREFIX`, lifecycle retention (30–90 days)
- [ ] Weekly restore drill to staging DB
    - Procedure: restore latest dump to temp instance; run smoke queries; record duration (RTO)
- [ ] Evidence: store `backup-YYYY-MM-DD.log` and restore notes under `docs/Internal/Deployment/backups-YYYY-MM/`

Sample run:
```
export PGHOST=<do-pg-host> PGPORT=25060 PGDATABASE=ad_platform PGUSER=apex_admin PGPASSWORD=<admin-pass>
export AWS_ACCESS_KEY_ID=<spaces-key> AWS_SECRET_ACCESS_KEY=<spaces-secret>
export AWS_DEFAULT_REGION=eu-central-1 S3_ENDPOINT=https://fra1.digitaloceanspaces.com
export S3_BUCKET=s3://apex-prod-backups S3_PREFIX=pg/ BACKUP_LABEL=prod
bash scripts/backup/pg_dump_s3_template.sh
```

### 2.4 Monitoring, Metrics, and Alerting
- [ ] Enable DO Monitoring alerts: CPU/RAM>80% (5m), disk>80%, droplet unreachable
  ```bash
  doctl monitoring alert list --format ID,Type,Description,Enabled
  # Update individual alerts if thresholds need tuning
  doctl monitoring alert update <alert-id> --value 80 --enabled true
  ```
- [ ] Export Prometheus metrics from backend (`/metrics`); protect via Basic Auth or IP allowlist
- [ ] Define SLOs (initial):
    - API availability 99.9%/30d; p95 < 200ms; error rate < 0.5%
- [ ] Alert policies:
    - p95 latency > 400ms for 10m
    - error rate > 1% for 5m
    - queue length growing 15m
- [ ] Error tracking: Sentry DSN configured for backend/console; scrub PII
- [ ] Optional: Upptime for external status page on `status.apexmediation.ee`

### 2.5 Incident Response & Runbooks
- [ ] Common failures & fixes
    - Backend crashloop: `docker compose ... logs backend | tail -n 200`; check env validation; rollback image
    - Redis unavailable: confirm container health; if down, restart; investigate AOF
    - Database connection errors: confirm `?sslmode=require`; check DO PG status page; failover procedure
- [ ] Nginx 502/504: `docker compose exec nginx nginx -t && nginx -s reload`; review upstream health
- [ ] Evidence capture during incident: run `scripts/ops/do_tls_snapshot.sh` and save outputs with timestamps
- [ ] Postmortem template: cause, timeline, impact, remediation, follow‑ups

### 2.6 Security Operations
- [ ] Secrets rotation schedule (quarterly): Stripe, Resend, JWT/COOKIE secrets; update env; restart stack
- [ ] Access review (quarterly): GitHub, DO, Sentry; least privilege; remove ex‑contributors
- [ ] Patch policy: apply Ubuntu security updates weekly (unattended‑upgrades) and container base updates monthly
- [ ] TLS hygiene: certbot auto‑renew configured; HSTS locked; re‑run TLS snapshot quarterly
- [ ] Content guard: CI `policy-guard` job must remain green; forbidden providers blocked by tests

### 2.7 Capacity & Cost Management
- [ ] Observe CPU/RAM/disk trends monthly; scale droplet if p95 CPU > 70% or memory pressure sustained
- [ ] Database: monitor connections, slow queries; add indices as needed; consider plan upgrade when CPU saturates
- [ ] Storage: track Spaces/offsite usage; enforce lifecycle rules; review backup sizes
- [ ] Network egress: review DO bills; enable gzip in Nginx (already set) and cache headers where safe

### 2.8 Operator Routines (Checklist)
- Daily
    - [ ] Scan alerts and Sentry; zero criticals
    - [ ] Spot‑check `/health` and `/metrics`
- Weekly
    - [ ] Review cron logs (`/var/log/apex/*`); confirm jobs succeeded
    - [ ] Run `npm run test:infra` on main; check drift
- Monthly
    - [ ] Restore drill to staging; document RTO/RPO
    - [ ] Re‑capture TLS snapshot and verify HSTS present
    - [ ] Review costs and capacity; adjust limits
