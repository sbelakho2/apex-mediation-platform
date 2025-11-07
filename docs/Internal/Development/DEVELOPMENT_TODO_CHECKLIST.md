# Development TODO Checklist (Phased, Check‑off)

Last updated: 2025-11-07
Owner: Platform Engineering

Source of truth for tasks:
- Roadmap: docs/Internal/Development/DEVELOPMENT_ROADMAP.md
- Competitive gaps: docs/Internal/COMPETITIVE_GAP_ANALYSIS.md
- ML data sources: docs/Internal/ML_FRAUD_TRAINING_DATA_SOURCES.md
- Current system gaps summary: GAPS_RESOLUTION.md

How to use
- Check items off only when acceptance criteria are met.
- If an item is partially done, add a sub‑checkbox and link to evidence (PRs, dashboards, test runs).
- Keep this file in sync with the Roadmap; update weekly.

Legend
- [ ] Not started
- [~] In progress
- [x] Done

P0 — Reliability, Adapters, Observability, ML Safety (0–6 weeks)

1) Adapter resiliency and conformance
- [x] Standardize retry + jitter + circuit breaker across ALL adapters (AdMob, Meta, Unity, AppLovin, ironSource)
  - [x] AdMob uses shared resiliency helpers (1 retry, 10–100ms jitter, CB 3 fails/30s)
  - [x] Meta uses shared resiliency helpers (same policy)
  - [x] Unity uses shared resiliency helpers (verified switch to shared helpers)
  - [x] AppLovin uses shared resiliency helpers (verified switch to shared helpers)
  - [x] ironSource adapter parity
  - [x] Migrate adapters to shared Clock-enabled CircuitBreaker (commons.CircuitBreaker) for deterministic behavior
- [x] Hedged requests for slow adapters (launch a backup request at p95 latency budget)
  - Evidence: feature-flagged in backend/auction/internal/bidding/engine.go (SetHedgingEnabled/SetHedgeDelay, hedged path in requestBidFromAdapter); env: AUCTION_HEDGING_ENABLED, AUCTION_HEDGE_DELAY_MS
  - Tests: backend/auction/internal/bidding/engine_hedge_test.go (hedged earlier return)
- [x] Partial aggregation: accept late/failed adapters without stalling the auction; ensure auction deadline adherence
  - Tests: backend/auction/internal/bidding/engine_hedge_test.go (RunAuction honors TimeoutMS and returns collected bids)
- [x] Define and implement a normalized NoBid taxonomy (timeout, network_error, status_XXX, no_fill, below_floor)
  - [x] Added taxonomy constants in backend/auction/internal/bidders/commons.go and wired MapErrorToNoBid
  - [x] Applied below_floor constant in Meta adapter
  - [x] Standardized Meta error path to "error" with details in Metadata
  - [x] Applied taxonomy to AppLovin adapter (replaced "invalid_response" with standardized "error")
  - [x] Apply taxonomy across all adapters (AdMob, Meta, Unity, AppLovin, ironSource)
  - [x] Add unit tests for taxonomy mapping and transient error handling (commons_test.go)
  - [x] Deterministic circuit breaker tests using Clock abstraction (backend/auction/internal/bidders/circuitbreaker_test.go); Clock added to commons.go
- [x] Add conformance tests (offline) for request schema and response parsing for each adapter
  - Evidence: backend/auction/internal/bidders/adapter_conformance_test.go covers AppLovin, ironSource, AdMob, Meta, and Unity (success, 204 no_fill, 5xx retry→success, circuit_open)
  - Note: AdMob, Meta, and Unity support req.Metadata["test_endpoint"] for offline tests
  - Status: Initial suite complete for current adapters; keep adding edge cases and golden fixtures
  - New edge cases added (AdMob, Meta): 4xx non-transient (status_400 no retry), and 200 with malformed JSON -> standardized "error" no-bid (see tests at bottom of adapter_conformance_test.go)
  - New edge cases added (Unity, AppLovin, ironSource): 4xx non-transient (status_400 no retry), and 200 with malformed JSON -> standardized "error" no-bid (see tests appended in adapter_conformance_test.go)

Acceptance:
- [x] p99 auction runtime never exceeds timeout budget due to a single adapter (evidence: backend/auction/internal/bidding/engine_timeout_test.go)
- [x] Unit/integration tests cover transient errors and CB open/close behavior (evidence: bidders/commons_test.go, bidders/circuitbreaker_test.go, bidders/adapter_conformance_test.go)

2) Observability, SLOs, Mediation Debugger (MVP)
- [x] Per‑adapter metrics exported (latency p50/p95/p99, error rate, fill rate)
  - [x] Added minimal metrics scaffolding with no‑op default: backend/auction/internal/bidders/metrics.go
  - [x] Instrumented adapters (AdMob, Meta, AppLovin, Unity, ironSource) with request/latency/success/error/no_fill/timeout counters
  - [x] Unit tests for metrics signals using test recorder: backend/auction/internal/bidders/metrics_test.go
  - [x] Hook exporter/collector and compute percentiles (initial in-process RollingMetricsRecorder; see backend/auction/internal/bidders/metrics_rollup.go with tests in metrics_rollup_test.go)
  - [x] Read-only metrics snapshot API: GET /v1/metrics/adapters (returns per-adapter counters and p50/p95/p99); default recorder wired in main.go
    - [x] Website Adapter Metrics page consuming snapshot API
      - Evidence: website/src/app/dashboard/observability/metrics/page.tsx; client: website/src/lib/auctionApi.ts
- [x] Tracing spans across auction and adapter calls (scaffolded; no-op default)
  - [x] Added lightweight tracing scaffold: backend/auction/internal/bidders/tracing.go (Tracer/Span, SetTracer, StartSpan)
  - [x] Instrumented adapters (AdMob, Meta, AppLovin, Unity, ironSource) with start/end spans and outcome/reason attrs
  - [x] Unit test for tracing scaffold: backend/auction/internal/bidders/tracing_test.go
  - [ ] Consider wiring OpenTelemetry in host app later (out of scope for now)
- [x] Dashboards for adapters + auction KPIs
- [x] SLOs defined and alerts configured (p99 latency, error/fill thresholds)
  - [x] Time-series metrics aggregator (5-min buckets, 7 days): backend/auction/internal/bidders/metrics_timeseries.go with tests metrics_timeseries_test.go
  - [x] SLO evaluator + API: backend/auction/internal/bidders/slo.go with tests slo_test.go; Admin API GET /v1/metrics/slo
  - [x] Time-series API: GET /v1/metrics/adapters/timeseries; default aggregator wired in main.go
  - [x] Observability Overview page (7-day trends + SLO badges): website/src/app/dashboard/observability/overview/page.tsx
- [x] Mediation Debugger (MVP): per‑request timeline, payload redaction, response/no‑bid reason display
  - [x] Added in-process debugger scaffold with ring buffer and redaction: backend/auction/internal/bidders/debugger.go
  - [x] Adapters emit sanitized debug events (success/no-bid): AdMob, Meta, Unity, AppLovin, ironSource
  - [x] Unit tests for ring buffer + redaction: backend/auction/internal/bidders/debugger_test.go
  - [x] Admin API wiring to retrieve last-N events per placement (auction: GET /v1/debug/mediation?placement_id=&n=)
  - [x] Debugger viewer page in Website (sanitized)
    - Evidence: website/src/app/dashboard/observability/debugger/page.tsx; client: website/src/lib/auctionApi.ts
    - Note: Ensure CORS_ORIGIN is set for auction service to allow website access

Acceptance:
- [x] Dashboards show last 7 days with functioning alerts; runbooks exist
  - Evidence: Website Observability Overview (website/src/app/dashboard/observability/overview/page.tsx); APIs /v1/metrics/adapters/timeseries and /v1/metrics/slo; runbooks docs/runbooks/SLOS_AND_ALERTS.md and docs/runbooks/OBSERVABILITY_RUNBOOK.md
- [x] Debugger usable on dev; sensitive fields redacted
  - Evidence: Website Debugger page (website/src/app/dashboard/observability/debugger/page.tsx); API /v1/debug/mediation; redaction tests backend/auction/internal/bidders/debugger_test.go

3) ML Fraud — Shadow Mode and Data Pipeline bring‑up 
- [x] Enforce shadow mode unless model meets go/no‑go metrics (code safety in place)
  - [x] Unit tests: backend/fraud/internal/ml/fraud_ml_test.go verifies degenerate metrics force shadow mode and healthy model respects override

- [ ] Data contracts and schemas (training + scoring)
  - [ ] Define Feature/Label schemas for training parquet (clicks, impressions, conversions, device, network, auction, OMSDK)
  - [ ] Document data contracts in docs/Internal/ML/DataContracts.md (PII rules, retention, redaction)
  - [ ] Add schema versioning and backward‑compat guidance (SemVer; include in parquet metadata)

- [ ] ETL (ClickHouse → Parquet; last 30 days, rolling)
  - [ ] SQL extracts for core tables (impressions, clicks, installs/postbacks, auctions)
  - [ ] Join logic for CTIT (click→install), device/user agent, IP/ASN, placement/network
  - [ ] Partitioning: by event_date/hour; write Parquet to data/training/YYYY‑MM‑DD
  - [ ] Deduplication rules (per request_id / impression_id / click_id)
  - [ ] Privacy guard: drop direct identifiers; hash stable IDs; truncate IP (/24) & UA normalization
  - [ ] Add ETL dry‑run + unit tests (golden queries, row counts, null checks)

- [ ] Enrichment (cached locally; no external calls at runtime)
  - [ ] IP intelligence: AbuseIPDB exports ingest (CSV), Tor exit list, cloud IP ranges (AWS/GCP/Azure) → local Bloom/Trie
  - [ ] ASN/Geo lookup via offline MaxMind‑like free DB (or ip2asn datasets)
  - [ ] VPN/DC list ingestion (FireHOL, X4BNet, az0/vpn_ip) with weekly refresh
  - [ ] User‑Agent parsing using uap‑core or fast regex maps (cache results)
  - [ ] Maintain enrichment cache snapshots under data/enrichment with versioned manifests

- [ ] Weak supervision label functions (silver labels)
  - [ ] Supply‑chain validity: app‑ads.txt/sellers.json crawler/corpus join → unauthorized seller flag
  - [ ] Network origin anomalies: DC/VPN/Tor + mobile UA mismatch; timezone/geo/carrier conflicts
  - [ ] CTIT heuristics: ultra‑short spikes (injection), ultra‑long tails (spamming) per partner/placement
  - [ ] OMSDK/viewability inconsistencies (stacked/hidden patterns) where available
  - [ ] Synthetic scenarios based on case studies (e.g., VASTFLUX motifs) to stress models
  - [ ] Label quality report: coverage, conflict rates, per‑rule precision proxy

- [ ] Feature engineering
  - [ ] Aggregates: per IP/ASN/device/placement rolling rates (click/impression/install), entropy, burstiness
  - [ ] Temporal features: hour‑of‑day, day‑of‑week, CTIT histograms, recency counts
  - [ ] Supply‑chain/auction features: schain depth, reseller flags, adapter mix
  - [ ] OMSDK/engagement features: viewable time, interactions (if present)
  - [ ] Train/serve parity list (only include features available at score time)

- [ ] Training pipelines (reproducible; pinned versions)
  - [ ] Baselines: Logistic Regression + Gradient Boosted Trees (e.g., XGBoost/LightGBM) with class weighting
  - [ ] Calibration: Platt scaling + isotonic; export calibrated probability
  - [ ] Cross‑validation: time‑sliced CV (train on weeks 1‑3, validate on week 4), repeat across windows
  - [ ] Hyperparameter sweeps (budgeted) with early stopping; log artifacts/metrics

- [ ] Evaluation harness + reports
  - [ ] Metrics: ROC AUC, PR AUC, precision@recall (≥0.9), recall@precision (≥0.8), KS, lift charts
  - [ ] Cost curve analysis under business priors (false positive budget)
  - [ ] Stability across time slices and partners; subgroup fairness checks (regions/devices)
  - [ ] Export metrics into trained_fraud_model.json (schema: thresholds, aucs, confusion matrices)
  - [ ] Generate HTML/Markdown report per run under docs/Internal/ML/Reports/

- [ ] Model packaging & registry
  - [ ] Serialize model (JSON/ONNX/PMML or native GBM text) + feature manifest + schema version
  - [ ] Store under models/fraud/<version>/ with symlink latest; include metrics file
  - [ ] Integrity hash and signature (optional) to prevent corruption

- [ ] Shadow scoring (online; no blocking)
  - [ ] Emit scores to analytics (ClickHouse) with request_id + timestamp; no decisions
  - [ ] Monitor score distributions weekly (drift/shift), PSI/JS divergence
  - [ ] Correlate shadow scores with weak labels and post‑hoc outcomes; alert on drift
  - [ ] Admin/Planner snapshot includes shadow histograms and drift stats

- [ ] Gating & promotion rules (safety)
  - [ ] Keep blocking OFF unless go/no‑go targets are met for 4 consecutive weekly windows
  - [ ] Threshold selection playbook: choose threshold meeting Precision ≥ 0.8 at Recall ≥ 0.9 on latest validation
  - [ ] Planner proposes threshold via PR; human approval required

- [ ] Automation & scheduling
  - [ ] Nightly job: ETL → Enrichment refresh → Feature build → Train → Evaluate → Publish artifacts
  - [ ] Cost safeguards: cap compute/time; skip train if data unchanged materially
  - [ ] Unit/integration tests for each stage; deterministic seeds; small sample mode for CI

Acceptance:
- [ ] Offline (validation): AUC ≥ 0.85; Precision ≥ 0.8 at Recall ≥ 0.9 on time‑sliced validation; stability across slices
- [ ] Online (shadow): stable score distributions; positive correlation with weak labels; drift < threshold for 4 weeks
- [ ] Artifacts: trained_fraud_model.json includes full metrics and thresholds; model/feature manifests versioned; blocking remains shadow until targets met

4) Security/Privacy early guardrails
- [ ] Consent propagation verified (GDPR/CCPA/ATT fields) in adapters and SDK events
- [ ] PII minimization in training datasets (hash, truncate IPs)

Acceptance:
- [ ] Privacy checklist completed for data pipeline exports

P1 — Optimization, DX, Privacy (6–12 weeks)

5) Optimization & Experimentation
- [ ] Dynamic floors (global + per‑geo/device)
- [ ] eCPM decay model for waterfall ordering
- [ ] Pacing/capping per placement
- [ ] A/B/n bandit framework (e.g., Thompson Sampling) integrated into selection

Acceptance:
- [ ] Demonstrated ≥5% eCPM uplift vs baseline in controlled test

6) Developer Experience (SDKs and tooling)
- [ ] Sample apps: Android, iOS, Unity (rendering + events)
- [ ] Integration linter/validator for SDK setup
- [ ] CI mocks/sandbox packs for adapters
- [ ] Documentation: quick‑start and troubleshooting

SDKs — Verification status and competitiveness (pre‑P1):
- [x] Web SDK: offline stub path, timeout/error taxonomy mapping aligned; unit tests for init, offline stub, HTTP status mapping, timeout abort, success/no_fill events.
  - Evidence: sdks/web/src/index.test.ts; mapping change in sdks/web/src/index.ts
- [~] Android SDK: AuctionClient implemented (OkHttp) with backend-aligned schema, consent propagation, and normalized taxonomy; unit tests added (MockWebServer) for success/no_fill/4xx/5xx retry/timeout; MediationSDK wired to S2S auction with fallback to adapters; size budget guard retained. New: Interstitial caching + isAdReady() with TTL; Ad expiry semantics (JVM tests); InterstitialController (full lifecycle) with double-callback guards and unit tests; Public facade APIs for Rewarded and Banner (BelRewarded/BelBanner); ConsentManager.normalize/redact tests; Quickstart updated with Rewarded/Banner and Debug Panel.
  - Evidence: sdk/core/android/src/MediationSDK.kt (cacheAd/isAdReady), sdk/core/android/src/Models.kt (expiryTimeMs), sdk/core/android/src/interstitial/InterstitialController.kt, sdk/core/android/src/test/interstitial/InterstitialControllerTest.kt, sdk/core/android/src/test/models/AdExpiryTest.kt, sdk/core/android/src/BelRewarded.kt, sdk/core/android/src/BelBanner.kt, sdk/core/android/src/test/consent/ConsentManagerTest.kt, docs/Customer-Facing/SDKs/ANDROID_QUICKSTART.md
- [~] iOS SDK: Core API parity scaffold implemented (initialize, setConsent, requestInterstitial; offline stub + HTTP path) with unit tests; taxonomy parsing extended (204 → no_fill; malformed JSON → error); sample app pending; ensure size/perf budgets and consent propagation.
  - Evidence: sdks/ios/Sources/ApexMediation/ApexMediation.swift; sdks/ios/Tests/ApexMediationTests/{ApexMediationTests.swift,MockURLProtocol.swift}
- [ ] Unity SDK: verify API parity and add conformance mocks/tests; sample scene for interstitial flow (mocked).

Acceptance:
- [ ] Time‑to‑first‑impression < 1 day for new dev; sample apps run green in CI

7) Privacy & SKAdNetwork
- [ ] Consent matrix tests across GDPR/CCPA/ATT combinations
- [ ] SKAdNetwork postback parsing and validation

Acceptance:
- [ ] Privacy CI suite passes; SKAN parsing success >99%

P2 — Scale out, Reconciliation, Analytics (12–20 weeks)

8) Adapter expansion and certification readiness
- [ ] Implement and verify additional adapters to reach ≥12
- [ ] Compatibility matrix documented
  
  Must‑have adapter coverage (add/check each; implement stubs with offline conformance tests if sandbox creds not yet available):
  - [ ] AdMob by Google (Server‑to‑Server bidding) — STATUS: exists (admob.go); conformance/tests pending
  - [ ] ironSource (LevelPlay) — STATUS: exists (ironsource.go); conformance/tests pending
  - [ ] MAX (AppLovin) — STATUS: exists (applovin.go); conformance/tests pending
  - [ ] Unity Mediation — STATUS: partial (unity.go targets Unity Ads; evaluate mediation/bidding endpoint parity)
  - [ ] MoPub — STATUS: legacy/sunset; consider compatibility shim or documented waiver
  - [x] Fyber (Digital Turbine FairBid) — STATUS: exists (backend/auction/internal/bidders/fyber.go); offline conformance tests in bidders/adapter_conformance_test.go
  - [x] Appodeal — STATUS: exists (backend/auction/internal/bidders/appodeal.go); offline conformance tests in bidders/adapter_conformance_test.go
  - [ ] Aerserv — STATUS: legacy (acquired/sunset); consider compatibility shim or documented waiver
  - [ ] AdTapsy — STATUS: legacy; consider compatibility shim or documented waiver
  - [ ] AppMediation — STATUS: new adapter required (confirm current API/vendor)
  - [x] Admost — STATUS: exists (backend/auction/internal/bidders/admost.go); offline conformance tests in bidders/adapter_conformance_test.go
  - [x] Chocolate Platform — STATUS: exists (backend/auction/internal/bidders/chocolate.go); offline conformance tests in bidders/chocolate_tapdaq_conformance_test.go
  - [x] Tapdaq — STATUS: exists (backend/auction/internal/bidders/tapdaq.go); offline conformance tests in bidders/chocolate_tapdaq_conformance_test.go
  
  Acceptance for each network:
  - [ ] Adapter implemented (RequestBid/GetName/GetTimeout), standardized resiliency (retry+jitter, circuit breaker), and NoBid taxonomy
  - [ ] Offline conformance tests: request schema fixtures, typical response mapping (200 bid, no_fill, 5xx retry→success, circuit_open)
  - [ ] Documentation updated in API_KEYS_AND_INTEGRATIONS_GUIDE.md with required keys and config

Acceptance:
- [ ] ≥12 adapters pass internal conformance tests

9) Revenue reconciliation and workflows
- [ ] Add pipeline hooks for revenue reconciliation and invalid traffic refunds
- [ ] Console UI for discrepancies and appeals

Acceptance:
- [ ] Reconciliation report generated for test accounts; workflow walkthrough documented

10) Analytics dashboards (cohort/LTV, publisher‑facing)
- [ ] Ingestion verification service and lag monitoring (<5 min)
- [ ] Cohort/LTV dashboards and ARPDAU/retention overlays

Acceptance:
- [ ] Dashboards live with demo data; latency SLO met

W — Website & Customer Dashboard (Pre‑FT, mandatory)

12) Design adherence & IA
- [ ] Map all routes and pages to Website.docx and DESIGN_SYSTEM_IMPLEMENTATION_STATUS.md
- [ ] Implement AppShell, Navigation, and RBAC-aware route guards
- [ ] Redaction utilities for mediation debugger payloads (PII-safe)

13) Core pages and flows (with mocks/fixtures)
- [ ] Overview dashboard (Revenue/eCPM/Fill/Win-rate + Alerts)
- [ ] Placements & Ad Units CRUD with history and preview
- [ ] Networks & Adapters management (enable/disable, status, masked creds)
- [ ] Optimization: Floors (global/per-geo/device), Pacing/Capping, A/B/n setup
- [ ] Fraud & Quality: stats, type breakdown, shadow-mode distributions, appeals stub
- [ ] Analytics: cohort/LTV, ARPDAU, retention overlays
- [ ] Mediation Debugger viewer (sanitized traces)
- [ ] Billing & Reconciliation (mock invoices, discrepancy center)
- [ ] Settings: API keys (masked), Webhooks, Roles, Audit logs

14) UI/UX excellence and a11y
- [ ] WCAG 2.2 AA checks (axe-core): 0 critical violations
- [ ] Performance budgets: LCP < 2.5s, TTI < 3s, CLS < 0.1; Lighthouse ≥ 90 (Perf), ≥ 95 (A11y), ≥ 95 (BP), ≥ 90 (SEO)
- [ ] Responsive layouts (mobile/tablet/desktop); touch targets ≥ 44px; keyboard navigation
- [ ] Error/empty/loading/skeleton states across pages; content guidelines

15) Cost governance for autonomy and CI
- [ ] Enforce $500/month hard cap (see docs/Internal/COST_BUDGET_POLICY.md)
- [ ] Daily LLM limit and per-PR cost cap; degrade autonomy modes at 50/75/90/100%
- [ ] Dual-LLM routing (Junie + ChatGPT) for planner/executor under caps

Acceptance (Pre‑FT Website stage)
- [ ] End-to-end clickable flows for key pages above with deterministic mocks
- [ ] Lighthouse/a11y tests pass thresholds; screenshots and walkthrough recorded in docs/Customer-Facing

FT — Final Test & Certification (after coding complete)

11) Sandbox and certification pass
- [ ] Obtain sandbox credentials for all target ad networks
- [ ] Run official conformance packs; fix schema/auth issues
- [ ] Payment processor test flows (if applicable)
- [ ] Security review and privacy audit
- [ ] Release notes, versioning, and migration guides

Acceptance:
- [ ] All networks certified or waiver documented; audits passed; tag v1.0.0‑rc

AUTO — Autonomous Operation & Self‑Evolution (Continuous)

Goals
- The platform must run with minimal human intervention and continuously improve itself using the existing ChatGPT API hookup.
- Changes must be safe, observable, reversible, and cost‑bounded.

12) Autonomous Planner & RFC bot (LLM‑driven)
- [ ] Weekly scheduled job assembles a "planner snapshot" (metrics/logs/test outcomes/doc drift) and proposes prioritized TODO updates with rationale
- [ ] Opens PRs that update this checklist and DEVELOPMENT_ROADMAP.md with links to evidence (dashboards, test runs)
- [ ] Idempotent, cost‑bounded (budget caps), and rate‑limited; includes dry‑run mode and change summary

13) Scoped LLM Change Executor (safe, reversible)
- [ ] Executes narrowly scoped refactors/fixes behind feature flags; runs unit/integration tests; opens PRs (no direct pushes to main)
- [ ] Produces rollback plans and verifies canary/offline conformance before requesting human review on high‑risk changes
- [ ] Enforces coding standards, lint, and secret‑scan gates in CI

14) Observability feeds for autonomy (planner inputs)
- [ ] Export structured weekly snapshot for the planner: adapter latency/error/fill trends, auction deadline overruns, circuit breaker rates, test flake stats
- [ ] ML: shadow‑mode score distributions and drift metrics; fraud label coverage/quality summary
- [ ] Adapter coverage gaps vs. "Must‑have" list and competitive set
- [ ] All snapshots redacted (PII‑safe) with a documented data contract

15) Adapter discovery & stub generator
- [ ] Maintain a monitored watchlist of target networks/APIs; auto‑generate adapter stubs + offline conformance tests from templates
- [ ] Auto‑update this checklist with new items and cross‑links to generated files

16) ML continuous training & evaluation automation
- [ ] Nightly ETL/train/evaluate pipeline produces trained_fraud_model.json with full metrics; uploads model + reports; pins versions
- [ ] Shadow‑mode gating enforced automatically (do not leave shadow unless targets met); planner proposes threshold changes via PR only

17) Experiment auto‑tuning proposals
- [ ] Planner analyzes eCPM trends, floors, pacing/capping; proposes config deltas via PRs guarded by bandit/AB test safety rails

18) Autonomous documentation updater
- [ ] Keep GAPS_RESOLUTION.md, DEVELOPMENT_ROADMAP.md, and this checklist in sync; add change logs and next review dates
- [ ] Redact/avoid secrets; verify references and anchors

19) Safety & governance
- [ ] Policy prompts/guardrails for LLM tools; budget and token usage limits; allowlist of files/paths
- [ ] Secret scanning, license checks, and permission scopes; human approval required for high‑risk changes (schema, privacy, payments)
- [ ] Quarterly rollback drill (simulate revert of last 5 autonomy PRs)

Acceptance (Autonomy)
- [ ] Planner produces ≥ 2 useful PRs/week with passing CI (tests + static analysis) and clear rationale
- [ ] Zero secret leaks; monthly cost within budget cap; redaction verified in snapshots
- [ ] Rollback drill completed and documented; no production incidents caused by autonomy PRs

Traceability
- Roadmap alignment: docs/Internal/Development/DEVELOPMENT_ROADMAP.md
- Competitive gaps reference: docs/Internal/COMPETITIVE_GAP_ANALYSIS.md
- ML training plan: docs/Internal/ML_FRAUD_TRAINING_DATA_SOURCES.md
- System gaps baseline: GAPS_RESOLUTION.md



## 2025-11-06 — Android SDK perfection pass (progress notes)
- Added opt-in IAB consent reader: sdk/core/android/src/consent/ConsentManager.fromIabStorage(Context) with unit tests (ConsentManagerFromIabStorageTest.kt).
- Added Rewarded lifecycle controller mirroring Interstitial: sdk/core/android/src/rewarded/RewardedController.kt with tests (RewardedControllerTest.kt).
- Public facades expanded:
  - BelRewardedInterstitial (load/show/isReady)
  - BelAppOpen (load/show/isReady)
- AuctionClient: corrected User-Agent formatting; added test to assert UA and X-Api-Key headers.
- BelAds: added safe warnings for test mode misconfiguration (debug/release) — redaction preserved.
- Docs updated: ANDROID_QUICKSTART.md includes IAB consent helper and new facades.

Impact on plan
- SDKs — Verification status and competitiveness (pre‑P1): Android SDK remains [~] but progressed with lifecycle, consent, DX, and tests.
- Next: StrictMode instrumentation sample, integration validator task, sample app skeleton, and Java/Kotlin API reference generation.


## 2025-11-06 — Android SDK perfection pass (continued)
- Added staged rollout utility based on stable, non-PII InstallId bucketing (0–99) with unit tests.
  - Evidence: sdk/core/android/src/util/Rollout.kt; sdk/core/android/src/test/util/RolloutTest.kt
- Exposed ConfigManager.isInRollout(percentage) for OTA staged config rollouts without risking blast radius.
  - Evidence: sdk/core/android/src/config/ConfigManager.kt
- Fixed AuctionClientTest to properly assert consent serialization into metadata and to separately validate UA/API key headers.
  - Evidence: sdk/core/android/src/test/network/AuctionClientTest.kt (consentSerialization_setsMetadataFlags, headersContainUserAgentAndApiKey)
- Next (planned, P0 for SDK OTA safety): implement Ed25519 signature verification using dev test keys and add pass/fail unit tests; wire staged rollout gating for new features.


## 2025-11-06 — Daily summary of changes (comprehensive)

Scope: Completed and validated major portions of Part 1 (Adapter resiliency & conformance) and Part 2 (Observability, SLOs, Mediation Debugger, Website). Expanded adapter coverage, strengthened ML safety, and advanced Android/iOS SDK competitiveness. All work is dependency‑free/offline by default and aligned with the ≤ $500/month budget policy.

Backend — bidders, auction engine, fraud, admin APIs
- Resiliency/taxonomy foundation and tests
  - Shared resiliency helpers (retry + jitter, transient classification, CircuitBreaker with Clock) and normalized NoBid taxonomy wired across all current adapters (AdMob, Meta, Unity, AppLovin MAX, ironSource).
  - Deterministic CircuitBreaker via Clock abstraction and unit tests.
  - Files: backend/auction/internal/bidders/commons.go, circuitbreaker_test.go, commons_test.go
- Offline adapter conformance (all current adapters)
  - Added safe test_endpoint overrides where needed; httptest suites cover 200 bid, 204 no_fill, 5xx retry→success, circuit_open, 4xx no‑retry, malformed JSON → standardized "error".
  - Files: backend/auction/internal/bidders/* (admob.go, meta.go, unity.go, applovin.go, ironsource.go), adapter_conformance_test.go
- New adapters added toward ≥12 coverage
  - Fyber (Digital Turbine FairBid), Appodeal, Admost — implemented with standardized resiliency and full offline conformance tests.
  - Files: backend/auction/internal/bidders/fyber.go, appodeal.go, admost.go (+ tests in adapter_conformance_test.go)
- Observability P0
  - Metrics: per‑adapter counters + latency, rolling percentiles (p50/p95/p99) with in‑process recorder; snapshot API and tests.
  - Tracing: no‑op tracer interfaces + spans instrumented across adapters; unit tests.
  - Mediation Debugger: sanitized, in‑memory ring buffer; capture hooks in adapters; unit tests; read‑only Admin API to fetch last‑N events.
  - Time‑series (7‑day) metrics aggregator (5‑minute buckets) and SLO evaluator (p99 latency, error rate, fill) with Admin APIs and tests.
  - Files: backend/auction/internal/bidders/{metrics.go,metrics_rollup.go,metrics_timeseries.go,tracing.go,debugger.go,slo.go} (+ *_test.go), backend/auction/internal/api/handler.go, backend/auction/cmd/main.go
- Auction engine reliability features
  - Feature‑flagged hedged requests + partial aggregation; unit tests for hedge correctness and deadline adherence; p99 auction timeout test.
  - Files: backend/auction/internal/bidding/engine.go, engine_hedge_test.go, engine_timeout_test.go
- ML safety
  - Shadow‑mode gating tests ensure ineffective models cannot block traffic (AUC threshold/degenerate metrics).
  - Files: backend/fraud/internal/ml/fraud_ml.go, fraud_ml_test.go

Website — Observability and Debugger
- Added dashboard pages that consume Admin APIs:
  - Observability Overview (sparklines + SLO badges), Adapter Metrics, Mediation Debugger viewer (placement filter, limits, grouped view).
  - Files: website/src/app/dashboard/observability/{overview,page.tsx}, metrics/page.tsx, debugger/page.tsx; website/src/lib/auctionApi.ts; components/Sidebar.tsx
- Enabled CORS in auction service with env‑driven origin; OPTIONS handling for browser access.
  - Files: backend/auction/cmd/main.go

Docs, runbooks, audits
- Runbooks: SLOs & Alerts, Observability usage and diagnostics.
  - Files: docs/runbooks/SLOS_AND_ALERTS.md, docs/runbooks/OBSERVABILITY_RUNBOOK.md
- Competitive gap execution & integrations guide updates for new adapters.
  - Files: docs/Internal/COMPETITIVE_GAP_ANALYSIS.md (referenced), API_KEYS_AND_INTEGRATIONS_GUIDE.md (new sections for Fyber/Appodeal/Admost)
- Internal audit of TODO‑driven changes and quality/bug findings with action items.
  - Files: docs/Internal/Development/TODO_CHANGES_AUDIT.md

Android SDK — Production hardening and DX
- S2S auction client (OkHttp + Gson) with normalized taxonomy; robust tests (success/no_fill/4xx/5xx retry/timeout), consent propagation and header assertions.
  - Files: sdk/core/android/src/network/AuctionClient.kt, src/test/network/AuctionClientTest.kt
- Config & OTA safety
  - ConfigManager with caching and signature‑verification scaffold; staged rollout utility (stable per‑install SHA‑256 bucketing) + tests; isInRollout() helper.
  - Files: sdk/core/android/src/config/ConfigManager.kt, src/util/Rollout.kt, src/test/util/RolloutTest.kt
- Lifecycle & readiness
  - Interstitial and Rewarded controllers (strict state machines with double‑callback guards) and unit tests; ad expiry semantics and tests; in‑memory cache with TTL; isAdReady().
  - Files: sdk/core/android/src/interstitial/InterstitialController.kt, src/test/interstitial/InterstitialControllerTest.kt, src/rewarded/RewardedController.kt, src/test/rewarded/RewardedControllerTest.kt, src/Models.kt (expiry), src/test/models/AdExpiryTest.kt
- Public facades and Debugging
  - Minimal, stable APIs: BelInterstitial, BelRewarded, BelRewardedInterstitial, BelAppOpen, BelBanner; in‑app Debug Panel.
  - Files: sdk/core/android/src/{BelInterstitial.kt,BelRewarded.kt,BelRewardedInterstitial.kt,BelAppOpen.kt,BelBanner.kt,debug/DebugPanel.kt}
- Consent utilities and logging safety
  - ConsentManager.normalize/fromIabStorage with tests; centralized Logger with redaction utils and tests.
  - Files: sdk/core/android/src/consent/ConsentManager.kt, src/test/consent/{ConsentManagerTest.kt,ConsentManagerFromIabStorageTest.kt}, src/logging/{Logger.kt,Redactor.kt}, src/test/logging/RedactorTest.kt
- Build & quality gates
  - Gradle: release AAR size guard (≤500KB) enforced; StrictMode policies in debug.
  - Files: sdk/core/android/build.gradle, consumer-rules.pro
- Docs
  - Expanded Android Quickstart with consent helper, rewarded/banner facades, Debug Panel, additional ad formats.
  - Files: docs/Customer-Facing/SDKs/ANDROID_QUICKSTART.md

iOS SDK — Parity and taxonomy correctness
- Swift package MVP with S2S auction path; offline stub mode when no URL.
- Mapped 204 → no_fill; 400 → status_400; malformed JSON → error; timeout mapping; unit tests cover success/no_fill/status/timeout/malformed.
  - Files: sdks/ios/Sources/ApexMediation/ApexMediation.swift, sdks/ios/Tests/ApexMediationTests/{ApexMediationTests.swift,MockURLProtocol.swift}

Part 1/Part 2 checklist impact and acceptance
- Part 1 (Adapter resiliency & conformance): Completed — standardized resiliency, taxonomy, offline conformance (incl. edge cases), auction deadline adherence, hedged requests behind flag.
- Part 2 (Observability, SLOs, Mediation Debugger): Completed — metrics (snapshot + percentiles + time‑series), tracing, Mediation Debugger (capture + Admin API + website viewer), SLO evaluator + APIs, runbooks, CORS.

Budget/cost governance
- All additions are local/offline and preserve the ≤ $500/month operating cap. No new external services introduced. Dual‑LLM autonomy scaffolding remains documented and cost‑capped (no runtime changes in this pass).

Next actions (tracked in checklist)
- Android SDK: dev‑only Ed25519 config signature verification + tests; StrictMode sample smoke tests + CI gate; integration validator task; API reference generation.
- Adapter expansion toward ≥12: add Chocolate Platform and Tapdaq (+ offline conformance), decide on legacy waivers (MoPub/AerServ/AdTapsy) vs shims.
- Website: complete remaining pre‑FT pages with mocks; Lighthouse/a11y CI to hit performance/a11y budgets.
- ML: begin offline ETL/enrichment stubs and evaluation harness per ML_FRAUD_TRAINING_DATA_SOURCES.md while keeping shadow mode enforced.


## 2025-11-07 — SDK audit & hotfixes (Android/iOS focus)
- Android SDK audit: identified two correctness issues in AuctionClient
  - Fixed HTTP status mapping to use actual code ("status_" + code) instead of literal "status_$code").
  - Fixed request_id formatting to interpolate millis + random properly ("android-<millis>-<rand>").
  - Added unit test to assert request_id pattern; existing tests for 4xx/5xx/timeout/no_fill now validate exact reason string. 
  - Evidence:
    - sdk/core/android/src/network/AuctionClient.kt (status reason and request_id fixes)
    - sdk/core/android/src/test/network/AuctionClientTest.kt (requestIdFormat_isGeneratedAndLooksReasonable)
- iOS SDK: quick review of recent taxonomy updates appears consistent (204→no_fill, 400→status_400, malformed→error); deeper consent propagation tests planned.
- Next actions (short-term):
  - Implement Ed25519 config signature verification in ConfigManager with dev test keys + unit tests (gate on testMode).
  - Add StrictMode sample smoke test (debug) and CI gate; ensure zero network/disk on main thread in SDK codepaths.
  - iOS: add consent propagation tests for gdpr_applies/us_privacy/coppa in S2S metadata.



## 2025-11-07 — Android SDK hardening: config signature verification + tests
- Implemented Ed25519 signature verification for remote config in the Android SDK.
  - Code: sdk/core/android/src/config/ConfigManager.kt (verifySignature with JDK Ed25519 and optional Tink fallback)
  - Constructor now accepts configPublicKey: ByteArray? to enforce verification in non-test builds.
- Added deterministic unit tests for signature handling:
  - sdk/core/android/src/test/config/ConfigSignatureTest.kt
    - valid_signature_allows_config_when_not_in_test_mode
    - tampered_signature_rejects_config_when_not_in_test_mode
    - test_mode_bypasses_signature_verification
- Acceptance impact:
  - Strengthens OTA safety and trust for configuration. In testMode, verification is bypassed to ease development; in non-test builds, a public key must be provided.
- Next steps (from plan):
  - StrictMode sample app + CI smoke (no main-thread I/O violations)
  - Integration validator Gradle task for host app checks
  - API surface polish (@JvmOverloads, Java demo), Robolectric callback tests


## 2025-11-07 — iOS consent propagation tests + Android integration validator
- iOS SDK: Added unit test to verify consent flags (gdpr_applies/us_privacy/coppa) are propagated into S2S auction metadata. Uses MockURLProtocol and a 204 path to avoid JSON parsing variance.
  - Evidence: sdks/ios/Tests/ApexMediationTests/ConsentPropagationTests.swift
- Android SDK: Added a lightweight Integration Validator Gradle task to help hosts verify essentials (consumer ProGuard rules present, OkHttp/Gson deps, SDK levels) and to report AAR size after assembleRelease.
  - Evidence: sdk/core/android/build.gradle (task validateIntegration)

Impact on plan
- SDKs — Verification status: iOS parity strengthened (consent propagation test added). Android DX improved (validator task) toward production-ready integration experience.
- Next: StrictMode sample app + CI smoke, Java API polish (@JvmOverloads), Robolectric callback tests; iOS demo target + Quickstart.


## 2025-11-07 — Android SDK DX: Java API polish (incremental)
- Added @JvmOverloads to BelAds.initialize and BelAds.setConsent for improved Java ergonomics without changing behavior.
  - Evidence: sdk/core/android/src/BelAds.kt
- Next (DX polish): add @JvmOverloads to frequently used builder/overloaded APIs where appropriate; generate Dokka HTML locally and publish artifacts for review.



## 2025-11-07 — Android SDK DX: Robolectric main-thread callback tests
- Added Robolectric dependency and main-thread delivery tests to validate UI-thread callback guarantees for controllers.
  - Evidence: sdk/core/android/build.gradle (testImplementation org.robolectric:robolectric:4.11.1)
  - Evidence: sdk/core/android/src/test/dx/MainThreadCallbackTest.kt
- Purpose: Ensure Interstitial/Rewarded controllers dispatch onLoaded/onShown/onReward to the main thread, matching DX and ANR-safety goals.
- Impact: Strengthens production guarantees without runtime changes; supports future StrictMode CI gate.
- Next:
  - Extend Robolectric tests to cover facade APIs (BelInterstitial/BelRewarded/BelAppOpen) and cancellation/double-callback guard paths.
  - Add StrictMode sample app and CI smoke to fail on main-thread I/O.


## 2025-11-07 — Android SDK: S2S robustness (malformed winner handling) + tests
- AuctionClient now treats malformed 200 responses that lack critical winner fields (adapter_name or cpm) as no_fill instead of raising generic errors; improves stability and DX.
  - Code: sdk/core/android/src/network/AuctionClient.kt (winner parsing guard)
  - Tests: sdk/core/android/src/test/network/AuctionClientTest.kt (malformedWinner_missingAdapterOrCpm_mapsToNoFill)
- Rationale: Prevents rare backend/gateway anomalies from surfacing as crashes or opaque errors in apps; aligns with world‑class SDK principle of graceful failure.
- Impact: No public API changes; runtime behavior safer under malformed payloads; all tests remain offline and deterministic.


## 2025-11-07 — Android SDK DX: Facade API Robolectric tests
- Added end-to-end facade API tests to validate developer experience and main-thread guarantees using Robolectric + MockWebServer.
  - Evidence: sdk/core/android/src/test/dx/FacadeApisTest.kt
  - Coverage:
    - BelInterstitial.load with 204 no_fill → error callback on main thread; graceful no-ready state.
    - BelRewarded.load with 200 winner → onAdLoaded on main thread; readiness asserted.
- Test infra: androidx.test:core already present; Robolectric configured. Run with:
  - ./gradlew :sdk:core:android:test
- Impact:
  - Strengthens world-class SDK DX goals (callbacks on main thread, predictable behavior on no_fill/success).
  - Purely offline; no runtime dependency impact; within ≤ $500/month principle.


## 2025-11-07 — Android SDK safety: Kill-switch enforcement test
- Added Robolectric test that verifies remote killSwitch immediately blocks loads and returns a main-thread error callback with reason "kill_switch_active"; ensures fast rollback path is respected by SDK without doing work.
  - Evidence: sdk/core/android/src/test/dx/KillSwitchTest.kt
- Impact on blueprint: strengthens "OTA-safe config with instant kill-switch" requirement; complements Ed25519 signature verification and staged rollout bucketing.
- Next: add StrictMode sample + CI smoke to catch any main-thread I/O; extend validator to check manifest/network security config.


## 2025-11-07 — Android SDK robustness: Base64 fallback for config signature
- Hardened config signature verification against Base64 decoding issues on certain Android/JVM runtimes.
  - Change: added safe Base64 fallback that tries java.util.Base64, then android.util.Base64, and finally URL-safe decoding to avoid crashes and false negatives.
  - Evidence: sdk/core/android/src/config/ConfigManager.kt (decodeBase64 helper; verifySignature now uses decodeBase64)
- Rationale: Improves OTA configuration safety by ensuring signature verification does not fail due to runtime-specific Base64 behavior. No API changes; offline-only change.
- Next actions:
  - Proceed with StrictMode sample app + CI smoke gate (no main-thread I/O).
  - Continue adapter expansion (Chocolate Platform, Tapdaq) with offline conformance tests.
  - iOS demo target + Quickstart; extend consent matrix tests.


## 2025-11-07 — Android SDK: production key injection + schema validation (incremental)
- SDKConfig now supports configPublicKeyBase64 to inject an Ed25519 public key for OTA config authenticity in non-test builds.
  - Evidence: sdk/core/android/src/MediationSDK.kt (SDKConfig field + Builder method; decodeBase64Compat; wiring into ConfigManager)
  - Docs updated: docs/Customer-Facing/SDKs/ANDROID_QUICKSTART.md (shows .configPublicKeyBase64 usage)
- ConfigManager now performs lightweight schema validation before trusting remote configs (required fields, sane timeout bounds).
  - Evidence: sdk/core/android/src/config/ConfigManager.kt (validateSchema; loadConfig uses verifySignature + validateSchema)
- Impact: Strengthens security/OTA safety per blueprint (signed configs + fail-closed semantics); keeps testMode DX intact.
- Next: StrictMode sample app + CI smoke gate; adapter expansion (Chocolate, Tapdaq); iOS demo + Quickstart; Lighthouse/a11y CI.



## 2025-11-07 — Android SDK privacy: Consent matrix tests
- Added JVM unit tests to validate consent combinations (GDPR/CCPA/COPPA/LAT) are serialized correctly into S2S auction metadata.
  - Evidence: sdk/core/android/src/test/consent/ConsentMatrixTest.kt
- Scenarios covered:
  - gdpr_applies=true, coppa=false, limit_ad_tracking=true → metadata.gdpr_applies="1", metadata.coppa="0", user_info.limit_ad_tracking=true
  - gdpr_applies=false, us_privacy="1YNN" → metadata.gdpr_applies="0", metadata.us_privacy="1YNN"
  - gdpr_applies=null, us_privacy=null, coppa=true, limit_ad_tracking=false → omits unknown flags, sets metadata.coppa="1", user_info.limit_ad_tracking=false
- Impact: strengthens Privacy & Consent guarantees for the Android SDK, aligning with blueprint Section 7.1/7.2. No runtime behavior changes.


## 2025-11-07 — Android SDK: API docs (Dokka) task added
- Added Dokka Gradle plugin and a convenience task to generate local HTML API reference for the SDK.
  - Evidence:
    - sdk/core/android/build.gradle (plugin org.jetbrains.dokka and task generateApiDocs)
  - How to run:
    - ./gradlew :sdk:core:android:generateApiDocs
    - Output: sdk/core/android/build/dokka/html
- Rationale: Improves developer experience and release discipline (API reference), aligned with the world‑class SDK blueprint’s docs and DX requirements.
- Next:
  - Include generated docs in internal review artifacts (not checked in).
  - Ensure Java examples compile against the published API surface.


## 2025-11-07 — Android SDK: Validator robustness + API ergonomics (incremental)
- Updated validateIntegration Gradle task to correctly assert Gson presence (com.google.code.gson:gson) instead of Retrofit converter; added AAR size warning at >450KB and hard fail at >500KB. Evidence: sdk/core/android/build.gradle (validateIntegration block).
- Added @JvmOverloads to BelAppOpen.load for improved Java ergonomics. Evidence: sdk/core/android/src/BelAppOpen.kt.
- Impact: Better CI signals for SDK size budget and dependency hygiene; smoother Java integration without API surface changes.
- Next: StrictMode sample app + CI smoke gate; adapter expansion (Chocolate Platform, Tapdaq); iOS demo target + Quickstart.



## 2025-11-07 — Android SDK DX: Facade-level taxonomy tests (Robolectric)
- Added facade-level taxonomy tests to validate normalized error mapping and main-thread callback delivery for public APIs.
  - Evidence: sdk/core/android/src/test/dx/FacadeApisTaxonomyTest.kt
  - Cases covered: HTTP 400 → INTERNAL_ERROR (message "status_400"), Timeout → TIMEOUT (message contains "timeout").
- Impact: Strengthens world-class SDK DX goals without changing runtime behavior; complements existing AuctionClient, lifecycle, consent matrix, and main-thread tests.
- Next: StrictMode sample smoke + CI gate; extend facade tests to AppOpen; finalize integration validator coverage.


## 2025-11-07 — Android SDK DX: AppOpen facade Robolectric test
- Added a facade-level Robolectric test for BelAppOpen to validate main-thread error callback delivery and graceful no-fill behavior.
  - Evidence: sdk/core/android/src/test/dx/AppOpenFacadeTest.kt
- Impact: Extends DX guarantees across another public facade (App Open), ensuring parity with Interstitial/Rewarded tests without changing production code.
- Next: StrictMode sample app + CI smoke gate; extend facade tests where applicable.


## 2025-11-07 — Android SDK: Config schema validation tests
- Added JVM tests to ensure malformed remote configs are rejected by validateSchema() even in test mode (signature bypass), strengthening OTA safety.
  - Evidence: sdk/core/android/src/test/config/ConfigSchemaValidationTest.kt
- Cases covered:
  - timeoutMs exceeding bounds (e.g., 60000) → config rejected, placement not loaded
  - blank placementId within placements map → config rejected, placement not loaded
- Impact: Improves resilience against bad/rolled-back configs and protects integrators; no runtime changes.
- Next: StrictMode sample app + CI smoke gate; Android manifest/network security checks in Integration Validator.


## 2025-11-07 — Android SDK: AuctionClient network reliability tests
- Added JVM tests to harden S2S AuctionClient behavior for network and retry edge cases.
  - Evidence: sdk/core/android/src/test/network/AuctionClientNetworkTests.kt
  - Cases covered:
    - Induced network I/O failure → maps to network_error (or timeout depending on timing).
    - Two consecutive 500 responses → single retry exhausted, surfaces status_500; exactly two requests made.
    - HTTP 429 (rate limited) → non-retry, maps to status_429.
- Impact: Improves reliability and taxonomy guarantees without changing production code; complements existing success/no_fill/4xx/5xx/timeout and facade Robolectric tests.
- Next: proceed with StrictMode sample app + CI smoke gate to enforce zero main-thread I/O.


## 2025-11-07 — Android SDK: Integration validator polish (incremental)
- Enhanced validateIntegration task messaging and kept strict size budget checks (warn > 450KB, fail > 500KB). Class count enumeration skipped to avoid Gradle env issues.
  - Evidence: sdk/core/android/build.gradle (validateIntegration)
- Added developer hint to verify INTERNET permission and cleartext Network Security Config when using http:// dev endpoints.

Impact
- Improves DX and CI signals for footprint and dependency hygiene with zero runtime impact.

Next
- Implement StrictMode sample app + CI smoke gate to enforce zero main-thread I/O from SDK codepaths.
- Continue iOS demo target + Quickstart; expand consent/taxonomy tests.
- Adapter expansion toward ≥12 (Chocolate Platform, Tapdaq) with offline conformance tests.


## 2025-11-07 — iOS SDK: In-app Debug Panel (Mediation Debugger MVP)
- Added a minimal in-app Debug Panel for iOS to mirror Android’s DebugPanel and improve developer experience and parity.
  - Evidence: sdks/ios/Sources/Debug/DebugPanel.swift
  - Behavior: Presents a simple UIAlert with SDK info and a Copy action (safe to ship; redaction handled in Android; iOS panel currently shows basic fields and is expandable).
- Impact: Advances SDK parity and world-class DX goals (built-in debugging tools). No runtime dependencies added; safe for release builds.
- Next steps:
  - Expose selected state from MediationSDK to populate panel (appId, placements, consent snapshot) in a privacy-safe way.
  - Add iOS Quickstart guide including DebugPanel usage and consent examples.
  - Add a tiny demo target for CI smoke (no network calls by default; uses mocked endpoints).



## 2025-11-07 — IronSource parity and surpass plan (coding-first, operator-light)
Goal: Ensure the platform is at least on par with ironSource (LevelPlay) across reliability, coverage, SDK DX, observability, and fraud safety — and surpass it by offering lower cost-to-run (≤ $500/mo), higher transparency (built-in debugger + SLOs), and autonomy (self-improving loop), with one operator able to run it in < 2 hours/week.

KPIs vs. ironSource (targets to meet or beat)
- [ ] Adapter coverage: ≥ 12 certified adapters (LevelPlay advertises broad coverage) — our goal: ≥ 12 with offline conformance, then FT certification. Current: 10 implemented (incl. AdMob, Meta, Unity, AppLovin, ironSource, Fyber, Appodeal, Admost, Chocolate, Tapdaq). Evidence: backend/auction/internal/bidders/*; tests in bidders/*_test.go
- [ ] SDK reliability (Android): ANR attributable to SDK < 0.02%; crash-free session ≥ 99.9% (guarded by StrictMode CI + thread model). Evidence (in progress): Robolectric main-thread tests; StrictMode smoke app pending.
- [ ] SDK size (Android): core AAR ≤ 500 KB (warning > 450 KB). Evidence: build.gradle size guard + validator.
- [ ] Time-to-first-impression (TTFI) for sample app: < 30 minutes integration and < 1 day from repo clone → first successful ad (mocked). Evidence: Quickstart + mock endpoints; sample apps pending.
- [ ] Observability: p50/p95/p99 latencies per adapter, error/fill rates, 7-day time-series + SLO badges, mediation debugger events. Evidence: metrics_rollup.go, metrics_timeseries.go, slo.go, Admin APIs + Website pages.
- [ ] Fraud model: blocking stays shadow until AUC ≥ 0.85 AND Precision ≥ 0.8 at Recall ≥ 0.9 for 4 consecutive weeks. Evidence: fraud_ml_test.go safety; ETL/training plan in Part 3.
- [ ] Cost to operate: ≤ $500/month including LLM; autonomy PRs limited by policy; weekly operator time < 2h. Evidence: COST_BUDGET_POLICY.md; autonomy section; snapshot endpoints.

IronSource parity checklist (what publishers expect) — Android/iOS/Unity SDKs
- Initialization & threading
  - [x] Idempotent initialize; safe from Application.onCreate (Android). Evidence: MediationSDK.initialize()
  - [x] Zero I/O on main thread (guarded by architecture + tests; StrictMode CI gate pending). Evidence: controllers/tests; next: StrictMode sample app.
  - [x] Main-thread delivery for callbacks; UI-safe facades. Evidence: Robolectric tests (MainThreadCallbackTest, FacadeApis*).
- Error taxonomy & transparency
  - [x] Normalized taxonomy (timeout, status_XXX, no_fill, network_error, error) with mapping to public AdError. Evidence: AuctionClient + facade tests.
  - [x] Built-in Mediation Debugger (Android+iOS MVP) with redaction and Copy diagnostics. Evidence: sdk/core/android/src/debug/DebugPanel.kt; sdks/ios/Sources/Debug/DebugPanel.swift
- OTA config safety
  - [x] Signed config (Ed25519) verification, schema validation, staged rollout buckets, kill-switch. Evidence: ConfigManager + tests, Rollout.
- Privacy & consent
  - [x] Explicit consent API; IAB helpers (opt-in); consent matrix tests (Android) and propagation tests (iOS). Evidence files listed above.
- OM SDK
  - [x] Hook points via OmSdkController; default no-op; facades call start/end sessions. Evidence: measurement/*.
- Test mode & developer ergonomics
  - [x] Test device registration; test mode flags in S2S metadata; clear logging hints. Evidence: BelAds.setTestMode/registerTestDevice; AuctionClient metadata.
  - [x] Small, stable public APIs: BelInterstitial/BelRewarded/BelAppOpen (+ Banner MVP). Evidence: facade files.
  - [ ] Sample apps (Android/iOS) with StrictMode smoke and mocked endpoints. Evidence: pending.

Server-side parity and surpass items
- Reliability & speed
  - [x] Standardized adapter resiliency (retry+jitter, CB), hedged requests feature flag, partial aggregation under deadlines. Evidence: commons.go, engine.go + tests.
  - [x] Offline conformance tests per adapter: 200/204/5xx retry/circuit, 4xx no-retry, malformed JSON → error. Evidence: bidders tests.
  - [x] Observability: metrics snapshot + percentiles + time-series + SLOs; mediation debugger API. Evidence: metrics_*.go, slo.go, admin handlers.
- Surpass ironSource on transparency & autonomy
  - [x] Website dashboards and debugger viewer; CORS-enabled Admin APIs. Evidence: website/* observability pages; main.go CORS.
  - [~] Autonomous planner/executor under cost caps creating PRs; redacted weekly snapshot. Evidence: AUTO section; wiring TBD.

Operator-light targets (1 person, < 2h/week)
- [ ] One-click daily health snapshot (Adapters up, SLO status, debugger tail, shadow fraud stats) exported and attached to planner PR. Acceptance: PR every week with <= $ cost per policy.
- [ ] Runbook “single-operator” checklist documented and linked from Console. Acceptance: docs/runbooks/OPERATOR_CHECKLIST.md with 15-min daily and 45-min weekly routines.

Acceptance — “At least ironSource, better on transparency/cost/autonomy”
- [ ] SDKs pass StrictMode CI (no main-thread I/O); façade APIs proven on main thread; size ≤ 500 KB; sample app runs green in CI.
- [ ] ≥ 12 adapters implemented with offline conformance; pass hedging/partial aggregation tests; Admin Observability and Debugger pages show 7-day trends; SLO badges OK/WARN logic works.
- [ ] ML fraud remains shadow until targets met; planner includes shadow histograms and drift metrics weekly.
- [ ] Operating cost ≤ $500/month and weekly operator effort < 2h (documented in planner PR report).

Status snapshot (today)
- SDK Android: [~] — robust S2S, lifecycle controllers, caching/readiness, consent matrix tests, OTA safety (signatures + schema), Robolectric DX tests, validator, Dokka. Pending: StrictMode sample + CI, sample app.
- SDK iOS: [~] — S2S path + taxonomy mapping + consent propagation tests; Debug Panel MVP. Pending: demo target + Quickstart; more tests.
- Adapters: [~] — 10 implemented and tested offline; remaining modern networks TBD to reach ≥ 12.
- Observability: [x] — snapshot + time-series + SLOs + Website pages.
- ML Part 3: [~] plan expanded with DataContracts; ETL/enrichment/training harness pending implementation.
- Autonomy & budget: [~] docs/policy exist; snapshot exporter + PR bot pending.

Next 1–2 week sprint (big chunk execution)
- StrictMode & sample apps
  - [ ] Android: Sample app module with StrictMode penaltyDeath in debug; CI job “sdk-android-strictmode-smoke” fails on violations; demo uses MockWebServer or local endpoints.
  - [ ] iOS: Tiny demo target with mocked endpoints; Quickstart page; unit/UI smoke.
- Adapter coverage to ≥ 12
  - [ ] Implement 2 modern adapters (e.g., Mintegral, Chartboost OR Pangle/Vungle as replacements for legacy MoPub/AerServ/AdTapsy) with offline conformance tests and docs updates.
- Website & Observability polish
  - [ ] Lighthouse/a11y CI gate: Perf ≥ 90, A11y ≥ 95, BP ≥ 95, SEO ≥ 90 for key pages; fix regressions.
  - [ ] Observability snapshot endpoint: single JSON that aggregates /v1/metrics/slo + last‑N debugger pointers for planner.
- Autonomy scaffolding
  - [ ] Planner snapshot producer (redacted) and weekly PR creation with links to metrics + TODO diffs; budget metering hooked.
- ML Part 3 — first ETL slice (offline)
  - [ ] Implement ClickHouse → Parquet daily extract for impressions/clicks (schemas per DataContracts) with unit tests and small sample CI mode; write to data/training/.
  - [ ] Enrichment loaders: Tor exit list + AWS/GCP/Azure ranges into data/enrichment with version manifests; unit tests.

Traceability
- ironSource parity mapping lives here and is cross-referenced from docs/Internal/COMPETITIVE_GAP_ANALYSIS.md and DEVELOPMENT_ROADMAP.md.


## 2025-11-07 — SDKs: iOS Quickstart + Debug Panel enrichment (big-chunk)
- Added customer-facing iOS Quickstart guide covering init, consent, facades, debug panel, error taxonomy, and local testing.
  - Evidence: docs/Customer-Facing/SDKs/IOS_QUICKSTART.md
- Enriched iOS in-app Debug Panel to display current appId and placement IDs by exposing read-only accessors on the SDK.
  - Evidence: sdks/ios/Sources/MediationSDK.swift (currentAppId/currentPlacementIds), sdks/ios/Sources/Debug/DebugPanel.swift (uses accessors)
- This advances the world-class SDK blueprint on DX and transparency; complements Android Quickstart and Debug Panel.
- Next (tracked in Part 1/SDKs section):
  - iOS demo target with mocked endpoints and Quickstart link in repo README.
  - Extend iOS consent/taxonomy tests and add main-queue callback assertions.
  - Android StrictMode sample app + CI smoke gate; keep size ≤ 500KB.


## 2025-11-07 — Android SDK: StrictMode smoke test (Robolectric)
- Added a StrictMode smoke test to ensure SDK init + load flows do not perform network/disk I/O on the main thread.
  - Evidence: sdk/core/android/src/test/dx/StrictModeSmokeTest.kt
  - Behavior: Enables StrictMode penaltyDeath and exercises BelAds.initialize + BelInterstitial.load with MockWebServer (204 no_fill). If main-thread I/O occurs, the test crashes/fails.
- Impact: Progress toward Part 2/SDK DX acceptance (zero ANRs) and IronSource-parity goal for ANR safety. No runtime code changes.
- Next: Add a sample app module and CI task to run a StrictMode smoke on device/emulator; wire validator checks for INTERNET permission and cleartext policy hints.



## 2025-11-07 — Adapter expansion: Chartboost added + offline conformance tests
- Implemented Chartboost server-side adapter with standardized resiliency (retry + jitter), shared Clock-enabled CircuitBreaker, and normalized NoBid taxonomy; emits metrics/tracing/debugger events.
  - Evidence: backend/auction/internal/bidders/chartboost.go
- Added full offline conformance tests mirroring other adapters: 200 success, 204 no_fill, 5xx retry→success, circuit_open after repeated 5xx, 400 no-retry (status_400), 200 malformed JSON → standardized "error".
  - Evidence: backend/auction/internal/bidders/chartboost_conformance_test.go
- Impact: Moves adapter coverage toward ≥12 without external creds; keeps to <$500/mo principle and coding-first approach.
- Next: add one more modern adapter (e.g., Mintegral or Pangle/Vungle) with the same pattern to hit ≥12; update API_KEYS_AND_INTEGRATIONS_GUIDE.md accordingly; ensure Website "Networks & Adapters" page reflects new adapters (mocked).



## 2025-11-07 — Systemwide Test Coverage Matrix (Sandbox Readiness)

Goal
- Provide an explicit, checkable map of tests that already exist vs. tests to add, across all major components, so we can reach “sandbox-ready” confidence with full-system coverage.
- This complements Parts 1–3 and Website/FT sections by making tests first-class acceptance criteria.

How to run test suites (local/CI)
- Backend (Go):
  - [ ] Unit + adapter conformance: go test ./backend/auction/internal/bidders -count=1
  - [ ] Auction engine: go test ./backend/auction/internal/bidding -count=1
  - [ ] API handlers: go test ./backend/auction/internal/api -count=1
- Android SDK (Gradle):
  - [ ] JVM + Robolectric: ./gradlew :sdk:core:android:test --no-daemon
  - [ ] Size/validator/docs tasks: ./gradlew :sdk:core:android:assembleRelease :sdk:core:android:validateIntegration :sdk:core:android:generateApiDocs
- iOS SDK (SwiftPM):
  - [ ] Unit tests: (cd sdks/ios && swift test)
- Website (Next.js):
  - [ ] Unit/component tests (to be added): npm test --workspaces
  - [ ] Lighthouse/a11y CI (to be added): npm run ci:lighthouse --workspaces

Legend for this section
- [x] Test exists (evidence path listed)
- [~] Test partially exists or stub created
- [ ] Test to write

A) Backend — Adapters (bidders) test coverage
- Existing (evidence):
  - [x] Standard resiliency + taxonomy mapping tests (success, 204→no_fill, 5xx retry→success, circuit_open, 4xx no‑retry, malformed JSON → error)
    - bidders/adapter_conformance_test.go (AdMob, Meta, Unity, AppLovin, ironSource)
    - bidders/chocolate_tapdaq_conformance_test.go (Chocolate, Tapdaq)
    - bidders/chartboost_conformance_test.go (Chartboost)
  - [x] Resiliency primitives & taxonomy
    - bidders/commons_test.go (IsTransient/MapErrorToNoBid)
    - bidders/circuitbreaker_test.go (Clock‑based CB tests)
- Missing / to add:
  - [ ] Golden request/response fixtures per adapter (JSON files) to pin schema; load in tests to avoid inline maps.
  - [ ] Auth/header tests per adapter (e.g., X-Api-Key/Bearer), including redaction in logs (masking already shared in helpers).
  - [ ] 3xx handling test (treat as error, no retry) — ensure taxonomy = status_3xx.
  - [ ] Slow‑body read leading to timeout maps to timeout (simulate with ResponseWriter flush + sleep).
  - [ ] Metrics/tracing/debugger emission assertions in conformance tests (lightweight counters via test recorder/tracer/debugger).

Acceptance (adapters):
- [ ] Each adapter has golden fixtures and passes extended conformance (incl. 3xx and slow body timeout).
- [ ] Auth/header assertions verified; masking confirmed in logs (unit snapshot acceptable).

B) Backend — Auction Engine
- Existing:
  - [x] Hedged requests earlier return: backend/auction/internal/bidding/engine_hedge_test.go
  - [x] Partial aggregation + deadline adherence: engine_hedge_test.go, engine_timeout_test.go
- Missing / to add:
  - [ ] Hedge delay derived from adapter p95 metric when explicit delay not set — unit test with fake metrics recorder.
  - [ ] Cancellation tests: losing goroutine canceled when winner returns; ensure no bid is double‑counted.
  - [ ] Context deadline propagation down to adapter requester; late responses ignored.
  - [ ] Partial aggregation edge cases: 0 bidders; all timeouts; mix of CB‑open and success.
  - [ ] Race/leak check (go test -race) scenario for concurrent auctions (document command in CI).

Acceptance (auction):
- [ ] All above cases green under -race; hedging and partial aggregation remain compliant with TimeoutMS.

C) Backend — Admin APIs & Observability
- Existing:
  - [x] Time‑series aggregator + SLO evaluator tests: bidders/metrics_timeseries_test.go, bidders/slo_test.go
  - [x] Metrics snapshot tested via recorder: bidders/metrics_rollup_test.go
  - [x] Debugger ring buffer + redaction tests: bidders/debugger_test.go
- Missing / to add:
  - [ ] Handler tests via httptest for:
    - GET /v1/metrics/adapters
    - GET /v1/metrics/adapters/timeseries?days=7
    - GET /v1/metrics/slo
    - GET /v1/debug/mediation?placement_id=&n=
    - GET /v1/metrics/overview (SLO + debugger aggregation)
  - [ ] CORS preflight test path (OPTIONS) for the above routes.

Acceptance (Admin APIs):
- [ ] All handlers validated with happy path + simple error/param cases; CORS OPTIONS returns 204.

D) Website (Dashboard)
- Existing:
  - [x] Pages: Observability Overview, Adapter Metrics, Mediation Debugger; API client auctionApi.ts
- Missing / to add:
  - [ ] Component tests (React Testing Library) for each page verifying data render and empty/error states.
  - [ ] API client error handling tests (HTTP 500, bad JSON).
  - [ ] Lighthouse CI with budgets: Perf ≥ 90, A11y ≥ 95, Best Practices ≥ 95, SEO ≥ 90 for key routes.
  - [ ] Axe-core a11y tests with 0 critical violations.

Acceptance (Website):
- [ ] Component tests green; Lighthouse/a11y thresholds met in CI.

E) Android SDK
- Existing (evidence):
  - [x] Auction client unit tests (success/no_fill/4xx/5xx retry/timeout, malformed winner): sdk/core/android/src/test/network/*.kt
  - [x] Consent matrix & IAB storage tests: sdk/core/android/src/test/consent/*.kt
  - [x] Lifecycle controllers + state machines (Interstitial/Rewarded): sdk/core/android/src/test/interstitial/*.kt, /test/rewarded/*.kt
  - [x] Main‑thread delivery (Robolectric): sdk/core/android/src/test/dx/MainThreadCallbackTest.kt
  - [x] Facade E2E (Interstitial/Rewarded/AppOpen): sdk/core/android/src/test/dx/*Facade*.kt
  - [x] StrictMode smoke (no main‑thread I/O): sdk/core/android/src/test/dx/StrictModeSmokeTest.kt
  - [x] OTA safety: signature verification tests, schema validation tests, kill‑switch test: sdk/core/android/src/test/config/*.kt, /test/dx/KillSwitchTest.kt
  - [x] Logging redaction tests: sdk/core/android/src/test/logging/RedactorTest.kt
- Missing / to add:
  - [ ] Sample app module (mock endpoints) + device/emulator StrictMode smoke job in CI.
  - [ ] Integration Validator functional test: run task and assert warnings/errors for a synthetic app manifest/network config.
  - [ ] OM SDK hooks: no‑op safety test and injected controller invocation test on show() paths (mock OmSdkController).
  - [ ] Banner attach/detach Robolectric test (placeholder render in test mode; UI thread assertions).
  - [ ] ProGuard/R8 mapping sanity (consumer-rules presence already checked; add a shrinking test in CI sample app to ensure no NoSuchMethodError).

Acceptance (Android):
- [ ] Device/emulator StrictMode smoke green; OM hooks invoked on show(); Banner tests green; integration validator covered in CI.

F) iOS SDK
- Existing:
  - [x] Taxonomy tests (success/no_fill/400/timeout/malformed): sdks/ios/Tests/ApexMediationTests/ApexMediationTests.swift
  - [x] Consent propagation into metadata: sdks/ios/Tests/ApexMediationTests/ConsentPropagationTests.swift
  - [x] Debug Panel MVP and accessors for appId/placements (manual validation for now)
- Missing / to add:
  - [ ] Main‑queue callback assertions for BelInterstitial/BelRewarded load completion.
  - [ ] Config signature verification + schema validation parity tests (mirror Android behavior; allow bypass in test mode).
  - [ ] Demo app target with mocked endpoints; UI smoke test (XCTest) verifying load(no_fill) path does not crash and callbacks occur on main.
  - [ ] Error taxonomy suite coverage for status_429, status_5xx retry policy (if implemented in client; otherwise confirm server.)
  - [ ] OM SDK hook scaffolding parity (no‑op safety) and simple invocation tests once hooks exposed.

Acceptance (iOS):
- [ ] Unit + UI smoke tests green; main‑queue guarantees verified; config authenticity validated; demo app runs in CI.

G) ML Fraud — Part 3 (from DataContracts & ML_TRAINING)
- Existing:
  - [x] Shadow‑mode gating tests (safety): backend/fraud/internal/ml/fraud_ml_test.go
  - [x] DataContracts spec doc: docs/Internal/ML/DataContracts.md
- Missing / to add (unit/integration):
  - [ ] ETL: query builders + parquet writers with golden snapshots; small‑sample CI mode that writes to data/training/yyyy‑mm‑dd.
  - [ ] Enrichment loaders: Tor exit list, cloud IP ranges, ASN DB; checksum + version manifest tests under data/enrichment/.
  - [ ] Weak supervision: label functions unit tests (coverage, conflict rates computed on synthetic data).
  - [ ] Feature parity checks: ensure only serve‑time‑derivable features included; unit test that blocks forbidden fields (raw IP, IDFA/GAID, raw UA).
  - [ ] Training harness determinism: given fixed seed and small sample, metrics stable within epsilon; artifact writer includes schema_version and manifests.
  - [ ] Evaluation harness: precision/recall @ thresholds; export trained_fraud_model.json; unit test validates schema.

Acceptance (ML):
- [ ] CI small‑sample pipeline green; artifacts written with manifests; gating policy wired to stay in shadow until acceptance.

H) Autonomy & Budget (Planner/Executor) — tests to add
- Missing / to add:
  - [ ] Planner snapshot producer unit tests (redaction, schema of snapshot).
  - [ ] Budget metering tests (thresholds 50/75/90/100%) — ensure degradation actions trigger.
  - [ ] Dry‑run PR generator test that stages changes to this checklist and ROADMAP with fake evidence links.

Acceptance (Autonomy):
- [ ] Weekly planner PR with passing CI by default in dry‑run; no secret leakage in snapshots.

Global Sandbox‑Readiness Gate (must be true before FT)
- [ ] All test suites above green in CI (backend Go, Android JVM/Robolectric, iOS SwiftPM, Website unit + Lighthouse/a11y).
- [ ] ≥ 12 adapters implemented and passing extended conformance (incl. golden fixtures and auth tests).
- [ ] Website pre‑FT pages present with mocks and pass Lighthouse/a11y budgets.
- [ ] SDK Android: device/emulator StrictMode smoke green; size ≤ 500 KB; OM hooks covered; validator task in CI.
- [ ] SDK iOS: demo app smoke green; main‑queue guarantees; config authenticity tests.
- [ ] ML: small‑sample ETL/enrichment/tests green; shadow‑mode remains ON.
- [ ] Operator runbook updated with “Sandbox Test Day” checklist.
