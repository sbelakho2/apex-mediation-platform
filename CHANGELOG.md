Changelog — FIX-01 Backend & Core Platform Hardening (2025-11-15)

Summary
- This changelog documents all material changes completed under FIX-01 to get the system ready for sandboxing. It includes operational notes and how to run DB‑backed tests locally.

Key changes
- Backend container healthcheck restored and verified
  - backend/Dockerfile: Alpine image now installs curl and uses a HEALTHCHECK against http://localhost:8080/health. Ports aligned to 8080.

- docker‑compose hygiene and local parity improvements
  - docker-compose.yml: Parameterized environment via ${VAR:-default}, added persistent volume for ClickHouse, and ensured backend/console/website share a network. Added service profiles (dev, full).

- Backend env template cleanup and alignment
  - backend/.env.example: PORT=8080; transparency defaults safe for local; cookie/cors examples; feature flags documented and defaulted off for local.

- Safer Prometheus metrics throughout hot paths
  - New helper: backend/src/utils/metrics.ts provides safeInc/safeObserve to prevent metrics errors from causing 500s.
  - Adopted in critical locations: auth.controller (login flow), twofa.controller, trackingRateLimiter middleware, RTB orchestrator and mock adapters (AdMob, AppLovin, Unity), analytics ingest queue processor.

- CSRF, feature flags, and kill switch robustness
  - CSRF middleware uses typed cookie options and exempts POST /api/v1/auth/(login|register|refresh) and POST /api/v1/flags* so ops can toggle flags without CSRF issues.
  - Kill switch guard matches req.originalUrl and allowlists /health, /metrics, /api/v1/flags, /openapi.json, and /docs to permit recovery and docs.

- Auth and request context safety
  - Auth middleware reads JWT from Authorization or secure cookie via typed access; authorize uses typed role with sensible default.
  - Request context middleware avoids any, propagates requestId/user/tenant safely for correlation logging.

- Test harness stability and modes (lightweight vs DB‑backed)
  - Jest Postgres mock now exports initializeDatabase; Jest config ignores dist/ to avoid duplicate manual mocks.
  - Default tests run in lightweight mode (no DB) for CI speed.
  - DB‑backed tests are opt‑in via environment flags.

- Log files for fixes: error.log, combined.log


- Scripts for clear test lanes
  - backend/package.json:
    - test:fast → jest (no DB)
    - test:db → FORCE_DB_SETUP=true RUN_MIGRATIONS_IN_TEST=true jest --runInBand
    - test:db:docker → Starts Postgres via docker compose and then runs test:db
    - test:db:down → Tears down compose services

- Queue naming guidance
  - backend/BACKGROUND_JOBS.md: Added a section recommending against colon (:) in BullMQ queue names; provided migration notes.

- Deploy script safety
  - backend/deploy-backend.sh: Avoids mutating fly.toml unless ALLOW_TOML_MUTATION=true; prints clear guidance and checks for Fly CLI auth.

How to run DB‑backed tests locally
1) Ensure Docker is running.
2) From the backend workspace directory:
   - npm run test:db:docker
     - This will:
       - Bring up Postgres from the repo’s docker-compose.yml
       - Run Jest with FORCE_DB_SETUP=true and RUN_MIGRATIONS_IN_TEST=true to initialize the DB and execute migrations
  3) After the run, to clean up containers:
     - npm run test:db:down

Environment variables used by the test harness
- FORCE_DB_SETUP=true → Enables real Postgres pool initialization for tests.
- RUN_MIGRATIONS_IN_TEST=true → Runs migrations before tests (requires local Postgres).

Operational notes for sandbox readiness
- Runtime PORT is 8080 across compose and Dockerfile; ensure fly.toml and any load balancers expect port 8080 for the container.
- Feature flags (kill switches, enforcement) are documented in readiness docs and default to safe values locally. Toggle per environment as required.

Lint/test status at submission time
- Backend builds successfully.
- Lint: 0 ESLint errors in backend source (tests are relaxed by overrides; warnings permitted).
- Tests: Fast lane fully green — 37/37 suites, 319 tests. DB‑backed tests are documented (require local Postgres); scripts provided above.


Additional updates — 2025-11-15 11:10
- Eliminated metrics-induced 500s across auth/2FA/RTB/tracking paths using safeInc/safeObserve and localized try/catch guards.
- Hardened CSRF and feature-flag flows: POST /api/v1/flags is CSRF‑exempt to allow ops toggles during incidents.
- Kill switch allowlist expanded (/health, /metrics, /api/v1/flags, /openapi.json, /docs) and guard now uses req.originalUrl for accuracy.
- Auth and context safety improved: cookie‑based token extraction typed; role defaulting in authorize; requestId/user/tenant propagated via AsyncLocalStorage.
- Jest stability: manual postgres mock exports initializeDatabase; dist/ excluded to avoid duplicate __mocks__.
- OpenAPI helper types tightened to Record<string, unknown> and Swagger UI mounted at /docs with /openapi.json served.
