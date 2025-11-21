# Android SDK Quick Start (ApexMediation)

Last updated: 2025-11-21

This guide helps you integrate the Android SDK quickly with a focus on privacy, reliability, and offline-friendly development.

## 1) Requirements
- Android minSdk 21, targetSdk 34
- Java 17 / Kotlin 1.9+
- INTERNET permission in your app manifest

```xml
<uses-permission android:name="android.permission.INTERNET" />
```

## 2) Gradle setup
The SDK is an Android library module in this repository (sdk/core/android). Build it via Gradle and include the AAR as needed. A release AAR size guard (≤ 500KB) is enforced.

## 3) Initialize the SDK
Call initialize early (e.g., Application.onCreate). StrictMode checks are enabled in debug builds and default to penaltyLog (non-crashing). You can opt into penaltyDeath via SDKConfig.Builder for CI smoke apps.

```kotlin
val cfg = com.rivalapexmediation.sdk.SDKConfig.Builder()
    .appId("your-publisher-id")
    .sdkMode(com.rivalapexmediation.sdk.SdkMode.BYO) // default; blocks S2S until explicitly re-enabled
    // Optional overrides for local/dev
    .configEndpoint("http://10.0.2.2:8081")
    .auctionEndpoint("http://10.0.2.2:8081")
    // (Production) Provide Base64 Ed25519 public key for OTA config signature verification
    .configPublicKeyBase64("BASE64_X509_ED25519_PUBLIC_KEY")
    // For CI smoke app only: crash on StrictMode violations in debug
    .strictModePenaltyDeath(true)
    .build()

val sdk = com.rivalapexmediation.sdk.BelAds.initialize(
    context = applicationContext,
    appId = "your-publisher-id",
    config = cfg
)

// Optional: provide an auction API key (only when enabling HYBRID/MANAGED modes)
com.rivalapexmediation.sdk.BelAds.setAuctionApiKey("YOUR_AUCTION_API_KEY")

// Provide explicit consent (source of truth is your app)
com.rivalapexmediation.sdk.BelAds.setConsent(
    gdprApplies = true,                 // or null if unknown
    tcString = "TCF_STRING",          // TCF v2 string from your CMP
    usPrivacy = "1YNN",               // IAB US Privacy string
    coppa = false,
    limitAdTracking = true
)
```

Tip: A helper exists to normalize consent strings without auto-reading:
```kotlin
val state = com.rivalapexmediation.sdk.consent.ConsentManager.normalize(
    tcf = "TCF_STRING",
    usp = "1YNN",
    gdprApplies = true,
    coppa = false,
    limitAdTracking = true,
)
sdk.setConsent(
    gdprApplies = state.gdprApplies,
    consentString = state.consentString,
    usPrivacy = state.usPrivacy,
    coppa = state.coppa,
    limitAdTracking = state.limitAdTracking,
)
```

### Optional: Enable server-to-server auctions (HYBRID/MANAGED)

BYO is the default operating mode; all fills are sourced via client adapters and guarded by the runtime bridge. To re-enable the server-to-server (S2S) header bidding path you must:

1. Switch the SDK into `SdkMode.HYBRID` or `SdkMode.MANAGED`.
2. Set `enableS2SWhenCapable(true)` so S2S becomes eligible for placements that declare it.
3. Provide an auction API key up front (builder) or at runtime (`BelAds.setAuctionApiKey`) so the SDK can authenticate to the auction endpoint.

```kotlin
val cfg = SDKConfig.Builder()
    .appId("your-publisher-id")
    .sdkMode(SdkMode.HYBRID)
    .enableS2SWhenCapable(true)
    .auctionEndpoint("https://auction.rivalapexmediation.com")
    .auctionApiKey("pub-live-abc123")
    .build()

BelAds.initialize(appContext, cfg.appId, cfg)
// Optional rotation after initialize (for key rollovers)
BelAds.setAuctionApiKey("pub-rotated-key")
```

When the API key is omitted (BYO default), S2S is disabled and `Bel*` facades rely exclusively on runtime adapters + legacy adapters.

## 4) Configure placements
Placements and network config are delivered by remote config. In dev, you can point the backend auction to http://localhost:8081 and use mocked responses.

## 5) Request an interstitial
The SDK first tries a server-to-server (S2S) auction with normalized error taxonomy and falls back to local adapters on no fill.

Using the simple facade API:
```kotlin
com.rivalapexmediation.sdk.BelInterstitial.load(
    context = applicationContext,
    placementId = "interstitial_placement",
    listener = object : com.rivalapexmediation.sdk.AdLoadCallback {
        override fun onAdLoaded(ad: com.rivalapexmediation.sdk.models.Ad) {
            // Optionally show immediately, or later using BelInterstitial.show(activity)
        }
        override fun onError(error: com.rivalapexmediation.sdk.AdError, message: String) {
            // Error taxonomy: TIMEOUT, NETWORK_ERROR, NO_FILL, INTERNAL_ERROR
        }
    }
)

// Later, typically from an Activity:
if (com.rivalapexmediation.sdk.BelInterstitial.isReady()) {
    com.rivalapexmediation.sdk.BelInterstitial.show(this)
}

Ads loaded through the runtime adapter bridge carry opaque handles. `BelInterstitial.show()` first asks `MediationSDK.renderAd(...)` to forward the handle back to the adapter runtime; if the ad originated from S2S it gracefully falls back to the placeholder renderer.
```

## 6) Error taxonomy
- timeout → TIMEOUT
- status_XXX (HTTP) → INTERNAL_ERROR (message keeps status_XXX)
- no_fill → NO_FILL
- network_error (I/O) → NETWORK_ERROR
- other → INTERNAL_ERROR

## 7) Privacy notes
- The SDK does not access GAID/IDFA by default.
- Do not send raw IP/User-Agent from client; the server derives as needed.
- Consent is explicitly provided by the app; no background scraping.

## 8) Telemetry & observability
- `SDKConfig.observabilityEnabled` and `observabilitySampleRate` let you emit sanitized adapter span telemetry. Sampling happens client-side so you can run at 100% in staging and a smaller fraction in production.
- All telemetry passes through `TelemetryRedactor`, stripping stack traces to 500 chars and clamping metadata keys to 40 characters to keep payloads credential-free.
- `TelemetryCollector.getLocalPercentiles(...)` and `getLocalCounters(...)` expose in-memory diagnostics that the debug panel surfaces. These never leave the device and respect the same sampling gates.
- Credential validation flows emit `CREDENTIAL_VALIDATION_SUCCESS/FAILED` events with only key names; no secrets ever hit telemetry or logs.

## 9) Dev & Testing
- Offline tests use MockWebServer; no external credentials required.
- The S2S auction request supports metadata consent flags (gdpr_applies/us_privacy/coppa/LAT) and respects timeouts.

## 10) Troubleshooting
- Ensure CORS_ORIGIN is set on the auction service if calling from a webview/website.
- For local auction: export NEXT_PUBLIC_AUCTION_URL=http://localhost:8081 (website) and run the Go auction service.
- Enable debug logs and StrictMode in debug builds to catch misconfigurations.

## 11) Roadmap
- Interstitial lifecycle controller with TTL caching and sample app.
- Integration validator Gradle task to verify manifest/ProGuard/network security configuration.


## 12) Request a rewarded ad
The API mirrors interstitials via a tiny facade:

```kotlin
com.rivalapexmediation.sdk.BelRewarded.load(
    context = applicationContext,
    placementId = "rewarded_placement",
    listener = object : com.rivalapexmediation.sdk.AdLoadCallback {
        override fun onAdLoaded(ad: com.rivalapexmediation.sdk.models.Ad) {
            // Show later from an Activity
        }
        override fun onError(error: com.rivalapexmediation.sdk.AdError, message: String) {
            // Handle taxonomy-mapped error
        }
    }
)

// Later, from an Activity:
if (com.rivalapexmediation.sdk.BelRewarded.isReady()) {
    com.rivalapexmediation.sdk.BelRewarded.show(this)
}
```

Rewarded and rewarded interstitial placements reuse the same runtime bridge. When an adapter runtime returns a handle, `BelRewarded.show()` routes the call through `MediationSDK.renderAd(...)` so the adapter’s own video controller is invoked before OM measurement hooks fire.

## 13) Banners: attach to a container
For banners, attach to a container ViewGroup (e.g., FrameLayout). If a banner creative is cached, it will render. In test mode, a safe placeholder appears if no creative is cached.

```kotlin
val container: ViewGroup = findViewById(R.id.banner_container)
com.rivalapexmediation.sdk.BelBanner.attach(container, placementId = "banner_placement")

// When leaving the screen
com.rivalapexmediation.sdk.BelBanner.detach(container)
```

Notes:
- This MVP banner render uses an off-main-thread load and main-thread WebView render without JavaScript. Production banners will add auto-refresh and lifecycle handling.

## 14) OM SDK (Open Measurement) — optional hooks
If you include the IAB OM SDK in your app and want to start measurement sessions when ads show, provide an OmSdkController implementation and inject it:

```kotlin
class MyOmController : com.rivalapexmediation.sdk.measurement.OmSdkController {
    override fun startDisplaySession(activity: Activity, placementId: String, networkName: String, creativeType: String?) {
        // TODO: start OMID display session
    }
    override fun startVideoSession(activity: Activity, placementId: String, networkName: String, durationSec: Int?) {
        // TODO: start OMID video session
    }
    override fun endSession(placementId: String) {
        // TODO: end OMID session
    }
}

// At initialization time (e.g., after BelAds.initialize)
BelAds.setOmSdkController(MyOmController())
```

Notes:
- The default controller is a safe no-op; integrating OM is optional.
- Our public show() paths for Interstitial, Rewarded, and App Open will call start/end session.

## 15) In-app Debug Panel
Use the built-in debug panel to inspect SDK state (app id, placements, consent, test mode) and recent actions.

```kotlin
com.rivalapexmediation.sdk.BelAds.showDebugPanel(activity)
```

This is safe for debug builds and redacts sensitive fields.



## 16) Optional: Read consent from IAB storage (opt-in)
If you use a CMP that writes standard IAB keys to SharedPreferences, you can read them explicitly and pass them to the SDK:

```kotlin
val state = com.rivalapexmediation.sdk.consent.ConsentManager.fromIabStorage(appContext)
com.rivalapexmediation.sdk.BelAds.setConsent(
    gdprApplies = state.gdprApplies,
    tcString = state.consentString,
    usPrivacy = state.usPrivacy
)
```

## 17) Additional ad formats (facade APIs)
- Rewarded Interstitial:
```kotlin
com.rivalapexmediation.sdk.BelRewardedInterstitial.load(appContext, "rewarded_interstitial", listener)
if (com.rivalapexmediation.sdk.BelRewardedInterstitial.isReady()) {
    com.rivalapexmediation.sdk.BelRewardedInterstitial.show(activity)
}
```

- App Open:
```kotlin
com.rivalapexmediation.sdk.BelAppOpen.load(appContext, "app_open_placement", listener)
if (com.rivalapexmediation.sdk.BelAppOpen.isReady()) {
    com.rivalapexmediation.sdk.BelAppOpen.show(activity)
}
```

Notes:
- Test mode warnings: calling BelAds.setTestMode(true) in release will log a warning; disabling test mode in debug will also log a hint to use official test placements/devices.
