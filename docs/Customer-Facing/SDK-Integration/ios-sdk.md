# iOS SDK Integration Guide (BYO‑first, single‑entry)

Integrate ApexMediation into your iOS or tvOS app using a Bring‑Your‑Own (BYO) adapters model. Core principle: the core SDK ships without any vendor SDKs in Release builds. You register your own adapters at runtime, preserving a single point of entry and simple consent handling.

---

## Prerequisites

- iOS 12.0 or higher
- Xcode 13.0+
- Swift 5.0+ or Objective-C
- Active ApexMediation account with API credentials

---

## Installation

### Swift Package Manager (Recommended)

1. Open your project in Xcode
2. Go to `File > Add Packages...`
3. Enter package URL: `https://github.com/apexmediation/ios-sdk.git`
4. Select version: `2.0.0` or `Up to Next Major`
5. Click `Add Package`

### CocoaPods

Add to your `Podfile`:

```ruby
platform :ios, '12.0'
use_frameworks!

target 'YourApp' do
  pod 'ApexMediationSDK', '~> 2.0'
end
```

Run:
```bash
pod install
```

### Manual Installation

1. Download `ApexMediationSDK.xcframework` from [releases](https://github.com/apexmediation/ios-sdk/releases)
2. Drag into your Xcode project
3. Add to `Frameworks, Libraries, and Embedded Content`

---

## Initial Setup (modern API)

Most new apps should use the modern `MediationSDK` API. Legacy `ApexMediationSDK/ApexMediationConfig` is shown later for backwards compatibility.

### 1. Configure Info.plist

Add required keys to `Info.plist`:

```xml
<key>NSUserTrackingUsageDescription</key>
<string>This identifier will be used to deliver personalized ads to you.</string>

<key>SKAdNetworkItems</key>
<array>
    <dict>
        <key>SKAdNetworkIdentifier</key>
        <string>apexmediation.skadnetwork</string>
    </dict>
    <!-- Additional SKAdNetwork IDs will be auto-added by SDK -->
</array>

<key>NSAppTransportSecurity</key>
<dict>
    <key>NSAllowsArbitraryLoads</key>
    <false/>
</dict>
```

### 2. Initialize (Swift, BYO‑first single‑entry)

In your app bootstrap (e.g., `AppDelegate` or first scene), register BYO adapters before initialize if you have adapter modules. Then initialize once.

```swift
import RivalApexMediationSDK

@main
class AppDelegate: UIResponder, UIApplicationDelegate {
  func application(_ application: UIApplication,
                   didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
    Task {
      // Optional: Register your BYO adapters prior to initialize (example types)
      // await MediationSDK.shared.registerAdapter(networkName: "admob", adapterType: PublisherAdMobAdapter.self)
      // await MediationSDK.shared.registerAdapter(networkName: "applovin", adapterType: PublisherAppLovinAdapter.self)

      // Build config (use defaults unless you need overrides)
      let cfg = SDKConfig.default(appId: "your-app-id")
      _ = try await MediationSDK.shared.initialize(appId: cfg.appId, configuration: cfg)

      // Consent: keep it simple and central
      MediationSDK.shared.setConsent(ConsentData(
        gdprApplies: true,
        gdprConsentString: "<TCF string>",
        ccpaOptOut: false,
        limitAdTracking: false
      ))

      // (Optional, DEBUG/testing) Force adapter pipeline and/or restrict to a single network
      await MediationSDK.shared.setSandboxForceAdapterPipeline(true)
      await MediationSDK.shared.setSandboxAdapterWhitelist(["admob"]) // e.g., iterate adapters in a sandbox
    }
    return true
  }
}
```

### 3. Initialize SDK (Objective‑C, legacy)

In your `AppDelegate.m`:

```objc
#import "AppDelegate.h"
#import <ApexMediationSDK/ApexMediationSDK.h>

@implementation AppDelegate

- (BOOL)application:(UIApplication *)application
    didFinishLaunchingWithOptions:(NSDictionary *)launchOptions {

    // Configure SDK
    ApexMediationConfig *config = [[ApexMediationConfig alloc]
        initWithPublisherId:@"YOUR_PUBLISHER_ID"
        apiKey:@"YOUR_API_KEY"];
    config.testMode = YES; // Remove in production

    // Initialize
    [ApexMediationSDK initializeWithConfig:config completion:^(BOOL success) {
        if (success) {
            NSLog(@"ApexMediation initialized successfully");
        } else {
            NSLog(@"ApexMediation initialization failed");
        }
    }];

    return YES;
}

@end
```

---

## iOS 14+ ATT Compliance

Request App Tracking Transparency permission:

```swift
import AppTrackingTransparency
import AdSupport

func requestTrackingPermission() {
    // Wait until app is active
    guard #available(iOS 14, *) else { return }

    ATTrackingManager.requestTrackingAuthorization { status in
        switch status {
        case .authorized:
            print("Tracking authorized")
            // User allowed tracking - personalized ads enabled

        case .denied, .restricted:
            print("Tracking denied")
            // Show contextual ads only

        case .notDetermined:
            print("Tracking not determined")

        @unknown default:
            break
        }

        // Initialize ApexMediation after ATT prompt
        self.initializeApexMediation()
    }
}

// Call in viewDidAppear of first screen
override func viewDidAppear(_ animated: Bool) {
    super.viewDidAppear(animated)
    requestTrackingPermission()
}
```

---

## Ad Formats (facade components)

### Banner Ads

**Swift:**

```swift
import ApexMediationSDK

class BannerViewController: UIViewController {
    private var bannerView: ApexMediationBannerView?

    override func viewDidLoad() {
        super.viewDidLoad()

        // Create banner
        bannerView = ApexMediationBannerView(
            placementId: "banner_main",
            adSize: .standard // 320x50
        )

        // Set delegate
        bannerView?.delegate = self

        // Position banner
        bannerView?.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(bannerView!)

        NSLayoutConstraint.activate([
            bannerView!.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            bannerView!.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor),
            bannerView!.widthAnchor.constraint(equalToConstant: 320),
            bannerView!.heightAnchor.constraint(equalToConstant: 50)
        ])

        // Load ad
        bannerView?.load()
    }
}

// MARK: - ApexMediationBannerDelegate
extension BannerViewController: ApexMediationBannerDelegate {
    func bannerDidLoad(_ banner: ApexMediationBannerView) {
        print("Banner loaded")
    }

    func banner(_ banner: ApexMediationBannerView, didFailWithError error: Error) {
        print("Banner failed: \(error.localizedDescription)")
    }

    func bannerDidClick(_ banner: ApexMediationBannerView) {
        print("Banner clicked")
    }
}
```

**Objective-C:**

```objc
@interface BannerViewController () <ApexMediationBannerDelegate>
@property (nonatomic, strong) ApexMediationBannerView *bannerView;
@end

@implementation BannerViewController

- (void)viewDidLoad {
    [super viewDidLoad];

    // Create banner
    self.bannerView = [[ApexMediationBannerView alloc]
        initWithPlacementId:@"banner_main"
        adSize:ApexMediationBannerSizeStandard];
    self.bannerView.delegate = self;

    // Position banner
    self.bannerView.translatesAutoresizingMaskIntoConstraints = NO;
    [self.view addSubview:self.bannerView];

    [NSLayoutConstraint activateConstraints:@[
        [self.bannerView.centerXAnchor constraintEqualToAnchor:self.view.centerXAnchor],
        [self.bannerView.bottomAnchor constraintEqualToAnchor:self.view.safeAreaLayoutGuide.bottomAnchor],
        [self.bannerView.widthAnchor constraintEqualToConstant:320],
        [self.bannerView.heightAnchor constraintEqualToConstant:50]
    ]];

    // Load ad
    [self.bannerView load];
}

#pragma mark - ApexMediationBannerDelegate

- (void)bannerDidLoad:(ApexMediationBannerView *)banner {
    NSLog(@"Banner loaded");
}

- (void)banner:(ApexMediationBannerView *)banner didFailWithError:(NSError *)error {
    NSLog(@"Banner failed: %@", error.localizedDescription);
}

@end
```

**Banner Sizes:**
- `.standard` - 320x50
- `.large` - 320x100
- `.mediumRectangle` - 300x250
- `.leaderboard` - 728x90 (iPad)

### Interstitial Ads

**Swift:**

```swift
import ApexMediationSDK

class GameViewController: UIViewController {
    private var interstitial: ApexMediationInterstitial?

    override func viewDidLoad() {
        super.viewDidLoad()
        loadInterstitial()
    }

    private func loadInterstitial() {
        interstitial = ApexMediationInterstitial(placementId: "interstitial_level_end")
        interstitial?.delegate = self
        interstitial?.load()
    }

    func showInterstitialAd() {
        if interstitial?.isReady == true {
            interstitial?.show(from: self)
        } else {
            print("Interstitial not ready")
            loadInterstitial()
        }
    }
}

// MARK: - ApexMediationInterstitialDelegate
extension GameViewController: ApexMediationInterstitialDelegate {
    func interstitialDidLoad(_ interstitial: ApexMediationInterstitial) {
        print("Interstitial ready")
    }

    func interstitial(_ interstitial: ApexMediationInterstitial, didFailWithError error: Error) {
        print("Interstitial failed: \(error.localizedDescription)")
    }

    func interstitialWillPresent(_ interstitial: ApexMediationInterstitial) {
        print("Interstitial will present")
        // Pause game audio/animations
    }

    func interstitialDidDismiss(_ interstitial: ApexMediationInterstitial) {
        print("Interstitial dismissed")
        // Resume game
        loadInterstitial() // Preload next
    }
}
```

### Rewarded Video Ads

**Swift:**

```swift
import ApexMediationSDK

class RewardedAdManager {
    static let shared = RewardedAdManager()
    private var rewardedAd: ApexMediationRewardedVideo?

    func loadRewardedVideo() {
        rewardedAd = ApexMediationRewardedVideo(placementId: "rewarded_extra_coins")
        rewardedAd?.delegate = self
        rewardedAd?.load()
    }

    func showRewardedVideo(from viewController: UIViewController) {
        if rewardedAd?.isReady == true {
            rewardedAd?.show(from: viewController)
        } else {
            showAlert(message: "Video not available. Try again later.")
        }
    }
}

// MARK: - ApexMediationRewardedVideoDelegate
extension RewardedAdManager: ApexMediationRewardedVideoDelegate {
    func rewardedVideoDidLoad(_ rewardedVideo: ApexMediationRewardedVideo) {
        print("Rewarded video ready")
    }

    func rewardedVideo(_ rewardedVideo: ApexMediationRewardedVideo, didFailWithError error: Error) {
        print("Rewarded video failed: \(error.localizedDescription)")
    }

    func rewardedVideoDidStart(_ rewardedVideo: ApexMediationRewardedVideo) {
        print("User started watching")
    }

    func rewardedVideo(_ rewardedVideo: ApexMediationRewardedVideo, didRewardUser reward: ApexMediationReward) {
        print("User earned reward: \(reward.type) x\(reward.amount)")

        // Grant reward
        switch reward.type {
        case "coins":
            UserInventory.addCoins(reward.amount)
        case "lives":
            UserInventory.addLives(reward.amount)
        default:
            break
        }
    }

    func rewardedVideoDidDismiss(_ rewardedVideo: ApexMediationRewardedVideo, didComplete: Bool) {
        if didComplete {
            print("User completed video")
        } else {
            print("User closed early - no reward")
        }

        // Preload next video
        loadRewardedVideo()
    }
}
```

### Native Ads

**Swift:**

```swift
import ApexMediationSDK

class NativeAdCell: UITableViewCell {
    @IBOutlet weak var iconImageView: UIImageView!
    @IBOutlet weak var titleLabel: UILabel!
    @IBOutlet weak var bodyLabel: UILabel!
    @IBOutlet weak var ctaButton: UIButton!

    private var nativeAd: ApexMediationNativeAd?

    func configure(with nativeAd: ApexMediationNativeAd) {
        self.nativeAd = nativeAd

        // Populate UI
        titleLabel.text = nativeAd.title
        bodyLabel.text = nativeAd.body
        ctaButton.setTitle(nativeAd.callToAction, for: .normal)

        // Load icon
        if let iconUrl = nativeAd.iconUrl {
            iconImageView.loadImage(from: iconUrl)
        }

        // Register views for click tracking
        nativeAd.register(
            view: self,
            clickableViews: [ctaButton, iconImageView]
        )
    }
}

// In your view controller
class FeedViewController: UITableViewController {
    private var nativeAd: ApexMediationNativeAd?

    func loadNativeAd() {
        let adLoader = ApexMediationNativeAdLoader(placementId: "native_feed")
        adLoader.delegate = self
        adLoader.load()
    }
}

extension FeedViewController: ApexMediationNativeAdLoaderDelegate {
    func nativeAdLoader(_ loader: ApexMediationNativeAdLoader, didLoad nativeAd: ApexMediationNativeAd) {
        self.nativeAd = nativeAd
        tableView.reloadData()
    }

    func nativeAdLoader(_ loader: ApexMediationNativeAdLoader, didFailWithError error: Error) {
        print("Native ad failed: \(error.localizedDescription)")
    }
}
```

---

## SKAdNetwork Integration

ApexMediation automatically handles SKAdNetwork for iOS 14+ attribution:

```swift
// In AppDelegate
func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
) -> Bool {

    // ApexMediation registers SKAdNetwork automatically
    // No additional code needed

    ApexMediationSDK.initialize(with: config)
    return true
}
```

---

## Consent & privacy (GDPR/CCPA/COPPA/LAT)

For the modern API, set a single consent object. The SDK normalizes and forwards the data to adapters and (if enabled) S2S.

```swift
MediationSDK.shared.setConsent(ConsentData(
  gdprApplies: true,
  gdprConsentString: "<TCF>",
  ccpaOptOut: false,
  limitAdTracking: false
))
```

If you use the legacy facade (`ApexMediationSDK`), the older helpers remain available. New apps should prefer the modern call above.

```swift
import ApexMediationSDK

func checkGDPRConsent() {
    if ApexMediationSDK.isGDPRApplicable() {
        // User is in EU - show consent dialog
        showConsentDialog { consent in
            ApexMediationSDK.setGDPRConsent(consent)
        }
    }
}

// Using ApexMediation's built-in consent dialog
func showBuiltInConsentDialog() {
    ApexMediationSDK.showConsentDialog(from: self) { consent in
        print("User consent: \(consent)")
    }
}
```

---

## COPPA Compliance

For apps directed at children under 13:

```swift
let config = ApexMediationConfig(
    publisherId: "YOUR_PUBLISHER_ID",
    apiKey: "YOUR_API_KEY"
)
config.coppaCompliant = true // Disables personalized ads
```

---

## Testing & sandbox (BYO adapters)

### Adapter Dev Kit (iOS/tvOS)

Use the iOS/tvOS Adapter Dev Kit to validate adapters without shipping them in the core:

```bash
pushd sdk/adapter-dev-kit/ios
xcrun swift run apex-adapter-runner --adapter admob \
  --appId test-app --inter test_interstitial --reward test_rewarded --timeout 10
popd
```

### Sandbox flags (DEBUG/testing)

```swift
await MediationSDK.shared.setSandboxForceAdapterPipeline(true)
await MediationSDK.shared.setSandboxAdapterWhitelist(["admob"]) // or iterate returned names from adapterNames()
let names = await MediationSDK.shared.adapterNames()
```

### Test Device

```swift
ApexMediationSDK.addTestDevice("YOUR_DEVICE_IDFA")
```

Find IDFA in Console logs on first SDK initialization.

---

## Advanced Features

### Frequency Capping

```swift
let frequencyCap = ApexMediationFrequencyCap()
frequencyCap.interstitialMinInterval = 60 // seconds
frequencyCap.rewardedMinInterval = 300 // 5 minutes
frequencyCap.maxInterstitialsPerHour = 4

ApexMediationSDK.setFrequencyCap(frequencyCap)
```

### Analytics

```swift
import ApexMediationSDK

// Log custom events
ApexMediationAnalytics.logEvent("level_complete", parameters: [
    "level": 10,
    "score": 5000,
    "time_seconds": 120
])

// Log purchases
ApexMediationAnalytics.logPurchase(
    itemId: "premium_pack",
    price: 9.99,
    currency: "USD"
)
```

---

## Troubleshooting

### Ads Not Showing

1. Check initialization callback
2. Verify credentials in dashboard
3. Enable test mode
4. Check ATT permission status
5. Verify internet connection

### Build Errors

**Error**: `Module 'ApexMediationSDK' not found`
**Solution**: Run `pod install` or add package via SPM

**Error**: `Undefined symbols for architecture arm64`
**Solution**: Add `-ObjC` to "Other Linker Flags"

---

## Sample Projects

- **Swift Sample**: [github.com/apexmediation/ios-samples/swift](https://github.com/apexmediation/ios-samples/swift)
- **Objective-C Sample**: [github.com/apexmediation/ios-samples/objc](https://github.com/apexmediation/ios-samples/objc)
- **SwiftUI Sample**: [github.com/apexmediation/ios-samples/swiftui](https://github.com/apexmediation/ios-samples/swiftui)

---

## Support

- **Documentation**: [docs.apexmediation.ee](https://docs.apexmediation.ee)
- **Email**: support@apexmediation.ee
- **Discord**: [discord.gg/apexmediation](https://discord.gg/apexmediation)
- **Response Time**: < 24 hours

---

**Last Updated**: November 2025
**SDK Version**: 2.0.0
**iOS Version**: 12.0+

---

### Notes
- BYO‑first: the core Release artifact does not include vendor SDKs. Register your adapters at runtime from your app or private modules.
- Single‑entry: call `MediationSDK.initialize(...)` once per app session; all load/show calls go through the same instance.
- tvOS: no ATT prompt; focus/remote navigation differ; otherwise the integration is identical. Use the same BYO registration and sandbox flags.
