# Competitive Gap Analysis – ApexMediation vs. Leading Mediation Platforms

Date: 2025-11-06
Owner: Platform Architecture
Status: Draft v1 (for internal planning; not customer-facing)

---

## Purpose
Provide an evidence-driven comparison between ApexMediation and leading ad mediation platforms (AppLovin MAX, ironSource LevelPlay, Google AdMob Mediation, Unity Mediation; plus legacy MoPub reference). Identify exactly:
- What is expected of mediation platforms in 2025.
- Where we are ahead, on-par, or behind.
- Concrete, prioritized actions to close and exceed gaps.
- Acceptance criteria and success metrics to verify closure.

---

## Competitor Set and Sources
- AppLovin MAX (MAX)
- ironSource LevelPlay (IS)
- Google AdMob Mediation (AdMob)
- Unity LevelPlay/Mediation (Unity)
- Legacy reference: MoPub (for historical expectations and SDK ergonomics)

Sources: Public documentation, SDK guides, feature pages, case studies, developer communities, and prior industry experience. This document guides our internal roadmap; it is not a marketing comparison.

---

## Expected Capabilities Matrix (2025 Baseline)

1) Mediation Core
- Ad formats: banner, MREC, interstitial, rewarded, rewarded interstitial, native.
- Auction: waterfall, header bidding (in-app bidding), hybrid.
- Real-time optimization: dynamic floors, per-geo/device floors, A/B/n testing, pacing/capping, eCPM decay.
- Network coverage: 15–30 certified adapters minimum; top-10 must-have.
- OpenRTB or vendor-native schema mapping; consent propagation.

2) Reliability & Scale
- Tight timeouts, hedged requests, partial results, adapter circuit breakers, retries with jitter.
- Backpressure, request collapsing, and safe fallbacks.
- SLA/SLO targets (p99 latency per adapter; fail-fast within auction deadline).

3) Observability & Ops
- Per-adapter metrics: latency, error, fill, win-rate, eCPM distribution; traces; structured logs.
- Alerting on SLO breaches; rate limiting; traffic shaping.
- Mediation debugger: per-request timeline, headers, payload diffs.

4) Developer Experience
- Clear SDKs (Android/iOS/Web/Unity), sample apps, quick-starts, integration linting.
- Sandbox credentials & conformance packs; CI-friendly mocks.
- Backward-compatible releases and migration guides.

5) Privacy & Compliance
- IAB TCF 2.x, CCPA/CPRA, COPPA; ATT prompts and propagation; SKAdNetwork 4.0+ support.
- Data minimization and PII controls; consent matrix tests.

6) Analytics & Revenue Intelligence
- Real-time dashboards, cohort/LTV, ARPDAU, retention overlays; per-placement A/B experiments.
- Revenue reconciliation, invalid traffic surfaced, refund workflows.

7) Fraud & Quality
- Hybrid rules + ML; device/IP/UA signals; creative/domain quality filters; supply path validation.
- Explainability and appeal workflow; shadow/canary deployments; drift monitoring.

---

## Where We Stand Today

Highlights (from SYSTEM_AUDIT_SUMMARY.md and code):
- Auction engine: robust; supports header bidding, waterfall, hybrid.
- Adapters: 5 in-repo (AdMob, Meta, Unity, AppLovin, ironSource placeholder). Not yet certified.
- Reliability: Retries + circuit breakers implemented for Unity/AppLovin; others pending.
- Observability: Logging present; adapter metrics and tracing not yet implemented.
- SDKs: Present across platforms; require E2E validation and sample apps.
- Privacy: Consent fields propagated; formal compliance tests not present.
- Analytics: Schemas present; ingestion/runtime validation and dashboards incomplete.
- Fraud ML: Architecture complete, current model ineffective; shadow-mode safeguard enabled.

---

## Gap Analysis vs. Competitors

1) Network Coverage
- Competitor: 20–30+ certified networks with official partnerships.
- Ours: 5 implemented, unverified. Gap: High (P0).
- Actions:
  - Secure sandbox creds for Top 10 networks; implement conformance tests.
  - Target 12 certified adapters in 12 weeks; publish compatibility matrix.
- Success: 95% conformance test pass rate; production pilots on 3 networks.

2) Reliability Patterns
- Competitors ship retries, circuit breakers, hedged requests, partial results.
- Ours: Added to Unity/AppLovin; missing for AdMob/Meta/ironSource. Gap: High (P0).
- Actions:
  - Apply standardized resiliency middleware across all adapters.
  - Add hedged requests for slow adapters; partial bid aggregation.
- Success: Auction timeouts honored at p99; <1% adapter-induced auction overruns.

3) Observability and SLOs
- Competitors: rich per-adapter metrics and mediation debugger.
- Ours: Logs only. Gap: High (P0).
- Actions:
  - Export metrics: latency/fill/error/win-rate; OpenTelemetry tracing; SLO alerts.
  - Build mediation debugger UI and redaction rules.
- Success: Dashboards with p50/p95/p99 latency; alert runbooks; weekly SLO reports.

4) Optimization & Experimentation
- Competitors: A/B/n, Thompson Sampling, eCPM decay, dynamic floors, pacing.
- Ours: Basic hooks; limited implementation. Gap: Medium (P1).
- Actions:
  - Implement real-time eCPM decay and per-geo/device floors.
  - Add bandit experimentation framework and pacing/capping.
- Success: +5–10% eCPM uplift in controlled tests vs. baseline.

5) Developer Experience
- Competitors: polished SDKs, sample apps, sandbox packs.
- Ours: SDKs exist; sample apps missing; integration lint absent. Gap: Medium (P1).
- Actions:
  - Create Android/iOS/Unity sample apps; add integration linter.
  - Provide sandbox packs and CI mocks.
- Success: Time-to-first-impression < 1 day for new devs.

6) Privacy & Compliance
- Competitors: Full consent propagation, SKAN 4.0+, audit trails.
- Ours: Partial support. Gap: Medium (P1).
- Actions:
  - Consent matrix tests; SKAN postback parsing; compliance CI gates.
- Success: Quarterly privacy audit pass; zero blocker findings.

7) Analytics & Revenue Intelligence
- Competitors: Strong dashboards and reconciliation.
- Ours: Schemas only; UI and reconciliation missing. Gap: Medium (P1/P2).
- Actions:
  - Implement ingestion verification, cohort/LTV dashboards, revenue reconciliation hooks.
- Success: Near real-time dashboards (<5m lag); publisher-visible.

8) Fraud & Quality
- Competitors: Mature ML + vendor partnerships; explainability; appeals.
- Ours: ML architecture but ineffective model; no vendor adjudication integration. Gap: High (P0).
- Actions:
  - Build labeled data pipeline (see ML_FRAUD_TRAINING_DATA_SOURCES.md), add explainability and appeal workflow.
- Success: AUC ≥0.85, Precision ≥0.8 at Recall ≥0.9 (offline); stable shadow-mode online.

---

## Prioritized Gap Closure Plan

P0 (0–6 weeks)
- Adapter conformance tests + resiliency middleware across all adapters.
- Metrics/tracing/SLOs; mediation debugger (MVP).
- ML: shadow-mode enforced; build labeled data pipeline; offline eval harness.

P1 (6–12 weeks)
- Dynamic floors, eCPM decay, pacing/capping; A/B/n bandits.
- SDK sample apps + integration linter; sandbox packs.
- Privacy test matrix + SKAN integration.

P2 (12–20 weeks)
- Expand adapters to 12+; add reconciliation workflows.
- Analytics dashboards (cohort/LTV); developer portal polish.

---

## Acceptance Criteria & KPIs
- Adapters: ≥12 certified, p99 latency < 250ms per adapter, ≥99.9% auction deadline adherence.
- Observability: Dashboards live; SLO alerts wired; MTTR < 30m for adapter outages.
- Optimization: +7% median eCPM uplift in A/B compared to static floors.
- Privacy: All consent flows validated in CI; SKAN postbacks parsed with >99% success.
- Fraud ML: Offline targets (AUC ≥0.85, Prec ≥0.8 @ Rec ≥0.9); online shadow lift detection; zero hard-block until targets met.

---

## Risks & Mitigations
- Adapter API changes: mitigate with contract tests and nightly canaries.
- Data sparsity for ML: use weak supervision, enrichment feeds, and vendor adjudication samples.
- Compliance drift: automated test matrix and quarterly audits.

---

## Deliverables
- This document (kept current).
- Conformance test suites per adapter.
- Mediation debugger and metrics dashboards.
- ML data source and training pipeline design (separate doc).
