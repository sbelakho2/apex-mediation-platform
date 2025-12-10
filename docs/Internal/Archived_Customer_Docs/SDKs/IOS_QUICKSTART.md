# iOS SDK Quick Start (ApexMediation)

Last updated: 2025-11-11

This guide helps you integrate the iOS SDK quickly with a focus on privacy, reliability, and offline-friendly development.

## Requirements
- iOS 14+
- Xcode 15+
- Swift 5.9+

## Installation

### Add the Swift Package
Add the package to your project:
- Repository: this repository path (sdk/core/ios)
- Product: RivalApexMediationSDK

## Integration Steps

### 1. Initialize the SDK
Use the `BelAds` facade for initialization (recommended approach):

```swift
import RivalApexMediationSDK

@main
class AppDelegate: UIResponder, UIApplicationDelegate {
  func application(_ application: UIApplication,
                   didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
    // Initialize with BelAds facade
    BelAds.initialize(appId: "your-app-id", testMode: false) { result in
      switch result {
      case .success:
        print("SDK initialized successfully")
      case .failure(let error):
        print("SDK init failed: \(error)")
      }
    }
    return true
  }
}
```

**Check initialization status:**
```swift
if BelAds.isInitialized {
  print("SDK version: \(BelAds.version)")
}
```

### 2. Set User Consent
Configure privacy consent before loading ads:

```swift
import RivalApexMediationSDK

// Create consent data
let consent = ConsentData(
  gdprApplies: true,
  gdprConsentString: "your-tcf-string", // IAB TCF consent string
  ccpaOptOut: false,
  coppa: false
)

// Set consent
BelAds.setConsent(consent)

// Retrieve current consent
let currentConsent = BelAds.getConsent()
```

**Consent flags explained:**
- `gdprApplies`: Whether GDPR applies to this user (EU users)
- `gdprConsentString`: IAB TCF 2.0 consent string (if using CMP)
- `ccpaOptOut`: CCPA "Do Not Sell" flag (California users)
- `coppa`: Children's Online Privacy Protection Act compliance

### 3. Listen for Ad Lifecycle Callbacks
Facades share a cross-format listener so you can react to load/show/reward events without juggling multiple protocols:

```swift
final class SampleAdListener: BelAdEventListener {
  func onAdLoaded(placementId: String) {
    print("Ad ready for \(placementId)")
  }

  func onAdFailedToShow(placementId: String, error: Error) {
    print("Failed to show: \(error)")
  }

  func onUserEarnedReward(placementId: String, reward: BelReward?) {
    guard let reward else { return }
    print("User earned \(reward.amount) \(reward.label)")
  }
}
```

Create one listener per placement (or per format) and pass it into the load/show helpers for lifecycle coverage.

### 4. Interstitial Ads
Full-screen ads shown at natural breaks in your app:

```swift
import RivalApexMediationSDK

let listener = SampleAdListener()

BelInterstitial.load(placementId: "interstitial_placement", listener: listener)

if BelInterstitial.isReady(placementId: "interstitial_placement") {
  _ = BelInterstitial.show(from: self, placementId: "interstitial_placement", listener: listener)
}
```

### 5. Rewarded Ads
Video ads that reward users upon completion:

```swift
import RivalApexMediationSDK

let listener = SampleAdListener()

BelRewarded.load(placementId: "rewarded_placement", listener: listener)

if BelRewarded.isReady(placementId: "rewarded_placement") {
  _ = BelRewarded.show(from: self, placementId: "rewarded_placement", listener: listener)
}
```

### 6. Banner Ads
Persistent ads anchored to screen positions:

```swift
import RivalApexMediationSDK

// Create and load a banner
BelBanner.create(
  placementId: "banner_placement",
  size: .standard, // or .mediumRectangle, .leaderboard, .adaptive
  position: .bottom, // or .top, .topLeft, .bottomRight, etc.
  in: self
) { result in
  switch result {
  case .success:
    print("Banner loaded")
    BelBanner.show(placementId: "banner_placement")
  case .failure(let error):
    print("Banner load failed: \(error)")
  }
}

// Hide/show banner
BelBanner.hide(placementId: "banner_placement")
BelBanner.show(placementId: "banner_placement")

// Destroy banner when done
BelBanner.destroy(placementId: "banner_placement")
```

### 7. Rewarded Interstitial Ads
Full-screen ads with optional rewards:

```swift
import RivalApexMediationSDK

let listener = SampleAdListener()

BelRewardedInterstitial.load(placementId: "rewarded_interstitial_placement", listener: listener)

if BelRewardedInterstitial.isReady(placementId: "rewarded_interstitial_placement") {
  _ = BelRewardedInterstitial.show(from: self, placementId: "rewarded_interstitial_placement", listener: listener)
}
```

### 8. App Open Ads
Ads shown when app returns from background:

```swift
import RivalApexMediationSDK

let listener = SampleAdListener()

BelAppOpen.load(placementId: "app_open_placement", listener: listener)

if BelAppOpen.isReady(placementId: "app_open_placement") {
  _ = BelAppOpen.show(from: rootViewController, placementId: "app_open_placement", listener: listener)
}
```

**Note**: App open ads have built-in rate limiting (4 hours between shows).

### 9. Debug Panel
Access SDK diagnostics and status information:

```swift
import RivalApexMediationSDK

// Get debug information
let debugInfo = BelAds.getDebugInfo()
print("SDK Version: \(debugInfo["sdkVersion"] ?? "unknown")")
print("Initialized: \(debugInfo["isInitialized"] ?? false)")

// Enable debug logging
BelAds.setDebugLogging(true)
```

## Error Handling

The SDK uses a comprehensive error taxonomy:

- **204** → `SDKError.noFill` (no ad available)
- **429** → `SDKError.status_429` (rate limit exceeded)
- **500-599** → `SDKError.status_5xx` (server error)
- **Timeout** → `SDKError.timeout`
- **Network errors** → `SDKError.networkError`
- **Invalid placement** → `SDKError.invalidPlacement`

```swift
final class LoggingListener: BelAdEventListener {
  func onAdFailedToLoad(placementId: String, error: Error) {
    guard let sdkError = error as? SDKError else { return }
    switch sdkError {
    case .noFill:
      print("No ad for \(placementId)")
    case .timeout:
      print("Request timed out")
    case .status_429:
      print("Rate limited — retry later")
    default:
      print("Other error: \(sdkError)")
    }
  }
}

BelInterstitial.load(placementId: "test", listener: LoggingListener())
```

## Testing

### Local Development
- Unit tests use URLProtocol mocks; no real network required
- Run tests: `swift test` under `sdk/core/ios`
- Demo app included with mock responses

### Test Mode
Enable test mode during initialization for development:

```swift
BelAds.initialize(appId: "your-app-id", testMode: true) { result in
  // Test mode bypasses signature verification
}
```

## Best Practices

1. **Initialize early**: Call `BelAds.initialize()` in `application(_:didFinishLaunchingWithOptions:)`
2. **Set consent before loading ads**: Configure privacy settings immediately after initialization
3. **Check `isReady()` before showing**: Verify ad is loaded before attempting to display
4. **Handle errors gracefully**: Implement proper error handling for all ad operations
5. **Respect user privacy**: Always obtain and respect user consent preferences
6. **Use appropriate ad formats**: Choose formats that match your app's UX patterns

## Next Steps

- Review [iOS SDK API Reference](../API/iOS_SDK_REFERENCE.md)
- Check [Privacy Policy](../../Transparency/PRIVACY_POLICY.md)
- See [Network Retry Policy](../../../docs/iOS/NetworkRetryPolicy.md)
- Read [Public API Stability](../../../docs/iOS/PublicAPIStability.md)
- OM SDK hooks (no‑op by default) and rendering paths
