# System Analysis and Improvement Proposals — 2025-11-08

Author: Platform Engineering (Autonomy)
Scope: Analyze today’s changes and the current system state; propose concrete, cost‑bounded improvements.

---

## Executive summary

Overall trajectory is strong: SDK focus resumed with solid Android scaffolding (facades, OM SDK hooks, size gate, validator, Dokka). Backend continues to harden (auction hedging tests, adapter conformance suites, Admin API tests). ML pipeline scaffolding is safe and offline‑centric, with privacy guards and shadow‑mode default.

Key gaps to address next (low effort, high leverage):
- Android: StrictMode sample module + CI smoke; OTA signature negative test; finalize Banner/AppOpen edge tests; @JvmOverloads audit.
- iOS: Demo target with mocked endpoints; main‑queue/taxonomy parity; Debug Panel enrichment.
- Backend: CORS preflight (OPTIONS) tests for Admin API; ensure hedging metrics‑derived delay boundaries are documented; minor doc polish.
- ML: Add deterministic fixture tests for train_pyod.py; pin output schema; add golden outputs.
- Docs: Add SDKs Sandbox Readiness checklist and link from SDKs index; extend Troubleshooting.

Budget: All proposed tasks are offline/local and keep within the $500/mo cap; no external services needed.

---

## What changed today (high‑signal)

- Android SDK: facades (Interstitial/Rewarded/RewardedInterstitial/AppOpen/Banner), OM hooks, Gradle size gate, validator, Dokka, and DX tests for Interstitial/AppOpen/Rewarded.
- ML: train_pyod.py expanded to handle archives, privacy guard, date filters, sampling; updated docs.
- Docs: SDK_FOCUS_PLAN.md published; DEVELOPMENT_TODO_CHECKLIST.md appended with today’s SDK updates.

See evidence in DEVELOPMENT_TODO_CHECKLIST.md dated 2025‑11‑08.

---

## Risk and gap assessment

- Android SDK
  - Missing StrictMode sample app (penaltyDeath) to prove zero main‑thread I/O.
  - OTA signature verification negative test for bad Base64 key not yet added.
  - Banner adaptive sizing + detach; AppOpen cold‑start OM display path tests pending.
  - Public API Java ergonomics (@JvmOverloads) audit pending for all facades.

- iOS SDK
  - Demo target absent; tests cover taxonomy/main‑queue partially; consent matrix and Debug Panel enrichment to add.

- Backend
  - Admin API CORS preflight tests missing (mentioned in notes).
  - Hedging p95‑derived delay implemented and tested; document operational bounds and minimum/maximum delay caps.

- ML
  - No deterministic tests for train_pyod.py; schema for outputs not pinned.
  - Evaluation metrics are placeholders (kept in shadow mode — safe by default).

- Website/Docs
  - SDKs Sandbox Readiness checklist page not yet present for a one‑look operator runbook.

---

## Proposed improvements (actionable, minimal changes)

1) Android
- Add :sdk:core:android:sample module with StrictMode enabled in debug (penaltyDeath) and a CI smoke task.
- Add OTA config negative test for bad Base64 key; ensure bypass only in testMode.
- Add tests: Banner adaptive sizing + detach; AppOpen OM display path.
- Audit @JvmOverloads on all public facade APIs.

2) iOS
- Create Demo target with mocked endpoints; add UI smoke test (main‑queue callbacks, no crash on no_fill).
- Extend taxonomy tests (429/5xx) and consent matrix.
- Enrich Debug Panel with redacted consent snapshot.

3) Backend
- Add CORS OPTIONS preflight tests for Admin API routes.
- Document hedging delay bounds and caps in backend/auction/internal/bidding/engine.go comments and docs.

4) ML
- Introduce small fixture and unit tests for train_pyod.py; pin output schema manifest; add golden outputs.

5) Documentation
- Add docs/Customer‑Facing/SDKs/SANDBOX_READINESS.md (commands, evidence paths, pass/fail criteria) and link from SDKs index.

---

## Commands (for operator)
- Android
  - Build + size check: ./gradlew :sdk:core:android:assembleRelease
  - Tests: ./gradlew :sdk:core:android:test
  - Validator: ./gradlew :sdk:core:android:validateIntegration
  - API docs: ./gradlew :sdk:core:android:generateApiDocs (build/dokka/html/index.html)
- iOS
  - Tests: cd sdks/ios && swift test
- Backend
  - Tests: go test ./... (from backend folder) — if Go toolchain is configured in this environment
- ML
  - Train (small sample): python ML\scripts\train_pyod.py --input "ML/ML Data" --out-dir models/fraud/dev --limit 20000 --date-col event_time

---

## Acceptance snapshot to add to checklists
- SDKs Sandbox Readiness page present and linked.
- CORS OPTIONS tests added; pass.
- Android: StrictMode sample smoke passes locally; OTA negative key test present; Banner/AppOpen tests implemented.
- iOS: Demo target added; main‑queue UI smoke passes.
- ML: train_pyod.py fixture test passes with golden outputs.

---

## Notes on safety and cost
All changes are offline and deterministic; no network calls to external services required. Shadow mode remains enforced for ML to prevent risky changes influencing production decisions.
