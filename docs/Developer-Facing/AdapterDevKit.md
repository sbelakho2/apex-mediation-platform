### Adapter Dev Kits — Developer‑Facing Index (BYO‑first)

This index links to per‑platform Adapter Dev Kit guides that help you build and certify your own adapters without bundling vendor SDKs inside ApexMediation Core.

Core guarantees (all platforms)
- No vendor SDKs are included in ApexMediation Core Release artifacts.
- Single‑point entry (initialize once), with simple, centralized consent.
- Sandbox/test code paths are gated and excluded from Release builds.

Per‑platform Dev Kits
- iOS/tvOS: `docs/Developer-Facing/DevKits/ios-tvos.md`
- Android & Android TV: `docs/Developer-Facing/DevKits/android-androidtv.md`
- Unity: `docs/Developer-Facing/DevKits/unity.md`
- Web: `docs/Developer-Facing/DevKits/web.md`

Conformance & testing
- iOS/tvOS: SwiftPM package under `sdk/adapter-dev-kit/ios` with `ConformanceSuite` and the `apex-adapter-runner` CLI.
- Android/TV: JUnit + instrumented tests in your adapter module; iterate on emulators/real devices.
- Unity: batchmode Editor tests; native or C# adapter patterns supported.
- Web: Jest/Playwright harnesses for your adapter wrappers (e.g., Prebid/GAM).

Privacy & transparency
- Follow `docs/Internal/Transparency/DATA_FLOW_AND_COMPLIANCE.md` for consent mapping, hashing/redaction, exports, and retention.
