# SDK Competitiveness Audit (Web, Android, iOS, Unity)

Last updated: 2025-11-06
Owner: Platform Engineering
Scope: Evaluate SDK feature parity and competitiveness vs. leading ad mediation SDKs; identify gaps and a prioritized closure plan.

Goals
- Cross‑platform parity (Web, Android, iOS, Unity) with one unified logical API surface (initialize, consent, request/show, events).
- Production‑grade developer experience: quick start, sample apps, integration validator, clear error taxonomy, and excellent docs.
- Performance, size, privacy: low overhead, small binaries, strong privacy/consent support (GDPR/CCPA/ATT/SKAN), offline/dev modes.

Summary
- Web SDK: Feature‑complete MVP for dev; consistent error/timeout taxonomy; deterministic offline mode; event hooks; tests exist.
- Android SDK: Solid architecture (threading, circuit breaker, telemetry). Compilation was blocked by a registry mismatch; fixed. Added JVM‑safe tests for config + telemetry; needs network/request mapping tests, consent propagation, and sample app.
- iOS SDK: Swift Package scaffold only; needs API parity, consent handling, tests, and a sample app.
- Unity SDK: Present but unverified; needs API parity validation, mocks/tests, and a sample scene.

What competitive SDKs typically offer (baseline)
1) Reliability & Performance
   - Preloading/caching of ad units; automatic retry/backoff; thread safety guarantees; ANR‑safe operations; strict size/perf budgets.
2) Privacy & Compliance
   - Built‑in consent integration (TCF v2, US Privacy/CPRA); COPPA flags; SKAdNetwork support; ATT prompts; PII minimization.
3) Observability & Debugging
   - Rich logs, device debugger; standardized error codes; mediation debugger views; ILRD hooks; optional test endpoints.
4) Developer Experience
   - 10‑minute quick start; sample apps; docs with FAQs; integration validator/linter; CI‑friendly offline mocks; semantic versioning.
5) Feature Surface
   - Ad lifecycle callbacks (load/show/click/close/fail); inventory (banner/interstitial/rewarded/native/app open); request metadata; floors.

Current state vs. baseline
- Web SDK
  - Strengths: offline stub path; timeout and HTTP → taxonomy mapping; simple event bus; alignment with backend auction.
  - Gaps: rendering (iframe + safe sandbox) and lifecycle events are stubbed; no sample app; consent helpers (TCF/USP) TBD.
- Android SDK
  - Strengths: StrictMode in debug; background/threading segregation; circuit breaker; telemetry batching with gzip; config cache.
  - Fixes applied: in‑package AdapterRegistry (AdAdapter‑based) and imports to restore compilation; JVM tests for config/telemetry/registry.
  - Gaps: end‑to‑end request builder to backend auction; consent propagation; standardized error taxonomy mapping to callbacks; sample app; integration linter; Robolectric/instrumentation tests; adapter discovery/documentation.
  - Size/perf: build.gradle contains a 500KB release AAR size guard; need CI evidence with proguard/R8.
- iOS SDK
  - Strengths: SwiftPM scaffold.
  - Gaps: entire implementation (API parity, consent, network mapping, tests, sample app); SKAdNetwork and ATT handling.
- Unity SDK
  - Strengths: Folder present; unknown completeness.
  - Gaps: API parity, tests/mocks, sample scene; platform adapters.

P0 Closure Plan (coding‑first, no external creds)
1) Web
   - Implement minimal render path (iframe sandbox) + lifecycle events; add example app using Vite; unit tests.
   - Provide consent helpers to read TCF/USP strings (best‑effort) and pass in the request; document privacy knobs.
2) Android
   - Request builder → backend auction (with timeout, taxonomy mapping to AdError codes); respect consent flags.
   - Add Robolectric + MockWebServer tests for: 200/winner, 204/no_fill, 4xx→status_4xx (no retry), 5xx transient, timeout; verify callbacks.
   - Sample app (mocked auction URL) demonstrating interstitial flow; CI task to assemble and run unit tests; maintain 500KB size budget.
   - Integration validator: Gradle task that checks proguard/manifest/network‑security config and prints actionable issues.
3) iOS
   - Define API surface to match Web/Android; implement config cache + request builder; propagate consent; unit tests (XCTest) with mock server.
   - Sample app (SwiftUI) with mocked endpoints; SKAdNetwork/ATT placeholders and docs.
4) Unity
   - C# API matching other platforms; offline mock transport; tests; sample scene to request/show interstitial (mocked).

Acceptance & KPIs
- DX: “Time‑to‑first‑impression” < 1 day with the sample app and quick‑start guide; integration linter passes.
- Reliability: Deterministic tests (mock server) covering taxonomy mapping, timeouts, and callbacks on all platforms.
- Size/perf: Android AAR ≤ 500KB release; iOS package size documented; Web bundle size budgets enforced; cold start targets respected.
- Privacy: Consent fields present and verifiable in requests; PII minimization documented; ATT/SKAN scaffolds in iOS; COPPA flag on Android.

Traceability
- Roadmap: docs/Internal/Development/DEVELOPMENT_ROADMAP.md
- TODO Checklist: docs/Internal/Development/DEVELOPMENT_TODO_CHECKLIST.md (SDKs section)
- Observability: Backend Admin APIs + Website pages (metrics/debugger/overview)
