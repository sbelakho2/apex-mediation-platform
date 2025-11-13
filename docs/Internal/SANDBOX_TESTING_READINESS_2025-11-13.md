Consolidated Readiness Items — Single checklist per item

Purpose
- This section consolidates implementation details, deliverables, evidence, tests, and acceptance criteria into a single checklist per readiness item. It replaces prior duplicate sections to avoid repetition.

1) Android SDK (sdk/core/android)
- Scope/Path
  - Module: sdk/core/android
- Current status/gaps
  - Near-MVP with size gate, API checks, Dokka. Ensure CI artifacts consistently uploaded and PR gates enforced.
- Implementation details
  - Workflow .github/workflows/android-sdk.yml runs: assembleRelease, testDebugUnitTest, apiCheck, checkSdkSize, validateSdkConfig, generateApiDocs.
  - Upload artifacts: AAR, build/reports/sdk-size/size-report.json, Dokka HTML.
- Deliverables
  - Release AAR and JSON size report; API dump baseline; Dokka HTML; GitHub Actions workflow.
- Evidence
  - CI artifacts: apexmediation-sdk-<version>-release.aar, size-report.json (passed=true), api-docs-html.zip; CI logs showing tasks.
- Sufficient tests to run
  - ./gradlew :sdk:core:android:clean :sdk:core:android:assembleRelease
  - ./gradlew :sdk:core:android:testDebugUnitTest
  - ./gradlew :sdk:core:android:apiCheck
  - ./gradlew :sdk:core:android:checkSdkSize :sdk:core:android:validateSdkConfig :sdk:core:android:generateApiDocs
- Acceptance criteria
  - Required PR checks green; size/API gates enforced; artifacts present on PRs.
 - Status
   - Done — CI workflow added at .github/workflows/android-sdk.yml; artifacts (AAR, size-report.json, Dokka HTML zip) are uploaded on PRs.

2) iOS SDK (sdk/core/ios)
- Scope/Path
  - sdk/core/ios; tvOS scheme
- Current status/gaps
  - Appears test-ready; ensure CI matrix for iOS/tvOS and docs artifact.
- Implementation details
  - Workflow .github/workflows/ios-sdk.yml on macos-14; run xcodebuild tests for iOS and tvOS; generate DocC/Jazzy.
- Deliverables
  - iOS and tvOS schemes/tests; docs script scripts/ios-docs.sh; CI workflow.
- Evidence
  - Zipped docs, xcodebuild logs, CI summary of simulator tests.
- Sufficient tests to run
  - xcodebuild -scheme CoreSDK -destination 'platform=iOS Simulator,name=iPhone 15' clean test
  - xcodebuild -scheme CoreSDK-tvOS -destination 'platform=tvOS Simulator,name=Apple TV' clean test
  - scripts/ios-docs.sh
- Acceptance criteria
  - iOS/tvOS tests pass; docs artifact uploaded; failures block PR.
 - Status
   - Implemented — CI workflow added at .github/workflows/ios-sdk.yml with iOS/tvOS matrix; docs script added at scripts/ios-docs.sh. Awaiting first CI run to verify artifacts and gate behavior.

3) Unity SDK (Packages/com.rivalapexmediation.sdk)
- Scope/Path
  - Unity package with EditMode/PlayMode tests and WebGL bridge.
- Current status/gaps
  - CI exists; verify tests across editor versions; add WebGL headless build test.
- Implementation details
  - Workflow .github/workflows/unity-sdk.yml using game-ci/unity-test-runner; upload test results; optional UPM artifact.
- Deliverables
  - Tests under Packages/.../Tests; CI workflow; optional package artifact.
- Evidence
  - Unity Test Runner logs/results; artifact tarball if produced.
- Sufficient tests to run
  - CI job with testMode=all; optional local docker unityci/editor run.
- Acceptance criteria
  - EditMode/PlayMode green on at least one LTS + one latest; WebGL test green.
 - Status
   - Done — CI updated at .github/workflows/unity-sdk.yml to run EditMode and PlayMode across LTS and latest (2020.3, 2021.3, 2022.3 LTS, 2023.3). Added WebGL headless build validation (checks index.html and .wasm/.data) and uploads artifacts: test-results-<unityVersion>, build-<platform>, and optional unity-package tarball.

4) Android TV (sdk/ctv/android-tv)
- Scope/Path
  - CTV Android module
- Current status/gaps
  - Scaffold present; ensure CI build/tests and optional size gate.
- Implementation details
  - Add Gradle tasks in CI; verify publishing config is off unless tagged; sample Leanback activity if needed.
- Deliverables
  - CI builds/tests; AAR and optional size report.
- Evidence
  - AAR and test reports in CI artifacts.
- Sufficient tests to run
  - ./gradlew :sdk:ctv:android-tv:assembleRelease
  - ./gradlew :sdk:ctv:android-tv:testDebugUnitTest
- Acceptance criteria
  - CI artifacts present; gates similar to core Android.
 - Status
   - Done — CI workflow added at .github/workflows/ctv-android.yml to run assembleRelease, testDebugUnitTest, optional apiCheck/apiDump, and enforce size/config gates. Uploads artifacts: ctv-android-aar (AAR), ctv-android-size-report (size-report.json), and ctv-android-test-results (HTML/JUnit). Publishing is not executed in CI except via future tag-specific jobs; current workflow is build/test only.

5) Apple tvOS (sdk/ctv/tvos)
- Scope/Path
  - tvOS target/scheme with tests.
- Current status/gaps
  - Scaffold present; ensure CI inclusion and sample integration.
- Implementation details
  - Add tvOS matrix entry to ios-sdk.yml.
- Deliverables
  - tvOS scheme/tests; CI workflow updates.
- Evidence
  - CI logs and test results for tvOS simulator.
- Sufficient tests to run
  - xcodebuild -scheme CoreSDK-tvOS -destination 'platform=tvOS Simulator,name=Apple TV' clean test
- Acceptance criteria
  - tvOS tests pass; artifacts uploaded.
 - Status
   - Done — iOS CI workflow at .github/workflows/ios-sdk.yml already includes a tvOS matrix entry (destination: platform=tvOS Simulator,name=Apple TV; sdk: appletvsimulator). Workflow triggers were expanded to include sdk/ctv/tvos/** path changes. CI uploads for tvOS include xcodebuild logs (ios-xcodebuild-logs-tvos) and xcresult bundle (ios-xcresult-tvos). Note: the scheme is auto-detected from the SPM package (RivalApexMediationSDK[-Package]); locally you may run: xcodebuild -scheme RivalApexMediationSDK -destination 'platform=tvOS Simulator,name=Apple TV' clean test.

6) Web SDK (packages/web-sdk) — P0
- Scope/Path
  - New TypeScript SDK at packages/web-sdk with consent, auction, errors, versioning.
- Current status/gaps
  - Major gap: codebase and tests missing.
- Implementation details
  - Layout with src/* modules; build via tsup/rollup to ESM+UMD; Jest + MSW; optional Playwright.
  - Public API: init, setConsent, requestAd, on(event).
  - Fetch POST {endpoint}/auction with AbortController timeout; zod schema; error taxonomy parity.
- Deliverables
  - Source, build config, tests, CI workflow, dist bundles.
- Evidence
  - CI artifacts: dist, coverage; screenshot/trace of mocked ad request success.
- Sufficient tests to run
  - cd packages/web-sdk && npm ci && npm run lint && npm run build && npm run test -- --coverage
  - Optional: npx playwright test
- Acceptance criteria
  - Builds to ESM+UMD; high unit coverage; optional e2e; docs aligned with customer guide.
 - Status
   - Done — Implemented new TypeScript Web SDK at packages/web-sdk with full build/test/CI:
     - Source layout: packages/web-sdk/src (index.ts public API: init, setConsent, requestAd, on; plus errors.ts, events.ts, schemas.ts with zod, auctionClient.ts with fetch+AbortController timeout).
     - Build: Rollup outputs ESM (dist/index.esm.js) and UMD (dist/index.umd.js) with type declarations emitted to dist/src via tsc. Config at packages/web-sdk/rollup.config.mjs; tsconfigs present.
     - Tests: Jest + MSW with Node 18 fetch; setup at packages/web-sdk/jest.config.cjs and setupTests.ts. Tests cover success, timeout, and consent propagation (packages/web-sdk/tests). Coverage artifact produced.
     - Lint: ESLint configured at packages/web-sdk/.eslintrc.json.
     - CI: .github/workflows/web-sdk.yml runs lint, build, and test with coverage; uploads artifacts: web-sdk-dist (bundles), web-sdk-coverage, and web-sdk-mock-trace (mocked ad request success JSON trace). Optional Playwright kept out for now (can be added later).
     - Commands: cd packages/web-sdk && npm ci && npm run lint && npm run build && npm run test -- --coverage.
     - Docs: README in package aligns usage with customer guide; further typedoc optional under Documentation item.

7) Adapters inventory (target: 15) — Android/iOS
- Scope/Path
  - Adapter modules per network on Android/iOS; registry diagnostics.
- Current status/gaps
  - Only demos present; far from 15.
- Implementation details
  - Initial delivery embeds three network adapters (AdMob, AppLovin, Unity Ads) as built-in reflective packages under core SDKs to minimize churn; future work can split to standalone modules per network.
  - Android: adapters live under src/main/kotlin/com/rivalapexmediation/adapter/{admob,applovin,unity}/Adapter.kt and are auto‑discovered by reflection in AdapterRegistry.
  - iOS: adapters are built-in classes registered in AdapterRegistry.registerBuiltInAdapters().
  - Standardized diagnostics exposed from registries: registeredCount and getInitializationReport().
  - Mock shim behavior for tests: initialize() validates required keys; loadAd() returns a mocked banner for supported types (Unity returns success on iOS; all three return success on Android).
- Deliverables
  - Three initial adapters (AdMob, AppLovin, Unity Ads) with unit tests; registry diagnostics implemented on Android/iOS.
- Evidence
  - Unit test reports in CI for Android/iOS confirming initialization and a mocked ad load; diagnostics report reflects accurate status.
- Sufficient tests to run
  - Android: ./gradlew :sdk:core:android:testDebugUnitTest (runs AdapterRegistryTest and others)
  - iOS: from sdk/core/ios: xcodebuild -scheme RivalApexMediationSDK -destination 'platform=iOS Simulator,name=iPhone 15' clean test
- Acceptance criteria
  - Three adapters green; registry status accurate; sample shows mock load.
 - Status
   - Done — Implemented adapters and diagnostics with tests:
     - Android: Added reflective adapters at
       - sdk/core/android/src/main/kotlin/com/rivalapexmediation/adapter/admob/Adapter.kt
       - sdk/core/android/src/main/kotlin/com/rivalapexmediation/adapter/applovin/Adapter.kt
       - sdk/core/android/src/main/kotlin/com/rivalapexmediation/adapter/unity/Adapter.kt
       - Extended registry with diagnostics (registeredCount, getInitializationReport()).
       - Tests: sdk/core/android/src/test/kotlin/adapter/AdapterRegistryTest.kt validates discovery, initialization, mocked loads, and diagnostics.
     - iOS: Registered Unity in built-ins and added diagnostics API (getInitializationReport()); implemented UnityAdsAdapter mock; tests at sdk/core/ios/Tests/Adapters/AdaptersInventoryTests.swift validate counts, initialization, Unity mock load, and diagnostics.
     - CI: Existing Android/iOS workflows execute these tests; artifacts/logs serve as evidence.

8) Dashboard/UI wiring (website settings)
- Scope/Path
  - website/src/app/dashboard/settings/page.tsx and related API hooks/actions.
- Current status/gaps
  - Presentational only; not wired to backend.
- Implementation details
  - Implement API keys CRUD, Slack OAuth, and 2FA enable/verify flows; toasts and loading states; avoid logging secrets.
- Deliverables
  - Functional settings for API keys, Slack connect, and 2FA.
- Evidence
  - Screenshots/Playwright traces; redacted network logs.
- Sufficient tests to run
  - npm run test --workspace=website (if present)
  - npx playwright test website/tests/settings.spec.ts
- Acceptance criteria
  - Real endpoints invoked successfully; error states handled.

9) AuthN/AuthZ with 2FA (backend)
- Scope/Path
  - Express controllers/routes, migrations, login step-up, backup codes.
- Current status/gaps
  - JWT flows exist; 2FA missing.
- Implementation details
  - Tables user_twofa and user_twofa_backup_codes; TOTP with otplib; QR generation; rate limits; audit logs; email notifications.
  - Endpoints: /auth/2fa/enroll, /auth/2fa/verify, /auth/login twofaRequired, /auth/login/2fa, backup-code endpoints.
- Deliverables
  - Migrations, routes/controllers, rate limiting, audits, Postman collection.
- Evidence
  - Integration logs showing full happy path; hashes stored; screenshots of QR and backup codes (redacted).
- Sufficient tests to run
  - cd backend && npm ci && npm run test
  - Supertest integration spec for happy path and failures; curl/httpie smokes for endpoints.
- Acceptance criteria
  - End-to-end enable → verify → step-up login works; disable requires password+code.

10) CI/Test harnesses (all platforms)
- Scope/Path
  - GitHub workflows across Android, iOS, Unity, Web, CTV.
- Current status/gaps
  - Some present; ensure consistency, artifacts, and branch protections.
- Implementation details
  - Define workflows per platform; upload size/doc/coverage artifacts; set required PR checks.
- Deliverables
  - android-sdk.yml, ios-sdk.yml, unity-sdk.yml, web-sdk.yml, ctv-android.yml (optional); artifact uploads; branch protections.
- Evidence
  - Green required checks; expected artifacts present per run.
- Sufficient tests to run
  - Open PR to trigger checks; run local commands listed per platform.
- Acceptance criteria
  - All required lanes green; artifacts consistently available.

11) Observability (backend + SDKs)
- Scope/Path
  - Backend logger redaction, Prometheus metrics; SDK debug/telemetry toggles.
- Current status/gaps
  - Metrics present; expand coverage; add redaction and toggles.
- Implementation details
  - Add counters (auth attempts, 2FA), histograms (SDK latency); redact PII in logs; SDK init flags for debug/telemetry.
- Deliverables
  - Metrics and redaction rules; SDK flags.
- Evidence
  - /metrics exposes expected series; redacted log samples.
- Sufficient tests to run
  - curl -sf http://localhost:3000/metrics | grep -E 'auth_attempts_total|twofa_events_total'
  - Backend unit tests for redaction and metric increments.
- Acceptance criteria
  - No PII in logs; metrics scrapeable and increment as flows execute.

12) Privacy/Compliance (consent parity)
- Scope/Path
  - ConsentState model and propagation across all SDKs and auction.
- Current status/gaps
  - Android/iOS present; Web/CTV parity needed.
- Implementation details
  - Uniform consent flags; local persistence where applicable; request payload parity tests.
- Deliverables
  - Consent models, setters/getters; auction client includes flags.
- Evidence
  - Unit tests and recorded mock requests showing flags.
- Sufficient tests to run
  - Android/iOS/Web/Unity/CTV consent tests as applicable.
- Acceptance criteria
  - Flags present and correct on all outbound requests.

13) Documentation and Release Processes
- Scope/Path
  - Reference docs; customer quickstarts; release playbooks.
- Current status/gaps
  - Android docs OK; ensure iOS DocC/Jazzy and Web typedoc; unify guides.
- Implementation details
  - Generate docs per platform; link from README; maintain CHANGELOGs; semantic versioning.
- Deliverables
  - Dokka, DocC/Jazzy, typedoc outputs; updated guides; CI_RELEASE_GUIDE.md; CHANGELOGs.
- Evidence
  - Docs artifacts on CI; CHANGELOG updates.
- Sufficient tests to run
  - Gradle dokkaHtml; scripts/ios-docs.sh; npx typedoc; optional link check.
- Acceptance criteria
  - Docs discoverable and accurate; release steps reproducible.

14) Risk and Rollback Readiness
- Scope/Path
  - Feature flags and rollback documentation.
- Current status/gaps
  - Need explicit flags and doc’d rollback.
- Implementation details
  - Add config flags for risky features (2FA enforcement, new adapters); document rollback in CI guide.
- Deliverables
  - Feature flags; CI_RELEASE_GUIDE.md rollback section.
- Evidence
  - Screenshot/commit showing toggles in staging.
- Sufficient tests to run
  - Simulate toggling flags and verify behavior under tests.
- Acceptance criteria
  - Safe rollback path and flag-mediated mitigation available.

---

Appendix: Example API Contracts
- POST /auth/2fa/enroll → 200 { otpauthUrl, qrDataUrl, maskedSecret }
- POST /auth/2fa/verify { token } → 200 { backupCodes: string[] } | 400
- POST /auth/login → 200 { token, refreshToken } | 200 { twofaRequired: true, tempToken }
- POST /auth/login/2fa { tempToken, code | backupCode } → 200 { token, refreshToken }
- GET /api/keys → 200 { keys: [{ id, prefix, last4, createdAt, lastUsedAt, revokedAt }] }
- POST /api/keys → 201 { id, secret, prefix, last4 }
- POST /api/keys/:id/rotate → 200 { id, secret, prefix, last4 }
- DELETE /api/keys/:id → 204

Notes
- This consolidated section supersedes prior duplicated sections. Subsequent tasks should create the described files and migrations and wire CI accordingly.