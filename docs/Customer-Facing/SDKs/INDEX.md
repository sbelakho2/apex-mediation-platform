# SDKs — Quickstart Index

Welcome to the SDKs index. Choose your platform to get started quickly. Each guide is designed to achieve a working integration in under 30 minutes with world‑class developer experience.

Platforms
- Android SDK Quickstart
  - Path: docs/Customer-Facing/SDKs/ANDROID_QUICKSTART.md
  - Highlights: one dependency, initialize(), simple load/show APIs, test mode, consent, OTA‑safe config, Debug Panel, troubleshooting.
- iOS SDK Quickstart
  - Path: docs/Customer-Facing/SDKs/IOS_QUICKSTART.md
  - Highlights: Swift Package, initialize(), load/show, normalized taxonomy, consent propagation, in‑app Debug Panel, troubleshooting.

Debugging and Tools
- In‑App Debug Panel
  - Android: BelAds.showDebugPanel(activity)
  - iOS: DebugPanel.show(from: UIViewController)
- Admin Observability (for backend developers)
  - Adapter Metrics: GET /v1/metrics/adapters
  - Time‑series: GET /v1/metrics/adapters/timeseries?days=7
  - SLO status: GET /v1/metrics/slo
  - Mediation Debugger events: GET /v1/debug/mediation?placement_id=&n=

Sandbox Readiness — SDKs
- Run all SDK tests locally before certification:
  - Android: `./gradlew :sdk:core:android:test`
  - iOS: `cd sdks/ios && swift test`
- Ensure observability pages load and Admin APIs are reachable from the Website (CORS_ORIGIN env set).

Support and Troubleshooting
- See docs/Customer-Facing/SDKs/TROUBLESHOOTING.md for common issues and fixes.

Notes
- The SDKs are designed to operate without client‑side secrets. OTA configuration is signed (Ed25519) and schema‑validated.
- The platform enforces a global operating budget ≤ $500/month; no external services are required for local testing.
