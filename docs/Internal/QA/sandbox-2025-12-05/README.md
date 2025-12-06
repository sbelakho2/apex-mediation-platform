# Sandbox Evidence – 2025-12-05

This folder tracks the status of the checklist items from sections 0.0.2–0.0.7 in `docs/Internal/Deployment/PRODUCTION_READINESS_CHECKLIST.md`. It consolidates the automated artifacts gathered so far and calls out the manual validations that still require device/emulator runs or UI captures.

> **Note:** The current VS Code environment does not provide Android/iOS/tvOS simulators or Unity/Console sandboxes. All device-facing checks below remain **Pending – Needs Device Run** until we can execute them on the staging hardware called out in the runbook. Automated unit/CI suites are captured separately (see `../sdk-automation-2025-12-05`).

## Platform Matrix Snapshot

| Section | Scope | Automated Evidence | Manual Sandbox Status |
| --- | --- | --- | --- |
| 0.0.2 | Android test app (`ApexSandboxAndroid`) | Android core SDK unit tests (88 suites), StrictMode harness, and validator logs saved in `../sdk-automation-2025-12-05` | Pending: on-device init/load/show, consent toggles, lifecycle/soak. Requires staging app + emulator/physical device. |
| 0.0.3 | iOS test app (`ApexSandboxiOS`) | Swift unit suite (84 tests, 3 UIKit skips) captured in `../sdk-automation-2025-12-05/ios-swift-test.log` | Pending: ATT prompt, consent toggles, lifecycle stress, Crashlytics soak. Needs Xcode + simulator. |
| 0.0.4 | Unity multi-platform project | Unity runtime unit tests (13 cases) run via `dotnet test` with artifacts in `../sdk-automation-2025-12-05` | Pending: Unity scene wiring + Android/iOS exports and device validation. |
| 0.0.5 | Android TV / CTV | Android-TV unit tests (4 suites) captured via `ctv-android-tv-gradle.log` + `ctv-android-test-results/` | Pending: Remote-focus UI, hardware playback, Ethernet/Wi-Fi toggles on Android TV/Fire TV hardware. |
| 0.0.6 | tvOS / CTV | `swift test` attempted (see `ctv-tvos-swift-test.log`) but fails on macOS because StoreKit/AppTrackingTransparency symbols are tvOS-only | Pending: Apple TV-focused flows mirroring iOS gating once a tvOS simulator or Apple TV device is available. |
| 0.0.7 | Console/Dashboard sandbox flows | Not covered by local automation | Pending: Staging console signup/login/placements CRUD, debugger timelines, dashboard validation. Needs browser session against staging stack. |

## Next Actions

1. When access to the required devices/environments is available, follow the per-section subsections in the production checklist and drop screenshots/videos/logs into dedicated subfolders under this directory (`android/`, `ios/`, `unity/`, `android-tv/`, `tvos/`, `console/`).
2. Link each evidence item back to the checklist bullet and note the test date + operator initials in a short `SUMMARY.md`.
3. After manual runs, update `docs/Internal/Deployment/PRODUCTION_READINESS_CHECKLIST.md` with checkbox status and insert references to the captured artifacts.

## Attachments

- Automated SDK logs: see `../sdk-automation-2025-12-05/README.md` for the Android (core + StrictMode + CTV) and Unity evidence captured on 2025-12-05. Web/console manual runs remain pending in this environment. tvOS build logs document the StoreKit/AppTrackingTransparency gating described above.
- Manual evidence: **pending** (device runs blocked in this environment).
