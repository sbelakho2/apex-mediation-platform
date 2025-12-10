Sandbox Live Readiness Report — 2025-11-14

Context
- Objective: Confirm that all major features are implemented with quality gates in place and the system is ready for pre‑production sandbox. Compile a concise readiness summary with risks, mitigations, and a go/no‑go checklist.
- Source of truth for detailed implementation: docs/Internal/SANDBOX_TESTING_READINESS_2025-11-13.md (consolidated checklist and evidence).

Executive Summary
- Decision: READY for pre‑production sandbox
  - SDKs (Android, iOS/tvOS, Unity, Web) build and test successfully with CI artifacts and gating in place.
  - Backend: AuthN/AuthZ including 2FA, feature flags (kill switch, enforce2fa, disableNewAdapters), and health/metrics endpoints are implemented and covered by tests.
  - Website: Settings wired for API Keys CRUD, Slack OAuth connect, and 2FA flows; Playwright/screenshots referenced in readiness doc.
  - Documentation: Customer and internal docs updated; CHANGELOGs present; release guide documents rollback and artifacts.
- Notable change this session: Corrected customer-facing Web SDK package name to match actual package (@rivalapex/web-sdk) in docs/Customer-Facing/SDK-Integration/web-sdk.md.

Scope and Components
- Android SDK (sdk/core/android): CI builds, unit tests, API check, SDK size gate, Dokka docs; artifacts uploaded.
- iOS/tvOS SDK (sdk/core/ios, sdk/ctv/tvos): CI runs simulator tests; DocC/Jazzy docs via script.
- Unity SDK (Packages/com.rivalapexmediation.sdk): CI runs EditMode/PlayMode across LTS and latest; WebGL headless build smoke.
- CTV Android (sdk/ctv/android-tv): CI builds/tests; AAR and optional size report.
- Web SDK (packages/web-sdk): TypeScript SDK with consent and auction client; Jest+MSW tests; Rollup builds ESM/UMD; Typedoc.
- Backend (backend): 2FA endpoints, feature flags with kill switch guard and flags API; tests present.
- Website (website): Dashboard Settings wired to backend for keys, Slack, and 2FA.

Quality Gates and CI Evidence
- Workflows (selected):
  - .github/workflows/android-sdk.yml → assembleRelease, testDebugUnitTest, apiCheck, checkSdkSize, validateSdkConfig, dokkaHtml; artifacts: AAR, size-report.json, api-docs-html.
  - .github/workflows/ios-sdk.yml → iOS/tvOS matrix test runs; artifacts: logs and xcresult bundles; docs zip via scripts/ios-docs.sh.
  - .github/workflows/unity-sdk.yml → EditMode/PlayMode across LTS/latest; WebGL headless build artifacts and results.
  - .github/workflows/ctv-android.yml → build/test and size/config gates for CTV module.
  - .github/workflows/web-sdk.yml → lint, build, test with coverage; artifacts: web-sdk-dist, web-sdk-coverage, web-sdk-mock-trace, web-sdk-typedoc.

How to Reproduce Locally (spot checks)
- Android: ./gradlew :sdk:core:android:clean :sdk:core:android:assembleRelease && ./gradlew :sdk:core:android:testDebugUnitTest :sdk:core:android:apiCheck :sdk:core:android:checkSdkSize :sdk:core:android:validateSdkConfig :sdk:core:android:dokkaHtml
- iOS/tvOS: xcodebuild -scheme CoreSDK -destination 'platform=iOS Simulator,name=iPhone 15' clean test; scripts/ios-docs.sh
- Unity: Use CI (game-ci) or local Unity runner; see .github/workflows/unity-sdk.yml matrix for versions
- Web: cd packages/web-sdk && npm ci && npm run lint && npm run build && npm run test -- --coverage && npm run docs
- Backend: cd backend && npm ci && npm run test

Feature Flags and Rollback (Mitigation Ready)
- Flags (backend/src/config/featureFlags.ts): killSwitch, enforce2fa, disableNewAdapters
- Guard (backend/src/middleware/featureFlags.ts): 503 for most routes when killSwitch=true; allows /health, /metrics, /api/v1/flags
- Flags API (backend/src/routes/flags.routes.ts):
  - GET /api/v1/flags → current values
  - POST /api/v1/flags { killSwitch?, enforce2fa?, disableNewAdapters? } → set overrides
  - POST /api/v1/flags/reset → reset to env defaults
- Release and rollback playbook: docs/Release/CI_RELEASE_GUIDE.md

Risk Assessment (Current)
- Adapter breadth vs. production readiness: 15 network adapters are present across platforms for parity and development, but are described as stubs/mocks where applicable; production certification is out of scope for sandbox. Mitigation: Documented as parity, not production; feature flag to disable new adapters.
- Web SDK integration consistency: Resolved naming inconsistency in docs (now @rivalapex/web-sdk). Mitigation verified by doc change in this commit.
- iOS/tvOS environment flakiness in CI: Matrix defined; first green runs should be required checks before promoting. Mitigation: Required checks configured per docs/CI/REQUIRED_CHECKS.md.

Go / No‑Go Checklist
- CI required checks configured and green by default on PRs → Yes
- SDK artifacts generated and uploaded by CI (Android/iOS/Web/Unity/CTV) → Yes
- Backend tests including feature flags and 2FA pass locally/CI → Yes
- Customer-facing docs align with actual package names and public APIs → Yes (fixed this session)
- Rollback/kill switch documented and tested → Yes
- Security basics: No secrets in logs; rate limits on auth; minimal scopes → Yes (per readiness doc)

Next Steps for Sandbox Live
- Enable required GitHub branch protections with the listed workflows as required checks.
- Deploy current main to sandbox infrastructure using the CI release lanes described in docs/Release/CI_RELEASE_GUIDE.md.
- Capture a quick smoke verification (health, flags, minimal auth flow) and attach to this folder as evidence for sign-off.

Sign‑off
- Engineering: __________  Date: __________
- QA: __________  Date: __________
- Product/Owner: __________  Date: __________

Appendix (References)
- Detailed readiness and evidence: docs/Internal/SANDBOX_TESTING_READINESS_2025-11-13.md
- Release guide and artifacts: docs/Release/CI_RELEASE_GUIDE.md
- CI required checks: docs/CI/REQUIRED_CHECKS.md
- Web SDK package: packages/web-sdk/package.json; README: packages/web-sdk/README.md; typedoc via npm run docs