# Code Quality Review — 2025-11-08

Author: Platform Engineering (Autonomy)
Scope: Review the quality of code and docs added on 2025-11-08. Reference the evidence recorded for today in DEVELOPMENT_TODO_CHECKLIST.md and provide actionable improvements.

---

## Sources and Evidence (as recorded in DEVELOPMENT_TODO_CHECKLIST.md for 2025-11-08)
- SDKs (Android) — Facades, OM SDK hooks, size gate, validator, API docs
  - Evidence paths (see checklist section “2025-11-08 — SDKs (Android): Facades, OM SDK hooks, size gate, validator, and API docs”):
    - sdk/core/android/src/BelInterstitial.kt
    - sdk/core/android/src/BelRewarded.kt
    - sdk/core/android/src/BelRewardedInterstitial.kt
    - sdk/core/android/src/BelAppOpen.kt
    - sdk/core/android/src/BelBanner.kt
    - sdk/core/android/src/measurement/OmSdkController.kt, OmSdkRegistry
    - sdk/core/android/src/test/dx/OmSdkHooksTest.kt
    - sdk/core/android/src/test/dx/FacadeApisTest.kt
    - sdk/core/android/src/test/dx/AppOpenFacadeTest.kt
    - sdk/core/android/build.gradle (tasks: checkSdkSize, validateIntegration, generateApiDocs)

- System analysis and Sandbox Readiness doc
  - Evidence (checklist section “2025-11-08 — System analysis and SDKs Sandbox Readiness doc added”):
    - docs/Internal/Development/SYSTEM_ANALYSIS_2025-11-08.md
    - docs/Customer-Facing/SDKs/SANDBOX_READINESS.md
    - docs/Customer-Facing/SDKs/INDEX.md (Sandbox Readiness section)

---

## Assessment — Android SDK code and build tasks

Strengths
- API surface: Facades (Interstitial, Rewarded, RewardedInterstitial, AppOpen, Banner) present a small, stable interface consistent with the SDK Focus Plan’s principles. Public API naming appears consistent and discoverable.
- Measurement correctness: OM SDK hooks are invoked in show() paths and covered by Robolectric tests (OmSdkHooksTest). This reduces regression risk around measurement sessions.
- Developer ergonomics and guardrails: Gradle tasks add real value.
  - checkSdkSize enforces a clear AAR budget with logging and hard fail > 500 KB.
  - validateIntegration prints evidence, warns near budget, and reminds about INTERNET permission/cleartext policy.
  - generateApiDocs makes local API review trivial.
- DX tests: Facade callbacks for Interstitial/AppOpen no_fill and Rewarded load success provide baseline signal for main-thread behavior.

Quality risks / nits
- @JvmOverloads audit is pending for all public Kotlin APIs meant for Java consumption; this can cause friction for Java integrators.
- StrictMode guarantees are not proven yet. A dedicated sample module with penaltyDeath in debug is still missing; without it, main-thread I/O regressions could slip in.
- Banner and AppOpen edge cases remain partially covered: adaptive sizing and detach behavior for Banner, and AppOpen OM display path smoke test.
- checkSdkSize uses a single-file .singleFile selection — if multiple variant outputs exist, this might throw. Consider safe handling (first matching or max size, with guard for empty).
- validateIntegration depends on configuration scanning; in certain Gradle versions, configurations.implementation may be resolved differently. Not a blocker, but worth guarding with null checks and avoiding unexpected resolution.

Actionable improvements (minimal changes recommended next)
- Add StrictMode sample app module (:sdk:core:android:sample) with penaltyDeath in debug and a CI smoke task to assert no main-thread I/O during initialize() and load/show.
- Add tests:
  - Banner: adaptive sizing + detach coverage.
  - AppOpen: OM display path smoke.
- Perform @JvmOverloads audit across all facade constructors and overloaded methods; add where missing and re-run Dokka to validate Java signatures.
- Harden checkSdkSize to handle zero or multiple AARs more defensively (log and skip or pick the largest).

---

## Assessment — ML training script changes

Strengths
- Safety-first defaults: Privacy guard drops sensitive columns (ip, user_id, gaid, idfa, ifa, adid) by default; date filtering and limit parameters support local, offline runs in line with the cost policy.
- Robust input handling: Auto-discovery of Parquet and decompression of archives found under ML/ML Data improves operability for practitioners.
- Repro-friendly artifacts: Emission of anomaly_scores.parquet, weak_labels.parquet, and pyod_meta.json sets up a foundation for future golden tests.

Quality risks / nits
- Determinism and schema: Outputs are not yet pinned to a versioned schema manifest; no deterministic fixture tests exist to catch regressions.
- Parameter validation: Ensure strong validation and clear error messages for invalid combinations (e.g., date filters without date column, contamination bounds, model choices).

Actionable improvements
- Add a tiny deterministic fixture with golden outputs; pin output schema fields (names/types) in a manifest and validate on write.
- Add argparse-level validation for parameters and fail-fast messaging; include seed control if applicable for stochastic models.

---

## Assessment — Documentation (focus and readiness)

Strengths
- SDK_FOCUS_PLAN.md clearly states acceptance criteria and checklists across Android/iOS/Docs.
- SANDBOX_READINESS.md provides an operator-centric runbook tied to existing Gradle tasks and unit tests; aligns with acceptance criteria.

Quality risks / nits
- Ensure all referenced commands and artifact paths are kept in sync as modules are added (e.g., StrictMode sample). Add a “Last validated on” stamp when the operator runs them.

Actionable improvements
- After adding the StrictMode sample and iOS demo target, extend the readiness checklist with those concrete run commands and pass/fail criteria.

---

## Summary judgments
- Code health: Good and improving; clear direction with instrumentation and guardrails. Main risks are around unproven main-thread guarantees and a few pending tests.
- Test posture: Solid for what exists (Robolectric + DX tests); missing a few high-value cases as noted.
- Documentation: Strong operator focus; keep append-only updates and evidence links flowing weekly.

---

## Next actions (tracked in checklists; cross-ref to today’s evidence)
- Android (from today’s SDK evidence): add StrictMode sample + CI smoke; add Banner/AppOpen tests; perform @JvmOverloads audit; harden size task.
- ML (from today’s ML updates): add deterministic fixture tests and schema pin for train_pyod.py outputs.
- Docs: update SANDBOX_READINESS.md after new modules/tests land; maintain evidence links in DEVELOPMENT_TODO_CHECKLIST.md.

Validation commands (operator will run later)
- Android: ./gradlew :sdk:core:android:test && ./gradlew :sdk:core:android:assembleRelease && ./gradlew :sdk:core:android:validateIntegration && ./gradlew :sdk:core:android:generateApiDocs
- iOS: cd sdks/ios && swift test
- ML: python ML\scripts\train_pyod.py --input "ML/ML Data" --out-dir models/fraud/dev --limit 20000 --date-col event_time
