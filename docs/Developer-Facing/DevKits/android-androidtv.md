### Android & Android TV Adapter Dev Kit (BYO-first)

Purpose
- Enable publishers/partners to implement and certify adapters without bundling vendor SDKs in ApexMediation Core.

Key guarantees
- Core Release artifacts ship with no vendor adapters; discovery is gated to DEBUG or `apex.sandbox.adapters=1`.
- Single entry (`MediationSDK.initialize(...)`) and simple consent are preserved.
- Sandbox/test logic is separate from production artifacts.
- Privacy & attribution: consent snapshot normalized to `gdprApplies`/TCF/USP/COPPA/LAT and forwarded to adapters + telemetry; Privacy Sandbox Attribution Reporting exposed via `AttributionBridge` (reflection-based, safe no-op when AdServices is absent) for BYO demos.

Runtime registration (BYO)
```kotlin
// Register your adapter factory before initialize(); lives in your app/private module
MediationSDK.registerRuntimeAdapterFactory("admob") { ctx -> PublisherAdMobAdapter(ctx) }

// Then initialize once
MediationSDK.initialize(appContext, "your-app-id")
```

Sandbox controls (DEBUG/testing)
```kotlin
MediationSDK.setSandboxForceAdapterPipeline(true)            // bypass S2S path
MediationSDK.setSandboxAdapterWhitelist(listOf("admob"))    // focus one adapter
val names = MediationSDK.getAdapterNames()                   // diagnostics
```

Adapter V2 skeleton
```kotlin
class PublisherAdMobAdapter(private val context: Context) : AdNetworkAdapterV2 {
  override fun name(): String = "admob"
  override fun init(config: AdapterConfig, timeoutMs: Int): InitResult {
    // Initialize vendor SDK here (publisher supplies dependency)
    return InitResult(true)
  }
  override suspend fun loadInterstitial(placement: String, meta: RequestMeta, timeoutMs: Int): LoadResult { /* ... */ }
  override suspend fun loadRewarded(placement: String, meta: RequestMeta, timeoutMs: Int): LoadResult { /* ... */ }
  override fun showInterstitial(handle: AdHandle, viewContext: Any, callbacks: ShowCallbacks) { /* exactly-once */ }
  override fun showRewarded(handle: AdHandle, viewContext: Any, callbacks: RewardedCallbacks) { /* exactly-once */ }
  override fun invalidate(handle: AdHandle) { /* cleanup */ }
}
```

Conformance tests (JUnit)
```kotlin
@Test fun interstitial_order_is_exactly_once() {
  val cb = object: ShowCallbacks {/* collect events */}
  val fake = PublisherAdMobAdapter(ApplicationProvider.getApplicationContext())
  val res = fake.loadInterstitial("test_interstitial", RequestMeta(), 2000)
  assertTrue(res.success)
  fake.showInterstitial(res.handle!!, Any(), cb)
  // assert sequence: shown → closed(FINISHED)
}
```

Android TV specifics
- D‑pad/focus-friendly UI; avoid touch-only widgets in ad overlays.
- Prefer full‑screen video/interstitial; banners must be remote-safe.
- The TV sandbox app can iterate adapters using reflection if the core is present.

Discovery gating (Release safety)
- Reflection-based discovery runs only when `BuildConfig.DEBUG` or `System.getProperty("apex.sandbox.adapters") == "1"`.
- No default vendor registrations in Release; publishers must register factories.

Links
- Core guide: `docs/Developer-Facing/AdapterDevKit.md`
- Android SDK integration (customer): `docs/Customer-Facing/SDK-Integration/android-sdk.md`
