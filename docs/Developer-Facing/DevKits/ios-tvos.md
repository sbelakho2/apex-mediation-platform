### iOS/tvOS Adapter Dev Kit (BYO-first)

Purpose
- Help you implement, test, and certify your own adapters for iOS and tvOS without bundling any vendor SDK inside ApexMediation Core.

Key guarantees
- Core SDK Release artifacts contain no vendor SDKs or adapters by default.
- Single-point entry (`MediationSDK.initialize`) and simple consent remain unchanged.
- Sandbox/test code is gated (`#if DEBUG || APEX_SANDBOX_ADAPTERS`) and excluded from Release.

Adapter interface (from `RivalApexMediationSDK`)
```swift
public protocol AdNetworkAdapter {
  var networkName: String { get }
  var version: String { get }
  var minSDKVersion: String { get }
  init()
  func initialize(config: [String: Any]) throws
  func supportsAdType(_ type: AdType) -> Bool
  func loadAd(
    placement: String,
    adType: AdType,
    config: [String: Any],
    completion: @escaping (Result<Ad, AdapterRegistryError>) -> Void
  )
  func destroy()
}
```

BYO adapter skeleton
```swift
import RivalApexMediationSDK
import GoogleMobileAds // example vendor import in your module (not in Apex Core)

public final class PublisherAdMobAdapter: AdNetworkAdapter {
  public var networkName: String { "admob" }
  public var version: String { GADMobileAds.sharedInstance().sdkVersion }
  public var minSDKVersion: String { "1.0.0" }
  public required init() {}
  private var initialized = false

  public func initialize(config: [String : Any]) throws {
    guard let appId = config["app_id"] as? String, !appId.isEmpty else {
      throw AdapterRegistryError.loadFailed("app_id required")
    }
    GADMobileAds.sharedInstance().start(completionHandler: nil)
    initialized = true
  }

  public func supportsAdType(_ type: AdType) -> Bool {
    switch type { case .banner, .interstitial, .rewarded: return true; default: return false }
  }

  public func loadAd(placement: String, adType: AdType, config: [String : Any], completion: @escaping (Result<Ad, AdapterRegistryError>) -> Void) {
    guard initialized else { return completion(.failure(.notInitialized)) }
    // Map consent + placement -> vendor request, then call completion(.success(ad)) or completion(.failure(...)) exactly once
  }

  public func destroy() { /* clean up if needed */ }
}
```

Register at runtime (publisher app)
```swift
Task {
  await MediationSDK.shared.registerAdapter(networkName: "admob", adapterType: PublisherAdMobAdapter.self)
  let cfg = SDKConfig.default(appId: "your-app-id")
  _ = try await MediationSDK.shared.initialize(appId: cfg.appId, configuration: cfg)
}
```

Sandbox controls (DEBUG/testing)
```swift
await MediationSDK.shared.setSandboxForceAdapterPipeline(true) // bypass S2S path
await MediationSDK.shared.setSandboxAdapterWhitelist(["admob"]) // focus one adapter
let names = await MediationSDK.shared.adapterNames()
```

Conformance Suite and CLI
- Package: `sdk/adapter-dev-kit/ios`
- Library: `ApexAdapterDevKit` (provides `ConformanceSuite`)
- CLI: `apex-adapter-runner`

Run on simulators
```bash
pushd sdk/adapter-dev-kit/ios
xcrun swift run apex-adapter-runner --adapter admob \
  --appId test-app \
  --inter test_interstitial \
  --reward test_rewarded \
  --timeout 10
popd
```

What the conformance checks
- Initialize → load → callbacks (exactly once) for interstitial and rewarded.
- Optional flags: consent permutations and timeouts.
- Future: error taxonomy mapping, banner refresh/lifecycle.

tvOS specifics
- No ATT prompt; SKAdNetwork remains relevant. UI must respect focus engine and Siri Remote navigation.

Links
- Core guide: `docs/Developer-Facing/AdapterDevKit.md`
- iOS/tvOS SDK integration (customer-facing): `docs/Customer-Facing/SDK-Integration/ios-sdk.md`
