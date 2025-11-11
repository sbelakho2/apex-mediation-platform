CTV tvOS SDK — Quickstart

This guide shows how to integrate the Apex Mediation CTV SDK for tvOS.

1. Install
- Add the Swift Package to your tvOS app (Xcode ≥ 15): File → Add Packages… → enter the repo URL and select the `CTVSDK` product.
- The package manifest is located at `sdk/ctv/tvos/Package.swift`.

2. Initialize
```
import CTVSDK

@main
class AppDelegate: UIResponder, UIApplicationDelegate {
  func application(_ application: UIApplication,
                   didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
    let config = SDKConfig(appId: "your-app-id",
                           apiBaseUrl: ProcessInfo.processInfo.environment["API_BASE"] ?? "http://localhost:4000/api/v1",
                           apiKey: ProcessInfo.processInfo.environment["API_KEY"],
                           testMode: true)
    ApexMediation.shared.initialize(config: config) { ok in
      // SDK ready
    }
    return true
  }
}
```

Optionally set consent:
```
ApexMediation.shared.setConsent(ConsentData(gdprApplies: true,
                                            tcfString: "COvzTO...",
                                            usPrivacy: "1YNN"))
```

3. Interstitial/Rewarded
```
import AVKit
import CTVSDK

// Interstitial
let interstitial = InterstitialAd(placementId: "placement-id")
interstitial.load { error in
  guard error == nil else { print("Failed to load: \(error!)"); return }
  interstitial.show(on: self) { err in
    if let e = err { print("Show failed: \(e)") }
  } closed: {
    print("Interstitial closed")
  }
}

// Rewarded
let rewarded = RewardedAd(placementId: "placement-id")
rewarded.load { error in
  guard error == nil else { return }
  rewarded.show(on: self) { err in
    if let e = err { print("Show failed: \(e)") }
  } closed: {
    // grant reward
  }
}

// Optional: report a user click via signed tracking URL
interstitial.reportClick()
```

Impressions are auto‑fired at playback start; clicks are reported by calling `reportClick()` and should be wired to your UI affordances.

4. Notes
- The SDK uses S2S auction (`/rtb/bid`) and signed tokens for delivery and tracking.
- Runs on tvOS 14+.
- For staging/dev, ensure your backend is reachable by the device or simulator.

5. Troubleshooting
- 401 Unauthorized: provide an API key (Bearer) or ensure backend allows your origin/host.
- 204 No Fill: the auction returned no bid within the deadline; try a different placement or floor.
- Playback errors: verify the creative URL is reachable from the device network.
