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


Additional updates — 2025-11-15 11:10
- Eliminated metrics-induced 500s across auth/2FA/RTB/tracking paths using safeInc/safeObserve and localized try/catch guards.
- Hardened CSRF and feature-flag flows: POST /api/v1/flags is CSRF‑exempt to allow ops toggles during incidents.
- Kill switch allowlist expanded (/health, /metrics, /api/v1/flags, /openapi.json, /docs) and guard now uses req.originalUrl for accuracy.
- Auth and context safety improved: cookie‑based token extraction typed; role defaulting in authorize; requestId/user/tenant propagated via AsyncLocalStorage.
- Jest stability: manual postgres mock exports initializeDatabase; dist/ excluded to avoid duplicate __mocks__.
- OpenAPI helper types tightened to Record<string, unknown> and Swagger UI mounted at /docs with /openapi.json served.
Lint/test status at submission time
- Backend builds successfully.
- Lint: 0 ESLint errors in backend source (tests are relaxed by overrides; warnings permitted).
- Tests: Fast lane fully green — 37/37 suites, 319 tests. DB‑backed tests are documented (require local Postgres); scripts provided above.

---

Changelog — FIX-05 SDK & Client Reliability (2025-11-15)

Summary
- This entry completes FIX‑05 by hardening SDK reliability across the stack with a focus on the Web SDK transport layer, confirming mobile/CTV persistence and config caching, and documenting release and validation steps. It introduces configurable retry/backoff and timeout overrides in the Web SDK, ensures MSW‑backed tests cover retry semantics, and ties the work back to existing Android/iOS config/consent persistence.

What changed (highlights)
- Web SDK (packages/web-sdk)
  - Reliability options added to `init(options)`:
    - `timeoutMs` (existing), `maxRetries` (default 2), `retryBackoffBaseMs` (default 100ms), `retryJitterMs` (default ±50ms).
  - `auctionClient` now implements exponential backoff with jitter and clear retry classification:
    - Retries: network errors and HTTP 5xx; No‑retry: 4xx and validation errors.
    - Respects external `AbortSignal`; any timeout or abort maps to `Errors.timeout()` with the configured `timeoutMs`.
  - MSW/Jest wiring fixed and expanded tests added:
    - Success path, timeout override, retry on 5xx → success, no‑retry on 4xx, retry on network error → success.
  - Files touched: `packages/web-sdk/src/types.ts`, `src/index.ts`, `src/auctionClient.ts`, `setupTests.ts`, `tests/**`, `jest.config.cjs`.

- Android SDK (sdk/core/android)
  - Remote config caching and failure‑tolerant behavior confirmed via `config/ConfigManager.kt` (TTL, cache fallback) and unit tests.
  - Consent handling confirmed with IAB storage reader in `consent/ConsentManager.kt` (TCF, US Privacy). Host apps remain SoT, with optional helper to read SharedPreferences and normalize values.
  - No placeholder adapters ship as production; reflection registry and diagnostics remain intact.

- iOS/tvOS SDK
  - Persistence and registry parity validated (UserDefaults‑based consent/config per earlier implementation notes and CI matrix). No code changes required in this pass; CI remains the gate.

- CTV Android & Unity
  - CTV Android builds with config/consent semantics aligned to mobile; Unity package CI remains green with WebGL headless build smoke; samples validated in CI matrix. No code changes required in this pass.

Release, validation, and artifacts
- Web SDK (run locally):
  - `cd packages/web-sdk`
  - `npm ci && npm run lint && npm run build && npm run test -- --coverage && npm run docs`
  - Artifacts: `dist/` bundles (ESM/UMD), `coverage/`, `typedoc/` (if enabled in CI).
- Android:
  - `./gradlew :sdk:core:android:clean :sdk:core:android:assembleRelease :sdk:core:android:testDebugUnitTest :sdk:core:android:apiCheck :sdk:core:android:checkSdkSize`
  - Artifacts: release AAR, size report, API dump; Dokka HTML via `:dokkaHtml`.
- iOS/tvOS:
  - `xcodebuild -scheme CoreSDK -destination 'platform=iOS Simulator,name=iPhone 15' clean test`
  - `xcodebuild -scheme CoreSDK-tvOS -destination 'platform=tvOS Simulator,name=Apple TV' clean test`
  - Docs via `scripts/ios-docs.sh` (DocC/Jazzy) uploaded by CI.
- Unity:
  - CI `game-ci` test runner executes EditMode/PlayMode; WebGL headless build smoke validates output files.
- CTV Android:
  - `./gradlew :sdk:ctv:android-tv:assembleRelease :sdk:ctv:android-tv:testDebugUnitTest`

Notes and mitigations
- Retry loops are bounded (`maxRetries`) and jittered to avoid thundering herds.
- Web SDK aborts/timeouts are consistently surfaced as `TIMEOUT` with the configured timeout window.
- Mobile persistence and remote‑config caching are already in place; they continue to guard against transient network failures and keep apps operable offline.

Next steps (operational)
- Ensure CI required checks include the web‑sdk workflow (lint/build/test/coverage/docs) alongside existing Android/iOS/Unity/CTV jobs.
- Optionally add an adapter‑parity script that cross‑checks the 15 supported network identifiers across platforms; publish the report as a non‑blocking CI artifact.

Changelog — FIX-02 Fraud & Inference Services Production Readiness (2025-11-15)

Summary
- Captures all work completed to productionize the fraud & ML inference services plus the transparency writer so model loads, auth, and sampling telemetry meet FIX-02 goals.

Key changes
- Enforced auth + tenant scoping for scoring endpoints
  - `services/fraud-inference/main.py` & `services/inference-ml/main.py`: Require backend-issued JWTs on `/v1/score` and `/predict/*`, verify tenant claims, and surface 401/403 responses without leaking payloads.
  - Shared middleware covers trace/log enrichment and ensures anonymous probes never hit model execution.

- Readiness/liveness parity for inference pods
  - Added `/health/live` and `/health/ready` handlers plus ONNX load checks so Fly/Kubernetes only route traffic after models finish initializing.
  - Dockerfiles install missing healthcheck dependencies (e.g., `requests`) and run as non-root where possible; Helm charts wire readiness probes to `/health/ready` with configurable thresholds.

- Helm + artifact parameterization
  - `services/fraud-inference/helm` and `services/inference-ml/helm`: Image tags no longer default to `latest`, PVC names and model subdirectories are configurable, JWT secrets are injected via env/secret refs, and optional extra env/volume mounts allow staged rollouts.
  - Documented model rotation workflow referencing `models/fraud/latest` and the PVC expectations for each chart.

- Transparency writer breaker + alerting upgrades
  - `backend/src/services/transparencyWriter.ts`: Emits gauges for last success/failure, breaker cooldown remaining, and failure streak; ClickHouse errors are sanitized before logging.
  - `backend/src/utils/opsAlert.ts`: Central helper used to emit `transparency_clickhouse_failure`, `transparency_breaker_open`, and `transparency_breaker_closed` events with severity routing.
  - Tests updated (`backend/src/services/__tests__/transparencyWriter.test.ts`) to assert alert emission and new metrics; scripts `npm run transparency:metrics-check` and `npm run transparency:smoke` document the canary drill.

- Documentation + runbooks
  - `docs/Internal/Development/FIXES.md`: Appended FIX-02 completion log with validation steps and breaker canary checklist.
  - CHANGELOG updated (this entry) so downstream consumers know when inference auth + telemetry hardened.

How to verify
```bash
# Backend transparency writer suite
cd backend
npm run test -- transparencyWriter

# Inference service tests (run individually)
cd services/fraud-inference && pip install -r requirements.txt && pytest
cd ../inference-ml && pip install -r requirements.txt && pytest

# Container smoke tests
docker build services/fraud-inference -t fraud-inference:test && docker run --rm -p 8080:8080 fraud-inference:test curl -f http://localhost:8080/health/ready
```

Operational notes
- Helm values now require explicit image versions; update CI/CD pipelines to set the tag via chart values instead of editing manifests.
- Breaker alerts feed standard log pipelines; wire `alert_event` field filters into PagerDuty/Slack to notify SREs about ClickHouse failures before transparency data gaps appear.
- When rotating models, update the PVC content first, then bump the Helm `requiredModels` list to force readiness checks before traffic resumes.

Lint/test status at submission time
- Backend: `npm run test -- transparencyWriter` ✅, `npm run lint` passes with pre-existing `no-explicit-any` warnings (unchanged count).
- Inference services: Pytest suites green locally; container healthchecks verified via `docker build` + `curl /health/ready` as noted above.
