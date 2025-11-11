# CTV Android TV SDK — Quickstart

This guide shows how to integrate the Apex Mediation CTV SDK for Android TV.

## 1. Install

Add the `sdk/ctv/android-tv` module as a dependency in your Gradle settings or publish to your internal Maven and declare:

```gradle
dependencies {
  implementation "com.rivalapex:apexmediation-ctv:0.1.0"
}
```

Ensure your app declares INTERNET permission and, for dev over http, cleartext policy.

## 2. Initialize

```kotlin
val config = com.rivalapexmediation.ctv.SDKConfig(
    appId = "your-app-id",
    apiBaseUrl = System.getenv("API_BASE") ?: "http://localhost:4000/api/v1",
    apiKey = System.getenv("API_KEY"),
    testMode = true,
)
com.rivalapexmediation.ctv.ApexMediation.initialize(applicationContext, config) { ok ->
    // ready
}
```

Optionally set consent:

```kotlin
ApexMediation.setConsent(
  com.rivalapexmediation.ctv.consent.ConsentData(
    gdprApplies = true,
    tcfString = "COvzTO...",
    usPrivacy = "1YNN"
  )
)
```

## 3. Interstitial/Rewarded

```kotlin
// PlayerView is from androidx.media3.ui.PlayerView in your layout

// Interstitial
val ad = com.rivalapexmediation.ctv.ads.InterstitialAd("placement-id")
ad.load { err ->
  if (err == null) {
    ad.show(this@Activity, findViewById(R.id.playerView), object: com.rivalapexmediation.ctv.ads.AdShowCallback {
      override fun onShown() {}
      override fun onClosed() {}
      override fun onError(code: String) {}
    })
  }
}

// Rewarded
val r = com.rivalapexmediation.ctv.ads.RewardedAd("placement-id")
r.load { err -> if (err == null) r.show(this@Activity, findViewById(R.id.playerView), object: com.rivalapexmediation.ctv.ads.AdShowCallback {
  override fun onShown() {}
  override fun onClosed() { /* grant reward */ }
  override fun onError(code: String) {}
}) }
```

Impressions are auto‑fired at first frame; clicks are handled via the signed URL returned and should be wired to your UI if desired.

## 4. Notes
- The SDK uses S2S auction (`/rtb/bid`) and signed tokens for delivery and tracking.
- OTA config is fetched best‑effort on init; local config remains valid if remote fails.
- Size budget: ≤ 1MB AAR; R8 is enabled in release.
