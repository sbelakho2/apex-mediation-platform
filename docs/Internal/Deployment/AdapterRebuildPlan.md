# Adapter Rebuild Plan (Android SDK)

**Objective:** Rebuild all 15 Android mediation adapters to invoke the official vendor SDKs directly (no mocks or custom renderers), cover interstitial + rewarded (plus banner/app-open where GA), and ship automated tests that run against the vendor-provided test ad units/sandboxes.

## Global sequencing & guardrails

1. **Dependency onboarding**
   - Add Maven repos (Pangle, Mintegral, Fyber) + SDK coordinates in `sdk/core/android/build.gradle`.
   - Capture license acceptance per vendor in `docs/Internal/Legal/VendorLicenses.md` (create if missing).
2. **Adapter pattern** (repeat for every partner)
   1. Implement Kotlin adapter class wiring to vendor SDK lifecycle (init/load/show/isReady/invalidate).
   2. Use vendor view/render APIs (e.g., `ISInterstitialAd.show`, `VungleInterstitial.loadAd`). No WebView fallbacks.
   3. Map callbacks into `ShowCallbacks`/`RewardedCallbacks`, paid events, and error taxonomy.
   4. Store handles using shared `AdHandle` abstraction (one handle per vendor object instance).
   5. Add instrumentation/unit tests that call the real SDK using vendor “test mode” placement IDs or loopback harnesses. Tests must run under Robolectric or instrumentation as required by the vendor SDK.
   6. Update documentation (`Adapters.md`, release notes) and run lint/tests.
3. **Verification**
   - After each adapter lands, run: targeted unit tests, sample app smoke (strictmode or local harness), and `./gradlew lintDebug`.
   - At the end, run full suite + Game Day validation from `PRODUCTION.md`.

## Per-adapter scope

| Order | Adapter | SDK Artifact | Key config fields | Required formats | Test strategy |
| --- | --- | --- | --- | --- | --- |
| 1 | Moloco | `com.moloco.sdk:moloco-ads:1.2.0` | seatId, apiKey, placementIds | Interstitial, Rewarded | REST-token-based SDK; use Moloco demo placements and ensure bid token freshness before load. |
| 2 | ironSource LevelPlay | `com.ironsource.sdk:mediationsdk:7.6.0` | appKey, instanceIds | Interstitial, Rewarded, Banner | Instrumented test (SDK requires Looper). Use LevelPlay demand-only API (`IronSource.loadISDemandOnlyInterstitial`). |
| 3 | Vungle/Liftoff | `com.vungle:vungle-ads:7.1.0` | appId, placementIds | Interstitial, Rewarded | Instrumented test with `Vungle.init` and test placement `TEST_INT`. Handle Retry-After via SDK callbacks. |
| 4 | Tapjoy | `com.tapjoy:tapjoy-android-sdk:13.0.1` | sdkKey, placementIds | Interstitial, Rewarded (reward currency) | Tapjoy sample placements; ensure rewarded callback maps to `onRewardVerified`. |
| 5 | Smaato | `com.smaato.android.sdk:smaato-sdk:22.0.0` | publisherId, adSpaceIds | Interstitial, Rewarded, Banner | Use Smaato demo ad spaces; ensure consent forwarded via `SmaatoSdk.setGPDRConsent`. |
| 6 | Pangle | `com.bytedance.sdk:pangle-sdk:5.7.0.1` + ByteDance repo | appId, placementCodes, region | Interstitial, Rewarded, Banner | Requires instrumentation tests + mocked device ID. Use Pangle test placements. |
| 7 | Mintegral | `com.mintegral.msdk:mtg-sdk:16.5.41` + Mintegral repo | appId, appKey, unitIds | Interstitial, Rewarded | Use Mintegral demo units; ensure strict parameter validation + error mapping. |
| 8 | Fyber/FairBid | `com.fyber:fairbid-sdk:4.6.0` | appId, token, placementIds | Interstitial, Rewarded, Banner | Instrumented test running FairBid test suite; ensure demand-only usage path. |
| 9 | Meta Audience Network | `com.facebook.android:audience-network-sdk:6.16.0` | placementIds | Interstitial, Rewarded, Banner | Requires instrumentation + mock ATT status. Use Meta test placements + `AudienceNetworkAds.initialize`. |
| 10 | Chartboost | `com.chartboost:chartboost-sdk:9.6.1` | appId, appSignature, locations | Interstitial, Rewarded | Instrumented test; ensure `Chartboost.addLevelPlayable` not used. Paid events from `ChartboostCacheEvent`. |
| 11 | AppLovin (MAX demand) | `com.applovin:applovin-sdk:12.2.0` | sdkKey, adUnitIds | Interstitial, Rewarded, Banner | Use `AppLovinAdLoadListener`; ensure we never call MAX mediation APIs. |
| 12 | Amazon Ads / APS / DTB | `com.amazon.android:aps-sdk:9.7.1` | appKey, slotIds | Interstitial, Rewarded, Banner | Use APS test slots; ensure supply-chain compliance flags sent. |
| 13 | AdMob (Google) | `com.google.android.gms:play-services-ads:23.0.0` | appId, adUnitIds | Interstitial, Rewarded, App-Open, Banner | Use Google sample ad units; rely on MobileAds SDK instrumentation tests. |
| 14 | AdColony | `com.adcolony:sdk:4.8.0` | appId, zoneIds | Interstitial, Rewarded | Instrumented tests verifying completion vs close. |
| 15 | Amazon CTV fallback adapter (if separate) | Use VAST renderer | Fullscreen video | Use Fire TV emulator tests. |

> Note: Banner/app-open work (#17) will piggyback on adapters above once base formats are done.

## Test coverage expectations

- **Unit / Robolectric:** Validate config parsing, handle lifecycle, paid event mapping.
- **Instrumentation (connected) tests:** Invoke real vendor SDK test placements. Use Gradle managed devices or Firebase Test Lab where headless is unsupported.
- **Sample app smoke:** Expand `strictmode-sample` to include toggles per network to verify rendering on real devices.

## Deliverables per adapter

1. Kotlin implementation under `sdk/core/android/src/main/kotlin/com/rivalapexmediation/sdk/adapters/<partner>/`.
2. Tests under `sdk/core/android/src/test/...` (Robolectric) plus `src/androidTest/...` when vendor SDK requires instrumentation.
3. Gradle dependency updates (including proguard keep rules if vendor requires).
4. Docs update referencing supported formats, config keys, and testing steps.
5. Release note entry in `CHANGELOG.md`.
6. Verification evidence (test logs/screenshots) stored in `docs/Internal/Testing/<partner>/`.

This plan unlocks Todo #2. Next task: start executing adapters sequentially beginning with Moloco.
