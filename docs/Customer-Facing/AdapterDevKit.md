### Adapter Dev Kit (BYO-first) — iOS/tvOS, Android/Android TV, Unity, Web

This guide explains how to validate and ship real ad network adapters without ever bundling vendor SDKs inside ApexMediation Core. It provides parity across all supported platforms and keeps production code clean and single-entry.

Key principles
- Core principle: No vendor SDKs in the ApexMediation core libraries (Release). BYO-first only.
- Single point of entry: initialize once per app lifecycle using each platform’s `MediationSDK` (or Unity wrapper), then use `loadAd`/`isAdReady`/`show` APIs.
- Consent: keep existing simple consent APIs; SDK propagates flags to requests/adapters (GDPR/TCF, US Privacy/CCPA, COPPA, LAT/ATT/SKAN on Apple).
- Strict separation: sandbox/testing code is gated and excluded from Release artifacts.

What the Core provides on every platform
- Stable adapter interfaces and a registry to invoke them.
- Runtime config format (placements, priority, timeouts, floors, feature flags).
- Consent utilities and propagation.
- Telemetry, error taxonomy, and circuit breakers.
- Sandbox helpers (DEBUG only) to whitelist adapters and force the adapter pipeline for offline testing.

What you (or publishers) provide
- Vendor SDK dependencies in their own app/modules.
- Adapter implementations that wrap vendor SDKs and implement the platform interface.
- Optional: separate adapter packages (no re-distribution of vendor bits) that depend on both Apex Core and vendor artifacts.

Release safety and sandbox gating
- iOS/tvOS: all sample/stub adapters are compiled only when `DEBUG` or `APEX_SANDBOX_ADAPTERS` is set. Release builds ship with zero vendor adapters. The registry is empty by default.
- Android/CTV: reflection-based discovery and any default vendor references are gated behind `BuildConfig.DEBUG` or the system property `apex.sandbox.adapters=1`. The V2 runtime registry has no defaults in Release.
- Unity: sandbox methods exist for tests, but native bridge calls are optional; production apps don’t need them.

---

#### iOS/tvOS (Swift)

Core dependency
- Package: `RivalApexMediationSDK` (SwiftPM/CocoaPods per your integration docs).
- Platforms: `.iOS(.v14), .tvOS(.v14)` or higher.

Single entry and consent
```swift
import RivalApexMediationSDK

// App start
let cfg = SDKConfig.default(appId: "your-app-id")
Task {
  try await MediationSDK.shared.initialize(appId: cfg.appId, configuration: cfg)
  MediationSDK.shared.setConsent(ConsentData(gdprApplies: true, gdprConsentString: "<TCF>", ccpaOptOut: false, limitAdTracking: false))
}
```

BYO adapter registration (publisher-owned module)
```swift
// In your adapter module (depends on RivalApexMediationSDK and vendor SDK)
public final class PublisherAdMobAdapter: AdNetworkAdapter { /* implements protocol */ }

// In your app before initialize
Task {
  await MediationSDK.shared.registerAdapter(networkName: "admob", adapterType: PublisherAdMobAdapter.self)
}
```

Sandbox adapter testing (DEBUG only)
```swift
await MediationSDK.shared.setSandboxForceAdapterPipeline(true) // bypass S2S
await MediationSDK.shared.setSandboxAdapterWhitelist(["admob"]) // test one
let names = await MediationSDK.shared.adapterNames() // diagnostics
```

Adapter Dev Kit (SPM)
- Package path: `sdk/adapter-dev-kit/ios`
- Library: `ApexAdapterDevKit` (provides `ConformanceSuite`)
- CLI runner: `apex-adapter-runner`

Run the conformance suite (developer machine or CI)
```bash
pushd sdk/adapter-dev-kit/ios
xcrun swift run apex-adapter-runner --adapter admob \
  --appId test-app \
  --inter test_interstitial \
  --reward test_rewarded \
  --timeout 10
popd
```

iOS/tvOS sandbox apps
- iOS app now includes an Adapter Picker and “Run All” action, using `adapterNames()` and whitelist APIs.
- tvOS sandbox reads the same config and applies whitelist/force-pipeline flags.

---

#### Android + Android TV

Core dependency
- Module: `com.apexmediation:core-android` (per your distribution).
- No vendor SDKs in this module.

Single entry and consent
```kotlin
val sdk = MediationSDK.initialize(appContext, appId)
sdk.setConsent(gdprApplies = true, consentString = "<TCF>", usPrivacy = "1---", coppa = false, limitAdTracking = false)
```

BYO adapter registration
```kotlin
// Register runtime V2 adapter factory before initialize() if you own a native adapter module
sdk.registerRuntimeAdapterFactory("admob") { ctx -> PublisherAdMobAdapter(ctx) }
```

Sandbox adapter testing (DEBUG only)
```kotlin
sdk.setSandboxForceAdapterPipeline(true) // skip S2S
sdk.setSandboxAdapterWhitelist(listOf("admob"))
val names = sdk.getAdapterNames()
```

Android TV specifics
- Use the same core SDK.
- Ensure adapter UIs are D-pad friendly: focus handling, no tiny clickable elements.
- Prefer full-screen video/interstitial; overlay banners must be remote-safe.

Conformance tests (JUnit)
- Create a JUnit test in your adapter module: register your adapter factory, initialize the SDK in test mode, run interstitial/rewarded load+show and assert callback ordering and error mapping.
- Run via Gradle on emulators/real devices.

---

#### Unity

Core package
- `ApexMediation.Core` (.unitypackage/UPM) contains C# wrappers that call native iOS/Android.
- Never includes vendor Unity SDKs.

Consent and sandbox flags
```csharp
SdkBridge.Initialize("your-app-id", testMode: true);
SdkBridge.SetConsent(new ConsentPayload { gdprApplies = true, tcfString = "<TCF>" });
SdkBridge.SetSandboxForceAdapterPipeline(true);
SdkBridge.SetSandboxAdapterWhitelist(new[] { "admob" });
```

Adapters
- Either bring native iOS/Android adapters (recommended) and invoke them via the native core, or define C# `INetworkAdapter` wrappers if you choose a Unity-side adapter.
- BYO vendor Unity packages; do not bundle vendor bits into the Apex Unity package.

---

#### Web

Core package (TypeScript)
- `@apexmediation/core-web` (conceptual) exposes slot creation, telemetry, and an adapter API.

Adapter interface
```ts
export interface WebAdAdapter {
  readonly name: string
  init(config: Record<string, unknown>): Promise<void>
  loadAd(slotId: string, config: SlotConfig): Promise<AdResult>
  renderAd(container: HTMLElement, ad: AdResult): void
}
```

BYO
- Publishers include their own tags (Prebid.js, Google Ad Manager) and provide adapters that wrap those APIs.
- No vendor web scripts are bundled in Apex core.

---

#### CI suggestions
- iOS/tvOS: run `swift test` in `sdk/core/ios` and the Dev Kit CLI on Apple TV and iPhone simulators.
- Android/CTV: run Gradle unit and instrumentation tests; prime adapters via factories in a test-only module; collect logcat with adapter spans.
- Unity: use batchmode tests and drive native SDK through Editor playmode or device farm.
- Web: run Jest/Playwright for adapter harnesses.

---

Troubleshooting and guarantees
- Production artifacts never include vendor adapters by default.
- Sandbox and sample code is gated by build flags and is excluded from Release.
- Single entry point (`MediationSDK.initialize`) is preserved on all platforms.
- Consent remains simple and central; the SDK propagates all flags to requests/adapters.
