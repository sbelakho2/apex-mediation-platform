# iOS SDK Quick Start (ApexMediation)

Last updated: 2025-11-07

This guide helps you integrate the iOS SDK quickly with a focus on privacy, reliability, and offline-friendly development.

1) Requirements
- iOS 14+
- Xcode 15+
- Swift 5.9+

2) Add the Swift Package
Add the package to your project:
- Repository: this repository path (sdk/core/ios)
- Product: RivalApexMediationSDK

3) Initialize the SDK
Call initialize early (e.g., in application(_:didFinishLaunchingWithOptions:)).

```swift
import RivalApexMediationSDK

@main
class AppDelegate: UIResponder, UIApplicationDelegate {
  func application(_ application: UIApplication,
                   didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
    Task { @MainActor in
      do {
        try await MediationSDK.shared.initialize(appId: "your-publisher-id")
      } catch {
        print("SDK init failed: \(error)")
      }
    }
    return true
  }
}
```

4) Set consent (optional but recommended)
Your app (or CMP) is the source of truth for consent.

```swift
// Example consent flags
let gdprApplies: Bool? = true
let tcf = "TCF_STRING"
let usp = "1YNN"
let coppa: Bool? = false
// Provide these before requesting ads (see SDK API for consent setters, if exposed)
```

5) Load and show an interstitial
Use the tiny public façade while SDK internals evolve.

```swift
import RivalApexMediationSDK

BelInterstitial.load(placementId: "interstitial_placement") { result in
  switch result {
  case .success(let ad):
    print("Loaded interstitial for placement=\(ad.placement) cpm=\(ad.cpm)")
  case .failure(let error):
    print("Load failed: \(error)")
  }
}

// Later, typically from a UIViewController
if BelInterstitial.isReady() {
  _ = BelInterstitial.show(from: self)
}
```

6) Rewarded
```swift
BelRewarded.load(placementId: "rewarded_placement") { result in
  // handle success/error
}
if BelRewarded.isReady() {
  _ = BelRewarded.show(from: self)
}
```

7) In‑app Debug Panel
```swift
DebugPanel.show(from: self)
```
Shows basic SDK state and is safe in debug/release builds. Add more fields as the SDK exposes them.

8) Error taxonomy
- 204 → no_fill
- 4xx → status_XXX (e.g., status_400)
- timeouts → timeout
- malformed JSON → error

9) Testing locally (no external creds)
- Unit tests use URLProtocol mocks; no real network.
- Run: `swift test` under sdk/core/ios.

10) Roadmap / next steps
- Demo app target with mocked endpoints (CI smoke)
- Consent propagation helpers and docs
- OM SDK hooks (no‑op by default) and rendering paths
