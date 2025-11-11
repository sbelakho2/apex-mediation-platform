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

### 3. Interstitial Ads
Full-screen ads shown at natural breaks in your app:

```swift
import RivalApexMediationSDK

// Load an interstitial
BelInterstitial.load(placementId: "interstitial_placement") { result in
  switch result {
  case .success(let ad):
    print("Loaded interstitial from \(ad.networkName)")
  case .failure(let error):
    print("Load failed: \(error)")
  }
}

// Show when ready (typically from a UIViewController)
if BelInterstitial.isReady() {
  _ = BelInterstitial.show(from: self)
}
```

### 4. Rewarded Ads
Video ads that reward users upon completion:

```swift
import RivalApexMediationSDK

// Load a rewarded ad
BelRewarded.load(placementId: "rewarded_placement") { result in
  switch result {
  case .success:
    print("Rewarded ad loaded")
  case .failure(let error):
    print("Load failed: \(error)")
  }
}

// Show when ready
if BelRewarded.isReady() {
  _ = BelRewarded.show(from: self)
}
```

### 5. Banner Ads
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

### 6. Rewarded Interstitial Ads
Full-screen ads with optional rewards:

```swift
import RivalApexMediationSDK

// Load rewarded interstitial
BelRewardedInterstitial.load(placementId: "rewarded_interstitial_placement") { result in
  // handle success/error
}

// Show with reward callback
if BelRewardedInterstitial.isReady() {
  _ = BelRewardedInterstitial.show(
    from: self,
    onRewarded: { reward in
      print("User earned \(reward.amount) \(reward.type)")
      // Grant reward in your app
    },
    onClosed: {
      print("Ad closed")
    }
  )
}
```

### 7. App Open Ads
Ads shown when app returns from background:

```swift
import RivalApexMediationSDK

// Load app open ad
BelAppOpen.load(placementId: "app_open_placement") { result in
  // handle success/error
}

// Show on app foregrounding (in SceneDelegate or AppDelegate)
if BelAppOpen.isReady() {
  _ = BelAppOpen.show(from: rootViewController) {
    print("App open ad closed")
  }
}
```

**Note**: App open ads have built-in rate limiting (4 hours between shows).

### 8. Debug Panel
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
BelInterstitial.load(placementId: "test") { result in
  switch result {
  case .success:
    // Ad loaded successfully
    break
  case .failure(let error):
    if let sdkError = error as? SDKError {
      switch sdkError {
      case .noFill:
        print("No ad available - try again later")
      case .timeout:
        print("Request timed out - check network")
      case .status_429:
        print("Rate limited - wait before retry")
      default:
        print("Error: \(sdkError.localizedDescription)")
      }
    }
  }
}
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
