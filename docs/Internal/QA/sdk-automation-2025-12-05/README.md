# SDK Automation Evidence – 2025-12-05

This directory captures the reproducible automation outputs requested in sections 0.0.2–0.0.5 of the production readiness checklist. Each log is produced directly from the local build/test commands recorded below so that reviewers can trace a binary path from checklist item → command → artifact.

## Test Matrix

| Surface | Command | Primary Artifacts | Notes |
| --- | --- | --- | --- |
| iOS core SDK | `swift test` | `ios-swift-test.log` | 84 tests executed, 0 failures, 3 UIKit-only cases skipped because the macOS runner lacks iOS UI frameworks. Network warning at tail comes from a stubbed `api.apexmediation.ee` config URL and does not affect unit coverage. |
| Android core SDK | `./gradlew.sh --rerun-tasks testDebugUnitTest` | `android-gradle-rerun.log`, `android-test-results/` | 88 Robolectric/unit tests executed with 0 failures. Kotlin compiler emitted unused-parameter and opt-in hints only. Raw JUnit XML copied for downstream evidence ingestion. |
| Android StrictMode sample harness | `./gradlew.sh --rerun-tasks :strictmode-sample:testDebugUnitTest` | `strictmode-test-results/` | 1 integration smoke covering UI-thread I/O guardrails; 0 failures. Executed as part of the same Gradle invocation above, artifacts split out for clarity. |
| Android integration validator | `./gradlew.sh validateIntegration` | `android-validate.log` | Confirms consumer ProGuard, dependency wiring, SDK targets, and release size thresholds. No failures; see log for hints/warnings. |
| Android TV SDK | `(cd sdk/ctv/android-tv && ../../core/android/gradlew.sh testDebugUnitTest)` | `ctv-android-tv-gradle.log`, `ctv-android-test-results/` | 4 Android-TV unit tests ran green; reused the core SDK Gradle wrapper because the module ships without its own wrapper. |
| tvOS CTV SDK | `swift test` | `ctv-tvos-swift-test.log` | Build fails on this macOS host because `SKAdNetwork`, `ATTrackingManager`, and CryptoKit availability guards require a tvOS SDK. Log documents the exact compiler errors for follow-up on a tvOS simulator. |
| Unity package tests | `dotnet test ApexMediation.Tests.csproj -l "trx;LogFileName=unity-tests.trx"` | `unity-dotnet.log`, `unity-tests.trx` | 13 .NET tests run against the editor/runtime package with .NET 8.0 SDK pinned locally. All passing. |

## Artifact Notes

- `android-test-results/` holds the entire `testDebugUnitTest` JUnit tree (88 suites, 0 failures, total runtime ≈ 11.4s on this host).
- `strictmode-test-results/` mirrors the sample module’s JUnit XML (1 suite, 0 failures, runtime ≈ 2.1s).
- `ctv-android-test-results/` captures the Android-TV Robolectric pass (4 suites, 0 failures, runtime ≈ 1.5s).
- `unity-tests.trx` is the VSTest report referenced by TestRail; it overwrites in place on each run.
- `ctv-tvos-swift-test.log` records the tvOS build failure details (unavailable StoreKit/AppTrackingTransparency APIs on macOS). Replay on a tvOS simulator/Xcode toolchain to exercise those tests fully.
- Console logs (`*.log`) preserve the exact Gradle, SwiftPM, and `dotnet` output, including any warnings reviewers may want to chase before sign-off.

Add new automation runs to this folder (or a date-stamped sibling) so the sandbox evidence README can link to a single location per date.
