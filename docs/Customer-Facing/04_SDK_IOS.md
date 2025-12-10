# iOS SDK Integration

## Quick Start

### 1. Add Dependencies

#### CocoaPods

Add the following to your `Podfile`:

```ruby
platform :ios, '12.0'

target 'MyApp' do
  use_frameworks!
  
  pod 'ApexMediation', '~> 1.0.0'
  # Add adapters for your BYO networks
  pod 'ApexMediation/AdMob'
  pod 'ApexMediation/AppLovin'
end
```

Run `pod install`.

#### Swift Package Manager

1.  File > Add Packages...
2.  Enter URL: `https://github.com/apexmediation/ios-sdk`
3.  Select version `1.0.0`

### 2. Initialize SDK

In your `AppDelegate.swift`:

```swift
import ApexMediation

@main
class AppDelegate: UIResponder, UIApplicationDelegate {

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        
        ApexMediation.initialize(appId: "YOUR_APP_ID") { status in
            if status == .success {
                print("Apex SDK Initialized")
            }
        }
        
        return true
    }
}
```

### 3. Load & Show Ad

In your `ViewController`:

```swift
import ApexMediation

class ViewController: UIViewController {

    override func viewDidLoad() {
        super.viewDidLoad()
        // Load
        ApexMediation.loadInterstitial(placementId: "PLACEMENT_ID")
    }

    @IBAction func showAd() {
        // Show
        if ApexMediation.isInterstitialReady(placementId: "PLACEMENT_ID") {
            ApexMediation.showInterstitial(from: self, placementId: "PLACEMENT_ID")
        }
    }
}
```

## Key Concepts

*   **App ID**: Found in the Console under App Settings.
*   **Placement ID**: Found in the Console.
*   **SKAdNetwork**: Ensure your `Info.plist` includes the SKAdNetwork IDs for all your ad partners to track conversions on iOS 14+.

## Info.plist Configuration

Add the `NSUserTrackingUsageDescription` key to request IDFA permission:

```xml
<key>NSUserTrackingUsageDescription</key>
<string>This identifier will be used to deliver personalized ads to you.</string>
```

## Integration Checklist

1.  [ ] Added `NSUserTrackingUsageDescription` to `Info.plist`.
2.  [ ] Added SKAdNetwork IDs for all partners.
3.  [ ] Initialized SDK with correct App ID.
4.  [ ] Requested IDFA permission (ATTrackingManager).
5.  [ ] Verified test ads load on device.

## Debugging

Enable verbose logging:

```swift
ApexMediation.setLogLevel(.verbose)
```

Open the **Mediation Debugger**:

```swift
ApexMediation.presentDebugger(from: self)
```
