# iOS SDK

Swift-based, thread-safe ad mediation SDK for iOS and tvOS.

## Features

- ✅ **<1MB Binary**: Minimal footprint
- ✅ **Thread-Safe**: Grand Central Dispatch (GCD)
- ✅ **Modern Swift**: Async/await, actors
- ✅ **Privacy-First**: iOS 14+ ATT support
- ✅ **Universal**: iOS, tvOS support

## Requirements

- iOS 14.0+
- tvOS 14.0+
- Xcode 14+
- Swift 5.5+

## Installation

### Swift Package Manager

```swift
dependencies: [
    .package(url: "https://github.com/rival-ad-stack/ios-sdk.git", from: "0.1.0")
]
```

### CocoaPods

```ruby
pod 'RivalApexMediationSDK', '~> 0.1.0'
```

### Carthage

```
github "rival-ad-stack/ios-sdk" ~> 0.1.0
```

## Quick Start

### 1. Initialize SDK

```swift
import RivalApexMediationSDK

@main
struct MyApp: App {
    init() {
        Task {
            do {
                try await MediationSDK.shared.initialize(
                    appId: "your_app_id",
                    config: SDKConfig(
                        testMode: true,
                        logLevel: .debug
                    )
                )
            } catch {
                print("SDK initialization failed: \(error)")
            }
        }
    }
    
    var body: some Scene {
        WindowGroup {
            ContentView()
        }
    }
}
```

### 2. Load an Ad

```swift
import RivalApexMediationSDK

class InterstitialViewController: UIViewController {
    func loadAd() {
        Task {
            do {
                let ad = try await MediationSDK.shared.loadAd(
                    placement: "interstitial_main"
                )
                
                if let ad = ad {
                    // Show ad
                    ad.show(from: self)
                } else {
                    print("No ad available")
                }
            } catch {
                print("Ad load failed: \(error)")
            }
        }
    }
}
```

## Performance Guarantees

| Metric | Target | Implementation |
|--------|--------|----------------|
| Binary Size | <1MB | Modular framework |
| Cold Start | <100ms | Lazy initialization |
| Memory | <10MB | Efficient caching |
| Battery Impact | <0.1%/hr | Optimized networking |

## Privacy & ATT

### App Tracking Transparency

```swift
import AppTrackingTransparency

func requestTracking() {
    ATTrackingManager.requestTrackingAuthorization { status in
        // Initialize SDK after user response
        Task {
            try await MediationSDK.shared.initialize(appId: "your_app_id")
        }
    }
}
```

### SKAdNetwork Support

Add to Info.plist:

```xml
<key>SKAdNetworkItems</key>
<array>
    <dict>
        <key>SKAdNetworkIdentifier</key>
        <string>your-network-id.skadnetwork</string>
    </dict>
</array>
```

## Advanced Configuration

### Custom Configuration

```swift
let config = SDKConfig(
    testMode: false,
    logLevel: .info,
    telemetryEnabled: true,
    configEndpoint: "https://config.rivalapexmediation.com",
    auctionEndpoint: "https://auction.rivalapexmediation.com"
)
```

### Thread Safety

All SDK methods are thread-safe:

```swift
// Safe to call from any queue
Task {
    let ad = try await MediationSDK.shared.loadAd(placement: "banner")
    
    // Callbacks always on main actor
    await MainActor.run {
        // Update UI
    }
}
```

## Debugging

### Enable Verbose Logging

```swift
let config = SDKConfig(logLevel: .verbose)
```

### Test Mode

```swift
let config = SDKConfig(testMode: true)
```

## Migration from Unity

See [Migration Guide](../../docs/migration/unity-to-rivalapexmediation.md)

## SwiftUI Support

```swift
struct AdView: View {
    @State private var ad: Ad?
    
    var body: some View {
        VStack {
            if let ad = ad {
                // Show ad
            }
        }
        .task {
            ad = try? await MediationSDK.shared.loadAd(placement: "banner")
        }
    }
}
```

## Support

- Documentation: https://docs.rivalapexmediation.com
- Discord: https://discord.gg/rival-ad-stack
- Email: support@rivalapexmediation.com
