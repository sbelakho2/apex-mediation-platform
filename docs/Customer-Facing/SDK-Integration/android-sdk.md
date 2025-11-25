# Android SDK Integration Guide

_Last updated: 2025-11-21_

This guide explains how to integrate the ApexMediation Android SDK (`sdk/core/android`) with a BYO-first posture, optional server-to-server (S2S) auctions, normalized consent plumbing, and runtime adapter rendering.

---

## 1. Key Concepts

- **Bel* facades** expose a small, boring API surface: `BelAds` for lifecycle/consent, plus `BelInterstitial`, `BelRewarded`, `BelRewardedInterstitial`, `BelAppOpen`, and `BelBanner` for placements.
- **BYO mode is the default.** All fills are sourced through client adapters (legacy + runtime V2 bridge). S2S is opt-in and requires an API key.
- **Runtime Adapter Bridge.** Ads loaded through the runtime V2 pipeline include opaque handles. `MediationSDK.renderAd(...)` routes show() calls back into the adapter runtime on the publisher’s main thread.
- **Telemetry Guardrails.** `TelemetryCollector` redacts stack traces, clamps metadata keys, and offers local percentiles/counters for the debug panel. Credential validation events never include secrets.

---

## 2. Requirements

| Requirement | Notes |
| --- | --- |
| Android API level | minSdk 21, targetSdk 34 |
| Tooling | Android Studio Ladybug+, Gradle 8.5+, Kotlin 1.9+, Java 17 |
| Permissions | `android.permission.INTERNET` (required), `ACCESS_NETWORK_STATE` (recommended) |
| StrictMode | Enabled automatically in `debug`; opt into `penaltyDeath` via `SDKConfig.strictModePenaltyDeath(true)` for CI smoke apps |

Manifest essentials:

```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
```

---

## 3. Add the SDK to your project

### Option A — Include the module directly

1. Add the SDK module to `settings.gradle`:
   ```gradle
   include(":sdk-core-android")
   project(":sdk-core-android").projectDir = file("sdk/core/android")
   ```
2. Depend on it from your app module:
   ```gradle
   dependencies {
       implementation project(":sdk-core-android")
   }
   ```

### Option B — Build an AAR

```bash
cd sdk/core/android
./gradlew assembleRelease
```
Copy `sdk/core/android/build/outputs/aar/core-release.aar` to your app’s `libs/` folder and reference it via `implementation files("libs/core-release.aar")`.

---

## 4. Initialize early

Initialize from `Application.onCreate`. BYO mode is already the default but we set it explicitly for clarity.

```kotlin
class SampleApp : Application() {
    override fun onCreate() {
        super.onCreate()

        val cfg = SDKConfig.Builder()
            .appId("publisher-demo-app")
            .sdkMode(SdkMode.BYO)                 // default; disables S2S
            .configEndpoint("https://config.rivalapexmediation.ee")
            .auctionEndpoint("https://auction.rivalapexmediation.ee")
            .configPublicKeyBase64("BASE64_X509_ED25519_PUBLIC_KEY")
            .strictModePenaltyDeath(BuildConfig.DEBUG)
            .observabilityEnabled(true)
            .observabilitySampleRate(0.25)
            .build()

        BelAds.initialize(this, cfg.appId, cfg)
        BelAds.setLogLevel(LogLevel.DEBUG)
    }
}
```

`BelAds.initialize(...)` is idempotent. If you hot-reload config in tests the SDK tears down adapters, telemetry, and caches before re-instantiating.

---

## 5. Operating modes & S2S

| Mode | Description | When to use |
| --- | --- | --- |
| `SdkMode.BYO` | Client adapters only. Runtime bridge enforces single-use cached ads. | Default for all BYO tenants |
| `SdkMode.HYBRID` | S2S first (if enabled) with BYO fallback. Requires API key. | When you have managed demand + BYO credentials |
| `SdkMode.MANAGED` | Managed demand only (invite-only). | Contact support for availability |

To enable S2S in HYBRID/MANAGED:

```kotlin
val cfg = SDKConfig.Builder()
    .appId("publisher")
    .sdkMode(SdkMode.HYBRID)
    .enableS2SWhenCapable(true)
    .auctionApiKey("pub-live-abc123")  // preferred: set at build time
    .build()

BelAds.initialize(appContext, cfg.appId, cfg)
BelAds.setAuctionApiKey("pub-rotated-key") // optional rotation
```

When the API key is blank the SDK automatically short-circuits the S2S path and falls back to runtime adapters.

---

## 6. Consent & privacy

Source-of-truth consent should come from your CMP. Provide it explicitly:

```kotlin
BelAds.setConsent(
    gdprApplies = true,
    tcString = cmpState.tcfString,
    usPrivacy = cmpState.usPrivacy,
    coppa = false,
    limitAdTracking = userPrefs.limitAdTracking,
)
```

If you store IAB strings in shared preferences, normalize them before calling `BelAds.setConsent`:

```kotlin
val state = ConsentManager.fromIabStorage(context)
BelAds.setConsent(
    gdprApplies = state.gdprApplies,
    tcString = state.consentString,
    usPrivacy = state.usPrivacy
)
```

`MediationSDK.currentAuctionConsent()` maps these values into S2S metadata, while runtime adapters receive the same via `RuntimeAdapterConfig.privacy`.

---

## 7. Load & show ads

### Interstitials

```kotlin
BelInterstitial.load(appContext, "interstitial_home", object : AdLoadCallback {
    override fun onAdLoaded(ad: com.rivalapexmediation.sdk.models.Ad) {
        // cache hit handled internally
    }
    override fun onError(error: AdError, message: String) {
        Log.w("Ads", "Interstitial failed: $error $message")
    }
})

if (BelInterstitial.isReady()) {
    BelInterstitial.show(activity)
}
```

`BelInterstitial.show()` first attempts `MediationSDK.renderAd(ad, activity)`. If the ad originated from the runtime V2 pipeline the bound adapter renders; if it came from S2S the fallback HTML renderer executes.

### Rewarded & Rewarded Interstitial

```kotlin
BelRewarded.load(appContext, "rewarded_daily", object : AdLoadCallback {
    override fun onAdLoaded(ad: Ad) = Unit
    override fun onError(error: AdError, message: String) = Log.e("Ads", message)
})

if (BelRewarded.isReady()) {
    BelRewarded.show(activity)
}
```

The runtime show path automatically calls the registered `RewardedCallbacks`, ensuring OM video sessions and rewards fire on the main thread.

### App Open

```kotlin
BelAppOpen.load(appContext, "app_open_splash", listener)
if (BelAppOpen.isReady()) {
    BelAppOpen.show(activity)
}
```

### Banner attach/detach

```kotlin
val container: ViewGroup = findViewById(R.id.banner_container)
BelBanner.attach(container, "banner_home")
// ...onDestroy
BelBanner.detach(container)
```

`BelBanner` renders cached HTML creatives. In test mode it injects a safe placeholder if nothing is cached.

---

## 8. Runtime adapter bridge

- The SDK caches runtime handles with metadata (`runtime_partner`, `runtime_handle`).
- When an ad is evicted or consumed the handle is invalidated and never reused.
- `handleRuntimeBindings(...)` ensures only the winning adapter retains its handle; all other handles are immediately invalidated to honor BYO guardrails.
- `Bel*` facades never expose adapter credentials or raw handles to the publisher app.

---

## 9. Telemetry & validation

Enable observability when you need adapter span metrics:

```kotlin
val cfg = SDKConfig.Builder()
    .observabilityEnabled(true)
    .observabilitySampleRate(0.1)
    .observabilityMaxQueue(500)
    .build()
```

Key points:

- `TelemetryCollector.recordAdapterSpanStart/Finish` automatically tags `strategy`, `sdk_mode`, and test mode metadata.
- Latencies feed a bounded reservoir per `{placement, adapter}`. Access via the debug panel or directly (`getLocalPercentiles`).
- ValidationMode (`SDKConfig.validationModeEnabled(true)`) lets you ping adapter credentials without issuing ad requests:
  ```kotlin
  sdk.validateCredentials(listOf("applovin"), object : ValidationCallback {
      override fun onComplete(results: Map<String, ValidationResult>) {
          Log.d("Validation", "applovin => ${results["applovin"]}")
      }
  })
  ```

---

## 10. Debugging tools

- **Debug Panel:** `BelAds.showDebugPanel(activity)` surfaces placements, cached ads, consent state, and local telemetry.
- **OM SDK:** Inject `BelAds.setOmSdkController(...)` to bridge into your OMID implementation. `Bel*` facades automatically start/end sessions when ads render.
- **StrictMode:** In `debug`, the SDK enforces thread policies. If you enable `strictModePenaltyDeath(true)` your app will crash on violations, mirroring the CI `strictmodeSmoke` gate.

---

## 11. Testing & CI

- Run unit tests (Robolectric + MockWebServer) locally:
  ```bash
  cd sdk/core/android
  JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64 ./gradlew testDebugUnitTest
  ```
- The primary CI job also runs `strictmodeSmoke`, Dokka (`generateApiDocs`), and an AAR size gate. Ensure these pass before release candidates.

---

## 12. Troubleshooting checklist

| Symptom | Action |
| --- | --- |
| `IllegalStateException: SDK not initialized` | Call `BelAds.initialize()` once in `Application.onCreate` before any load/show calls. |
| `AdError.NO_FILL` immediately | Verify placement exists in remote config and at least one adapter is enabled. In BYO mode, ensure `AdapterConfigProvider` returns credentials. |
| S2S path never fires | Confirm `sdkMode` ≠ BYO, `enableS2SWhenCapable(true)`, and `auctionApiKey` is non-empty. Use debug logs to confirm `shouldUseS2SForPlacement` is true. |
| OM measurement missing | Ensure you set a custom controller via `BelAds.setOmSdkController` and that the IAB OM SDK dependency is included. |
| Telemetry queues grow | Increase `observabilityMaxQueue`, or disable telemetry during local tests. |

---

## 13. Reference commands

```bash
# Build + test
cd sdk/core/android
JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64 ./gradlew testDebugUnitTest

# Generate Dokka docs (matches CI)
JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64 ./gradlew generateApiDocs
```

Need help? Reach out via the console’s Support workspace with your app ID, SDK log snippet, and consent state summary from the debug panel.
