# Sandbox Readiness — SDKs

Purpose: Provide an operator-friendly checklist to verify Android and iOS SDKs are ready for certification with offline/local proofs where possible.

---

## Prerequisites
- Java 17, Android SDK installed
- Xcode + Swift toolchain (for iOS tests)
- Local repo checked out, no uncommitted changes

---

## Android — Required checks

1) Build and size budget
- Command: `./gradlew :sdk:core:android:assembleRelease`
- Expectation: Task completes; size gate runs automatically
- Optional explicit check: `./gradlew :sdk:core:android:checkSdkSize`
- Pass criteria: Release AAR ≤ 500 KB; warning if > 450 KB

2) Unit + Robolectric tests
- Command: `./gradlew :sdk:core:android:test`
- Pass criteria: All tests green (facade DX tests; OM SDK hooks tests)

3) Integration Validator (library checks)
- Command: `./gradlew :sdk:core:android:validateIntegration`
- Pass criteria:
  - consumer-rules.pro present
  - OkHttp and Gson dependencies detected
  - Size within budget; reminders printed for host app INTERNET permission and cleartext policy when using dev endpoints

4) API docs
- Command: `./gradlew :sdk:core:android:generateApiDocs`
- Artifact: `sdk\core\android\build\dokka\html\index.html`

5) StrictMode smoke gate
- Command: `./gradlew :sdk:core:android:strictmodeSmoke`
- Pass criteria: StrictMode sample Robolectric suite passes without penaltyDeath or leaked StrictMode violations.
- Notes: Harness initializes the SDK and exercises initialize/load/show paths under main-thread StrictMode.

6) OTA Config signature verification
- Command: `./gradlew :sdk:core:android:testDebugUnitTest --tests "com.rivalapexmediation.sdk.config.ConfigSignatureTest"`
- Pass criteria: Tampered signatures and bad Base64 public keys are rejected in production mode while testMode bypass remains in place.
- Notes: Ensure production builds provide a valid Base64 Ed25519 public key via `configPublicKeyBase64`.

---

## iOS — Required checks

1) Unit tests
- Command: `cd sdks/ios && swift test`
- Pass criteria: Taxonomy tests (429, 5xx) pass; main-queue callback assertions pass.

2) Demo target validation
- Provide mocked endpoints and a UI smoke test that proves main-queue callbacks and graceful no_fill behavior.

3) Debug Panel
- Ensure the panel surfaces a redacted consent snapshot plus SDK/version info, and keep the Quickstart instructions in sync.

---

## Evidence collection
- Keep screenshots of:
  - Android Dokka index page
  - Test reports (JUnit XML or console snapshots)
  - iOS swift test output
- Record artifact paths:
  - Android AAR: `sdk\core\android\build\outputs\aar\*.aar`
  - iOS: N/A (Swift Package)
- Store run logs alongside your release artifacts so they can be shared during certification reviews.

---

## Troubleshooting pointers
- INTERNET permission missing in host app → add `<uses-permission android:name="android.permission.INTERNET"/>`
- Cleartext dev endpoints (http://) → add Network Security Config to allow cleartext for dev or switch to https.
- Main-thread violations (StrictMode) → ensure all I/O happens off main; use coroutines/dispatchers appropriately.
- Signature failures for OTA config → verify Ed25519 key, Base64 encoding, and schema; testMode bypass only.

---

## Completion criteria
- All required Android checks pass (build, tests, validator, docs) and any follow-up items are tracked with owners and dates.
- iOS unit tests pass; demo target and Debug Panel evidence captured; checklist updated.
- Evidence links and run commands are cataloged with the weekly release artifacts.
