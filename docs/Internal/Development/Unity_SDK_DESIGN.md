# Unity SDK Design & Implementation Plan

**Last updated**: 2025-11-11  
**Owner**: Platform Engineering  
**Status**: Design Phase  
**Target Completion**: 2-3 weeks from start

---

## Executive Summary

Design a production-ready Unity SDK achieving parity with Android/iOS implementations while addressing Unity-specific constraints (C# interop, IL2CPP, asset loading, lifecycle). The SDK must support both S2S auction flow and maintain world-class DX for Unity game developers.

**Key Design Principles**:
- **Platform parity**: Match Android/iOS feature set (facades, OTA config, consent, debugging)
- **Unity-native ergonomics**: Coroutine-based async, ScriptableObject config, Inspector-friendly
- **Build target flexibility**: Works on iOS, Android, WebGL, standalone (with graceful degradation)
- **Zero dependencies**: No external packages beyond Unity standard library
- **Size budget**: ≤ 300KB uncompressed DLL (smaller than mobile SDKs due to shared runtime)

---

## Legend
- [ ] Not started
- [~] In progress  
- [x] Done

---

## 1. Architecture & Core Infrastructure (P0)

### 1.1 Project Structure & Assembly Definition

**Goal**: Establish clean module boundaries and enable proper symbol stripping for production builds.

**Tasks**:
- [ ] Create `Packages/com.rivalapexmediation.sdk/` package structure following Unity Package Manager conventions
  - [ ] `Runtime/` — Core SDK code (scripts, prefabs, configs)
  - [ ] `Editor/` — Unity Editor tooling (inspectors, validation, debug UI)
  - [ ] `Tests/` — Play Mode and Edit Mode tests
  - [ ] `Samples~/ ` — Sample scenes (excluded from package exports)
  - [ ] `Documentation~/` — API docs and integration guides

**File Structure**:
```
Packages/com.rivalapexmediation.sdk/
├── package.json (Unity package manifest with dependencies)
├── Runtime/
│   ├── ApexMediation.asmdef (assembly definition)
│   ├── Core/
│   │   ├── ApexMediation.cs (main API entry point)
│   │   ├── MediationSDK.cs (singleton manager)
│   │   ├── AdTypes/ (Interstitial, Rewarded, Banner, etc.)
│   │   └── Models/ (AdRequest, AdResponse, AdError, Consent)
│   ├── Network/
│   │   ├── AuctionClient.cs (UnityWebRequest wrapper)
│   │   └── NetworkHelpers.cs (retry, timeout, JSON parsing)
│   ├── Config/
│   │   ├── SDKConfig.cs (ScriptableObject for Inspector)
│   │   ├── ConfigManager.cs (OTA config fetcher + cache)
│   │   └── SignatureVerifier.cs (Ed25519 verification via Chaos.NaCl or BouncyCastle)
│   ├── Consent/
│   │   ├── ConsentManager.cs (GDPR/CCPA/COPPA state)
│   │   └── IABConsentReader.cs (optional Unity-compatible IAB TCF)
│   ├── Telemetry/
│   │   ├── TelemetryService.cs (OM SDK hooks, event logging)
│   │   └── Logger.cs (configurable logging with PII redaction)
│   └── Debug/
│       └── DebugPanel.cs (runtime debug UI using IMGUI or UIToolkit)
├── Editor/
│   ├── ApexMediationEditor.asmdef
│   ├── SDKConfigInspector.cs (custom inspector for SDKConfig)
│   ├── IntegrationValidator.cs (pre-build validation checks)
│   └── DebugWindow.cs (Editor window for testing/diagnostics)
├── Tests/
│   ├── Runtime/
│   │   ├── ApexMediationTests.asmdef (test assembly)
│   │   ├── AuctionClientTests.cs
│   │   ├── ConfigManagerTests.cs
│   │   ├── ConsentTests.cs
│   │   └── AdLifecycleTests.cs
│   └── Editor/
│       └── ValidationTests.cs
└── Samples~/
    ├── BasicIntegration/
    │   ├── Scenes/
    │   │   └── SampleScene.unity
    │   └── Scripts/
    │       └── AdIntegrationExample.cs
    └── AdvancedUsage/
        └── ...
```

**Assembly Definition Requirements**:
- [ ] `ApexMediation.asmdef` — Runtime assembly with no external dependencies (except Chaos.NaCl for crypto)
- [ ] `ApexMediationEditor.asmdef` — Editor-only assembly with `UnityEditor` reference
- [ ] `ApexMediationTests.asmdef` — Test assembly referencing Runtime + `UnityEngine.TestRunner`

**Acceptance**:
- [ ] Package imports cleanly into Unity 2020.3+ without errors
- [ ] Assembly definitions prevent Runtime code from referencing Editor APIs
- [ ] DLL size after IL2CPP stripping ≤ 300KB (measured via build report)

---

### 1.2 Platform Abstraction & Build Target Support

**Goal**: Handle platform-specific behavior (iOS vs. Android vs. WebGL) with clean abstractions.

**Tasks**:
- [ ] Implement `IPlatformBridge` interface with platform-specific implementations
  ```csharp
  public interface IPlatformBridge
  {
      string GetDeviceId(); // IDFV on iOS, Android ID hash on Android
      string GetAdvertisingId(); // IDFA/GAID with ATT/permissions
      bool IsLimitAdTrackingEnabled();
      string GetUserAgent();
      void OpenURL(string url);
      void ShowNativeDialog(string title, string message);
  }
  ```

- [ ] Create concrete implementations:
  - [ ] `IOSPlatformBridge.cs` — Uses `#if UNITY_IOS` with native plugin calls
  - [ ] `AndroidPlatformBridge.cs` — Uses `AndroidJavaObject` to call Android APIs
  - [ ] `WebGLPlatformBridge.cs` — Uses `Application.ExternalCall` for JavaScript interop
  - [ ] `StandalonePlatformBridge.cs` — Mock implementation for Editor/Desktop builds

- [ ] Implement platform detection and bridge selection in `MediationSDK.cs`:
  ```csharp
  private IPlatformBridge InitializePlatformBridge()
  {
      #if UNITY_IOS && !UNITY_EDITOR
          return new IOSPlatformBridge();
      #elif UNITY_ANDROID && !UNITY_EDITOR
          return new AndroidPlatformBridge();
      #elif UNITY_WEBGL && !UNITY_EDITOR
          return new WebGLPlatformBridge();
      #else
          return new StandalonePlatformBridge(); // Editor/Desktop
      #endif
  }
  ```

**iOS Native Plugin** (if needed for IDFA/ATT):
- [ ] Create `Plugins/iOS/ApexMediationBridge.mm` for Objective-C interop
- [ ] Implement `extern "C"` functions callable from C#:
  - `const char* _ApexGetIDFV()`
  - `const char* _ApexGetIDFA()`
  - `int _ApexGetATTStatus()`

**Android Native Plugin** (if needed for GAID):
- [ ] Create `Plugins/Android/ApexMediationBridge.aar` or use `AndroidJavaClass` directly
- [ ] Access `AdvertisingIdClient.Info` for GAID (requires Google Play Services check)

**Acceptance**:
- [ ] SDK correctly detects platform at runtime and uses appropriate bridge
- [ ] `GetAdvertisingId()` returns valid IDFA on iOS (when ATT authorized), GAID on Android
- [ ] WebGL build gracefully degrades (no crashes, logs warnings for unsupported features)
- [ ] Editor builds use mock bridge and don't require device IDs

---

### 1.3 Initialization & Lifecycle Management

**Goal**: Provide a singleton SDK instance with safe initialization and Unity lifecycle integration.

**Tasks**:
- [ ] Implement `ApexMediation` static API class as main entry point:
  ```csharp
  public static class ApexMediation
  {
      public static void Initialize(SDKConfig config, Action<bool> onComplete);
      public static void SetConsent(ConsentData consent);
      public static void SetTestMode(bool enabled);
      public static void SetDebugLogging(bool enabled);
      public static bool IsInitialized { get; }
      public static string Version { get; }
  }
  ```

- [ ] Create `MediationSDK` MonoBehaviour singleton:
  - [ ] Singleton pattern using `DontDestroyOnLoad` to persist across scenes
  - [ ] Lazy initialization on first API call
  - [ ] Coroutine management for async operations (config fetch, auction requests)
  - [ ] Lifecycle hooks: `OnApplicationPause`, `OnApplicationQuit` for cleanup

- [ ] Initialization sequence:
  1. Validate `SDKConfig` (API key present, app ID format)
  2. Load cached OTA config from `PlayerPrefs` (if available)
  3. Fetch fresh OTA config from backend (async, non-blocking)
  4. Verify config signature (Ed25519) if in production mode
  5. Initialize platform bridge and consent manager
  6. Fire `onComplete(true)` callback on main thread

**Error Handling**:
- [ ] Graceful degradation if config fetch fails (use cached or default config)
- [ ] Clear error messages logged via `UnityEngine.Debug.LogError` with redaction
- [ ] `onComplete(false)` if initialization fails (invalid API key, network unreachable)

**Thread Safety**:
- [ ] All public APIs callable from main thread only (assert via `UnityEngine.Assertions`)
- [ ] Callbacks always fired on main thread using `UnityMainThreadDispatcher` or `SynchronizationContext`

**Acceptance**:
- [ ] `ApexMediation.Initialize()` completes in <2 seconds on typical network
- [ ] SDK survives scene transitions without re-initialization
- [ ] Unit tests verify singleton behavior and idempotent initialization
- [ ] Editor integration validator warns if initialized multiple times

---

## 2. Ad Format Implementations (P0)

### 2.1 Interstitial Ads

**Goal**: Full-screen ad format with lifecycle callbacks matching Android/iOS parity.

**Public API**:
```csharp
public class ApexInterstitial
{
    public static void Load(string placementId, Action<AdError> onLoaded);
    public static void Show(string placementId, Action<AdError> onShown, Action onClosed);
    public static bool IsReady(string placementId);
}
```

**Implementation Tasks**:
- [ ] Create `InterstitialController.cs`:
  - [ ] State machine: `IDLE → LOADING → LOADED → SHOWING → CLOSED`
  - [ ] Ad caching with TTL (configurable, default 3600s)
  - [ ] Prefetching support (optional auto-load after show)
  - [ ] Double-show prevention (guard against `Show()` called twice)

- [ ] S2S auction flow:
  1. Build `AdRequest` with device info, consent, placement ID
  2. Call `AuctionClient.RequestBid()` (coroutine-based)
  3. Parse `AdResponse`, cache creative URL + metadata
  4. Store expiry timestamp (`Time.realtimeSinceStartup + TTL`)
  5. Fire `onLoaded(null)` callback on success, `onLoaded(AdError)` on failure

- [ ] Show flow:
  1. Validate ad is loaded and not expired
  2. Instantiate fullscreen overlay (UI Canvas + WebView or video player)
  3. Load creative URL (image/video/HTML)
  4. Emit OM SDK `impressionOccurred` event
  5. Wait for user interaction or auto-close timer
  6. Fire `onClosed()` callback, destroy overlay GameObject
  7. Mark placement as `IDLE`, ready for next load

**Creative Rendering Options**:
- [ ] **Image Interstitials**: Use `UnityEngine.UI.RawImage` with `UnityWebRequestTexture`
- [ ] **Video Interstitials**: Use `UnityEngine.Video.VideoPlayer` with HLS/MP4 support
- [ ] **HTML Interstitials**: Use embedded WebView (Vuplex or UniWebView) or redirect to external browser

**OM SDK Integration**:
- [ ] Emit `sessionStart`, `impressionOccurred`, `sessionFinish` events via `TelemetryService`
- [ ] Track viewability duration (visible time on screen)

**Error Handling**:
- [ ] Network timeout → `AdError.TIMEOUT`
- [ ] No fill from auction → `AdError.NO_FILL`
- [ ] Creative load failure → `AdError.INTERNAL_ERROR`
- [ ] Placement not configured → `AdError.INVALID_PLACEMENT`

**Acceptance**:
- [ ] Interstitial loads, shows, and closes without memory leaks (tested via Unity Profiler)
- [ ] Callbacks fire on main thread with correct error codes
- [ ] Ad respects TTL and shows "Ad expired" error if shown after expiry
- [ ] Double-show prevention works (second `Show()` call logs warning, no-ops)

---

### 2.2 Rewarded Ads

**Goal**: Video/interactive ad with reward callback, matching mobile SDK semantics.

**Public API**:
```csharp
public class ApexRewarded
{
    public static void Load(string placementId, Action<AdError> onLoaded);
    public static void Show(string placementId, Action<AdError> onShown, Action<Reward> onRewarded, Action onClosed);
    public static bool IsReady(string placementId);
}

public struct Reward
{
    public string Type;   // e.g., "coins", "lives"
    public int Amount;    // e.g., 100
}
```

**Implementation Tasks**:
- [ ] Create `RewardedController.cs` mirroring `InterstitialController` with additional:
  - [ ] Reward validation: check server-side reward callback before firing `onRewarded`
  - [ ] Completion tracking: ad must play to completion (or user engagement threshold)
  - [ ] Retry logic: if reward verification fails, fire `onRewarded` with `null` and log error

- [ ] S2S auction flow (same as Interstitial with `ad_type=rewarded`)

- [ ] Show flow with reward semantics:
  1. Validate ad loaded and not expired
  2. Show video/interactive creative (full-screen, no skip button until completion)
  3. Track progress (e.g., video playback % via `VideoPlayer.time`)
  4. On completion (≥80% watched or explicit completion event):
     - Fire OM SDK `videoComplete` event
     - Call backend reward verification endpoint (optional, if server-side rewards enabled)
     - Fire `onRewarded(reward)` callback
  5. On user close before completion: fire `onClosed()` without reward
  6. Destroy overlay, reset state

**Reward Verification (Optional Server-Side)**:
- [ ] POST `/api/v1/rewards/verify` with `{ placement_id, user_id, ad_id }`
- [ ] Backend validates completion and returns `{ valid: true, reward: { type, amount } }`
- [ ] SDK fires `onRewarded()` only if `valid == true`

**Error Handling**:
- [ ] Creative load failure → `onShown(AdError.INTERNAL_ERROR)`, no reward
- [ ] User closes before completion → `onClosed()`, no reward
- [ ] Reward verification timeout → fire reward anyway (client-side grant) but log warning

**Acceptance**:
- [ ] Rewarded ad plays to completion and fires `onRewarded()` with correct reward data
- [ ] Ad cannot be skipped before completion threshold (UI enforced)
- [ ] Server-side reward verification works (if enabled) with 3s timeout
- [ ] Unit tests verify reward granted only on completion, not on early close

---

### 2.3 Banner Ads

**Goal**: Persistent rectangular ad displayed in UI (anchored to screen edges).

**Public API**:
```csharp
public class ApexBanner
{
    public enum BannerSize
    {
        Banner_320x50,
        MediumRectangle_300x250,
        Leaderboard_728x90,
        Adaptive // Match screen width, dynamic height
    }
    
    public enum BannerPosition
    {
        Top,
        TopLeft,
        TopRight,
        Bottom,
        BottomLeft,
        BottomRight,
        Center
    }
    
    public static void Create(string placementId, BannerSize size, BannerPosition position, Action<AdError> onLoaded);
    public static void Show(string placementId);
    public static void Hide(string placementId);
    public static void Destroy(string placementId);
}
```

**Implementation Tasks**:
- [ ] Create `BannerController.cs`:
  - [ ] Manage multiple banner instances (keyed by `placementId`)
  - [ ] Handle adaptive sizing (query screen resolution, calculate height)
  - [ ] Anchor banner to screen position using Unity UI anchors
  - [ ] Auto-refresh logic (optional, configurable refresh interval 30-120s)

- [ ] Banner lifecycle:
  1. `Create()` → Instantiate UI Canvas + RawImage at specified position
  2. S2S auction request with `ad_type=banner`, `size=320x50`
  3. Load creative image/HTML into RawImage or WebView
  4. Fire `onLoaded(null)` on success
  5. `Show()` → Set Canvas GameObject active
  6. `Hide()` → Set Canvas GameObject inactive (ad remains loaded)
  7. `Destroy()` → Destroy Canvas GameObject, clear cache

**Rendering Options**:
- [ ] **Image banners**: Use `RawImage` with texture loaded via `UnityWebRequestTexture`
- [ ] **HTML banners**: Embed WebView (Vuplex) or fallback to browser redirect

**Auto-Refresh** (optional):
- [ ] Start coroutine timer after load
- [ ] Every N seconds (configurable), fetch new creative and replace without destroying GameObject
- [ ] Cancel timer on `Hide()` or `Destroy()`

**Viewability Tracking**:
- [ ] Emit OM SDK `impressionOccurred` when banner visible on screen (>50% area for >1s)
- [ ] Track viewable time duration

**Acceptance**:
- [ ] Banner displays at correct position with correct size
- [ ] Adaptive banners adjust to screen width (tested on 16:9, 4:3, ultrawide)
- [ ] `Hide()` and `Show()` toggle visibility without reloading creative
- [ ] `Destroy()` properly cleans up GameObject and stops auto-refresh

---

### 2.4 Rewarded Interstitial Ads

**Goal**: Hybrid format (full-screen + optional reward) for user-initiated placements.

**Public API**:
```csharp
public class ApexRewardedInterstitial
{
    public static void Load(string placementId, Action<AdError> onLoaded);
    public static void Show(string placementId, Action<AdError> onShown, Action<Reward> onRewarded, Action onClosed);
    public static bool IsReady(string placementId);
}
```

**Implementation Tasks**:
- [ ] Create `RewardedInterstitialController.cs` combining Interstitial + Rewarded semantics:
  - [ ] Full-screen overlay (like Interstitial)
  - [ ] Reward granted on completion (like Rewarded)
  - [ ] Skippable after N seconds (configurable, e.g., 5s countdown)

- [ ] Show flow:
  1. Show full-screen creative with skip button disabled initially
  2. After countdown expires, enable skip button
  3. If user watches to completion: fire `onRewarded(reward)`
  4. If user skips early (after countdown): fire `onClosed()`, no reward
  5. If user closes before countdown: fire `onClosed()`, no reward

**Acceptance**:
- [ ] Rewarded interstitial respects skip countdown (tested with 3s, 5s, 10s)
- [ ] Reward fires only on completion, not on early skip
- [ ] UI clearly indicates countdown and skip button state

---

## 3. Networking & S2S Auction (P0)

### 3.1 Auction Client

**Goal**: Reliable HTTP client for S2S auction requests with retry, timeout, and error handling.

**Implementation Tasks**:
- [ ] Create `AuctionClient.cs` using `UnityWebRequest`:
  ```csharp
  public class AuctionClient
  {
      public IEnumerator RequestBid(AdRequest request, Action<AdResponse, AdError> onComplete);
  }
  ```

- [ ] Request flow:
  1. Build JSON payload from `AdRequest` (device info, placement ID, consent flags)
  2. Set headers: `Content-Type: application/json`, `X-Api-Key: <apiKey>`, `User-Agent: <SDKVersion>`
  3. Send POST to `https://auction.apexmediation.com/v1/auction` (or configured endpoint)
  4. Set timeout (default 5s, configurable via `SDKConfig`)
  5. Handle response:
     - **200 + valid JSON** → parse into `AdResponse`, fire `onComplete(response, null)`
     - **204 No Content** → `onComplete(null, AdError.NO_FILL)`
     - **400/404** → `onComplete(null, AdError.INVALID_PLACEMENT)`
     - **429** → `onComplete(null, AdError.RATE_LIMIT)`
     - **500/502/503** → retry once with exponential backoff (100ms jitter), then `AdError.INTERNAL_ERROR`
     - **Timeout** → `onComplete(null, AdError.TIMEOUT)`
     - **Network unreachable** → `onComplete(null, AdError.NETWORK_ERROR)`

- [ ] Retry logic:
  - [ ] 1 retry for transient errors (5xx, timeout, network errors)
  - [ ] Exponential backoff: 100ms base delay + random jitter (0-100ms)
  - [ ] No retry for 4xx errors (client errors are permanent)

- [ ] JSON parsing:
  - [ ] Use Unity's built-in `JsonUtility` for simple models
  - [ ] Fallback to manual parsing for complex nested structures
  - [ ] Validate required fields: `ad_id`, `creative_url`, `adapter_name`

**Error Taxonomy**:
```csharp
public enum AdErrorCode
{
    NO_FILL,
    TIMEOUT,
    NETWORK_ERROR,
    RATE_LIMIT,
    INVALID_PLACEMENT,
    INTERNAL_ERROR,
    AD_EXPIRED,
    NOT_INITIALIZED
}
```

**Acceptance**:
- [ ] Auction request completes in <3s on typical network (4G/WiFi)
- [ ] Retry logic tested with mock 503 responses (should retry once and succeed)
- [ ] Timeout enforced (request aborts after configured timeout)
- [ ] Error codes match Android/iOS SDK taxonomy

---

### 3.2 Ad Request Construction

**Goal**: Build complete ad request payload with device info, consent, and placement metadata.

**Implementation Tasks**:
- [ ] Create `AdRequest` model:
  ```csharp
  public class AdRequest
  {
      public string PlacementId;
      public string AdType; // "interstitial", "rewarded", "banner"
      public DeviceInfo Device;
      public ConsentData Consent;
      public AppInfo App;
      public Dictionary<string, string> Metadata;
  }
  
  public class DeviceInfo
  {
      public string Platform; // "iOS", "Android", "WebGL", "Standalone"
      public string OSVersion;
      public string DeviceModel;
      public string AdvertisingId; // IDFA/GAID
      public bool LimitAdTracking;
      public string Language;
      public string Timezone;
      public ScreenInfo Screen;
  }
  
  public class ScreenInfo
  {
      public int Width;
      public int Height;
      public float DPI;
  }
  ```

- [ ] Populate `DeviceInfo` using `SystemInfo` and platform bridge:
  ```csharp
  Device = new DeviceInfo
  {
      Platform = Application.platform.ToString(),
      OSVersion = SystemInfo.operatingSystem,
      DeviceModel = SystemInfo.deviceModel,
      AdvertisingId = platformBridge.GetAdvertisingId(),
      LimitAdTracking = platformBridge.IsLimitAdTrackingEnabled(),
      Language = Application.systemLanguage.ToString(),
      Timezone = TimeZoneInfo.Local.Id,
      Screen = new ScreenInfo
      {
          Width = Screen.width,
          Height = Screen.height,
          DPI = Screen.dpi
      }
  };
  ```

- [ ] Consent flags (match Android/iOS):
  ```csharp
  Consent = new ConsentData
  {
      GdprApplies = consentManager.GdprApplies,
      GdprConsentString = consentManager.GdprConsentString,
      CcpaOptOut = consentManager.CcpaOptOut,
      Coppa = consentManager.Coppa
  };
  ```

**Acceptance**:
- [ ] Ad request includes all required fields (placement ID, device info, consent)
- [ ] Advertising ID correctly retrieved on iOS (IDFA) and Android (GAID)
- [ ] Request respects consent flags (omits PII if consent denied)
- [ ] Unit tests verify request construction with mock platform bridge

---

### 3.3 Ad Response Parsing

**Goal**: Parse auction response into structured model with validation.

**Implementation Tasks**:
- [ ] Create `AdResponse` model:
  ```csharp
  public class AdResponse
  {
      public string AdId;
      public string AdapterName;
      public string CreativeUrl;
      public string AdType; // "image", "video", "html"
      public float Ecpm;
      public int TtlSeconds;
      public Reward Reward; // null for non-rewarded ads
      public Dictionary<string, string> Metadata;
  }
  ```

- [ ] Parsing logic:
  - [ ] Deserialize JSON using `JsonUtility.FromJson<AdResponse>(json)`
  - [ ] Validate required fields: `AdId`, `CreativeUrl`, `AdapterName`
  - [ ] Handle missing optional fields (default `TtlSeconds = 3600` if absent)
  - [ ] Return `null` + `AdError.INTERNAL_ERROR` if parsing fails

**Malformed Response Handling**:
- [ ] Missing `creative_url` → `AdError.INTERNAL_ERROR`
- [ ] Invalid JSON → `AdError.INTERNAL_ERROR`
- [ ] Empty response body → `AdError.NO_FILL`

**Acceptance**:
- [ ] Parser handles valid responses with all fields
- [ ] Parser gracefully handles missing optional fields
- [ ] Parser returns error for malformed JSON
- [ ] Unit tests with golden fixtures (success, no_fill, malformed)

---

## 4. Configuration & OTA Updates (P0)

### 4.1 SDK Config (ScriptableObject)

**Goal**: Inspector-friendly configuration asset for design-time settings.

**Implementation Tasks**:
- [ ] Create `SDKConfig.cs` as `ScriptableObject`:
  ```csharp
  [CreateAssetMenu(fileName = "ApexMediationConfig", menuName = "Apex Mediation/SDK Config")]
  public class SDKConfig : ScriptableObject
  {
      [Header("Authentication")]
      public string ApiKey;
      public string AppId;
      
      [Header("Network")]
      public string AuctionEndpoint = "https://auction.apexmediation.com/v1/auction";
      public string ConfigEndpoint = "https://config.apexmediation.com/v1/config";
      public int TimeoutSeconds = 5;
      
      [Header("Security")]
      public bool TestMode = false;
      public string ConfigPublicKey; // Ed25519 public key (Base64)
      
      [Header("Features")]
      public bool EnableDebugLogging = false;
      public bool EnableOmSdk = true;
      public int AdCacheTtlSeconds = 3600;
      
      [Header("Privacy")]
      public bool DefaultGdprApplies = false;
      public bool DefaultCoppa = false;
  }
  ```

- [ ] Custom inspector (`SDKConfigInspector.cs`):
  - [ ] Validate API key format (alphanumeric, length 32+)
  - [ ] Show warnings for missing required fields
  - [ ] Button to open debug panel in Play Mode
  - [ ] Button to validate config (ping endpoints)

**Acceptance**:
- [ ] Config asset created via Unity menu (Assets → Create → Apex Mediation → SDK Config)
- [ ] Inspector shows clear labels and tooltips
- [ ] Validation warns on missing API key or malformed endpoint URLs

---

### 4.2 OTA Config Fetcher

**Goal**: Fetch remote config from backend with caching, signature verification, and fallback.

**Implementation Tasks**:
- [ ] Create `ConfigManager.cs`:
  ```csharp
  public class ConfigManager
  {
      public IEnumerator FetchConfig(Action<RemoteConfig, AdError> onComplete);
      public RemoteConfig GetCachedConfig();
      public void SaveConfigToCache(RemoteConfig config);
  }
  ```

- [ ] Fetch flow:
  1. Check `PlayerPrefs` for cached config (key: `apex_config_cache`)
  2. If cached and fresh (< 24h old), use cached config
  3. Fetch fresh config from `https://config.apexmediation.com/v1/config?app_id={appId}`
  4. Verify signature (Ed25519) if `ConfigPublicKey` present and not test mode
  5. Save to `PlayerPrefs` with timestamp
  6. Return config via `onComplete(config, null)`

- [ ] Signature verification:
  - [ ] Use Chaos.NaCl (open-source NaCl implementation for .NET)
  - [ ] Verify `config.signature` against canonical JSON payload
  - [ ] If verification fails and not test mode → reject config, use cached fallback
  - [ ] If test mode → bypass verification, log warning

- [ ] Config schema:
  ```csharp
  public class RemoteConfig
  {
      public string Version;
      public int RefreshIntervalSeconds;
      public bool KillSwitch;
      public Dictionary<string, PlacementConfig> Placements;
      public string Signature; // Ed25519 signature (Base64)
  }
  
  public class PlacementConfig
  {
      public string PlacementId;
      public string AdType;
      public int TimeoutMs;
      public float FloorPrice;
      public List<string> EnabledAdapters;
  }
  ```

**Caching Strategy**:
- [ ] Store config JSON in `PlayerPrefs.SetString("apex_config_cache", json)`
- [ ] Store fetch timestamp in `PlayerPrefs.SetString("apex_config_cache_time", timestamp)`
- [ ] On startup, check if cache is stale (> 24h), fetch fresh config in background

**Acceptance**:
- [ ] Config fetches on first initialization and caches to `PlayerPrefs`
- [ ] Subsequent initializations use cached config if fresh
- [ ] Signature verification works (tested with valid/invalid signatures)
- [ ] Kill switch honored (SDK refuses to load ads if `killSwitch == true`)

---

### 4.3 Kill Switch & Staged Rollout

**Goal**: Remote control to disable SDK or enable features for subset of users.

**Implementation Tasks**:
- [ ] Kill switch logic:
  - [ ] If `RemoteConfig.KillSwitch == true`, all ad loads return `AdError.NOT_INITIALIZED`
  - [ ] Log warning: "SDK disabled remotely via kill switch"

- [ ] Staged rollout (optional):
  - [ ] Hash `SystemInfo.deviceUniqueIdentifier` to get stable 0-99 bucket
  - [ ] Check `RemoteConfig.RolloutPercentage` (e.g., 10 = 10% of users)
  - [ ] If hash bucket > rollout percentage, disable SDK

**Acceptance**:
- [ ] Kill switch immediately prevents ad loads (tested by toggling in remote config)
- [ ] Rollout percentage correctly gates feature access (tested with 0%, 50%, 100%)

---

## 5. Consent Management (P0)

### 5.1 Consent API

**Goal**: Provide API for developers to set consent flags (GDPR, CCPA, COPPA).

**Public API**:
```csharp
public class ConsentData
{
    public bool? GdprApplies;
    public string GdprConsentString; // IAB TCF string
    public bool CcpaOptOut;
    public bool Coppa;
}

public static class ApexMediation
{
    public static void SetConsent(ConsentData consent);
    public static ConsentData GetConsent();
}
```

**Implementation Tasks**:
- [ ] Create `ConsentManager.cs`:
  - [ ] Store consent in memory (survives scene loads via `DontDestroyOnLoad`)
  - [ ] Persist to `PlayerPrefs` for cross-session consistency
  - [ ] Validate consent string format (IAB TCF 2.0 if provided)

- [ ] Consent propagation:
  - [ ] Include consent flags in every `AdRequest` sent to auction backend
  - [ ] Omit PII (IDFA/GAID) if `GdprApplies == true && consent denied`

**Acceptance**:
- [ ] `SetConsent()` persists across app restarts (stored in `PlayerPrefs`)
- [ ] Consent flags correctly included in auction requests
- [ ] PII omitted when consent denied (tested with mock requests)

---

### 5.2 IAB TCF Integration (Optional)

**Goal**: Read consent from IAB TCF 2.0 stored in Unity (if CMP integrated).

**Implementation Tasks**:
- [ ] Create `IABConsentReader.cs`:
  - [ ] Read IAB strings from `PlayerPrefs` keys (standard IAB keys: `IABTCF_TCString`, `IABTCF_gdprApplies`)
  - [ ] Parse TCF string to extract purpose consents
  - [ ] Map to `ConsentData` model

**Acceptance**:
- [ ] IAB consent string correctly parsed (tested with sample TCF strings)
- [ ] SDK respects IAB consent if present, falls back to manual consent otherwise

---

## 6. Debugging & Developer Experience (P1)

### 6.1 Debug Panel (Runtime UI)

**Goal**: In-game debug overlay for testing and diagnostics.

**Implementation Tasks**:
- [ ] Create `DebugPanel.cs` using Unity IMGUI:
  - [ ] Toggle visibility with keyboard shortcut (e.g., `Ctrl+Shift+D`)
  - [ ] Show SDK status:
    - SDK version
    - Initialization state
    - API key (masked)
    - Test mode indicator
    - Consent status (redacted)
    - Cached config version
    - Ad load/show history (last 10 events)
  - [ ] Buttons for common actions:
    - "Test Interstitial Load"
    - "Test Rewarded Load"
    - "Clear Ad Cache"
    - "Copy Diagnostics to Clipboard"

- [ ] Diagnostic export:
  - [ ] Generate JSON with SDK state, device info (redacted), recent errors
  - [ ] Copy to clipboard for support tickets

**Acceptance**:
- [ ] Debug panel accessible via keyboard shortcut in Play Mode
- [ ] Panel displays accurate SDK status and recent events
- [ ] Diagnostics JSON valid and useful for troubleshooting

---

### 6.2 Integration Validator (Editor Tool)

**Goal**: Pre-build checks to catch common integration mistakes.

**Implementation Tasks**:
- [ ] Create `IntegrationValidator.cs` Editor script:
  - [ ] Menu item: `Apex Mediation → Validate Integration`
  - [ ] Checks:
    - [ ] `SDKConfig` asset exists and assigned
    - [ ] API key present and valid format
    - [ ] No duplicate `MediationSDK` GameObjects in scenes
    - [ ] Required permissions in `AndroidManifest.xml` (if Android build)
    - [ ] Required Info.plist keys (if iOS build)
    - [ ] Assembly definition references correct

- [ ] Report UI:
  - [ ] Show green checkmarks for passing checks
  - [ ] Show red X for failures with fix suggestions
  - [ ] "Fix All" button for auto-fixable issues

**Acceptance**:
- [ ] Validator catches missing API key and shows clear error
- [ ] Validator detects missing Android permissions and offers to add them
- [ ] All checks pass on correctly configured project

---

### 6.3 Sample Scenes

**Goal**: Provide ready-to-run example scenes for common use cases.

**Implementation Tasks**:
- [ ] Create `Samples~/BasicIntegration/`:
  - [ ] Scene with simple UI (3 buttons: Load Interstitial, Show Interstitial, Load Rewarded)
  - [ ] `AdIntegrationExample.cs` script demonstrating API usage
  - [ ] Mock config (test mode enabled, sample placement IDs)

- [ ] Create `Samples~/AdvancedUsage/`:
  - [ ] Scene with all ad formats (Interstitial, Rewarded, Banner)
  - [ ] Custom consent UI (toggle GDPR/CCPA/COPPA)
  - [ ] Debug panel visible

**Acceptance**:
- [ ] Basic sample scene runs in Editor without errors
- [ ] All buttons functional (load/show ads)
- [ ] Sample code clearly commented and easy to adapt

---

## 7. Testing & Quality Assurance (P0)

### 7.1 Unit Tests (Play Mode)

**Goal**: Comprehensive test coverage for core SDK functionality.

**Test Suites**:
- [ ] `AuctionClientTests.cs`:
  - [ ] Test successful bid response parsing
  - [ ] Test no-fill response (204)
  - [ ] Test timeout behavior
  - [ ] Test retry on 5xx errors
  - [ ] Test malformed JSON handling

- [ ] `ConfigManagerTests.cs`:
  - [ ] Test config caching to `PlayerPrefs`
  - [ ] Test signature verification (valid/invalid)
  - [ ] Test kill switch enforcement
  - [ ] Test config staleness check

- [ ] `ConsentTests.cs`:
  - [ ] Test consent persistence across sessions
  - [ ] Test IAB TCF parsing (if implemented)
  - [ ] Test consent propagation to ad requests

- [ ] `AdLifecycleTests.cs`:
  - [ ] Test interstitial load → show → close flow
  - [ ] Test rewarded ad completion with reward callback
  - [ ] Test ad expiry (TTL exceeded)
  - [ ] Test double-show prevention

**Test Infrastructure**:
- [ ] Use `UnityEngine.TestTools` for Play Mode tests
- [ ] Mock `UnityWebRequest` responses using test helpers
- [ ] Mock platform bridge for deterministic device IDs

**Acceptance**:
- [ ] All unit tests pass in Unity Test Runner
- [ ] Code coverage ≥ 80% for core modules (measured via coverage tool)
- [ ] Tests run in <30 seconds

---

### 7.2 Integration Tests (Editor & Device)

**Goal**: End-to-end tests with real network calls (optional, for CI).

**Test Scenarios**:
- [ ] Editor integration test:
  - [ ] Initialize SDK with test config
  - [ ] Load interstitial ad (hits real auction endpoint with test mode)
  - [ ] Verify ad loads successfully (or no-fill)
  - [ ] Show ad (verify GameObject instantiated)
  - [ ] Close ad (verify cleanup)

- [ ] Device smoke test (manual or CI):
  - [ ] Build APK/IPA with test scene
  - [ ] Run on device, tap "Load Interstitial"
  - [ ] Verify ad appears on screen
  - [ ] Verify no crashes or memory leaks

**Acceptance**:
- [ ] Integration test passes in Editor with test backend
- [ ] Device smoke test passes on iOS and Android

---

### 7.3 Performance & Memory Profiling

**Goal**: Ensure SDK does not degrade game performance or cause memory leaks.

**Profiling Tasks**:
- [ ] Use Unity Profiler to measure:
  - [ ] CPU usage during ad load/show (< 5ms per frame)
  - [ ] Memory allocation (< 10MB per ad load)
  - [ ] GC allocations (minimize per-frame allocations)

- [ ] Memory leak checks:
  - [ ] Load and show 10 ads in sequence
  - [ ] Take memory snapshot before/after
  - [ ] Verify no retained `GameObject`s or textures

**Acceptance**:
- [ ] SDK does not cause frame drops (maintains 60 FPS on target device)
- [ ] No memory leaks detected after 10 ad cycles
- [ ] DLL size ≤ 300KB (IL2CPP stripped build)

---

## 8. Build & Deployment (P1)

### 8.1 Unity Package Manager Package

**Goal**: Distribute SDK as UPM package for easy installation.

**Tasks**:
- [ ] Create `package.json` with metadata:
  ```json
  {
    "name": "com.rivalapexmediation.sdk",
    "displayName": "Apex Mediation SDK",
    "version": "0.1.0",
    "unity": "2020.3",
    "description": "Ad mediation SDK for Unity games",
    "keywords": ["ads", "mediation", "monetization"],
    "dependencies": {}
  }
  ```

- [ ] Test installation:
  - [ ] Via Git URL: `https://github.com/rivalapexmediation/unity-sdk.git`
  - [ ] Via tarball: `com.rivalapexmediation.sdk-0.1.0.tgz`
  - [ ] Via local path (for development)

**Acceptance**:
- [ ] Package installs cleanly via Unity Package Manager
- [ ] No errors or warnings on import
- [ ] Sample scenes available in Package Manager window

---

### 8.2 Platform-Specific Builds

**Goal**: Verify SDK works on all supported platforms.

**Build Targets**:
- [ ] iOS (Xcode 14+, iOS 12+)
  - [ ] Test IDFA retrieval (ATT framework)
  - [ ] Verify IL2CPP build succeeds
  - [ ] Test on physical device (iPhone 12+)

- [ ] Android (API 21+)
  - [ ] Test GAID retrieval (Google Play Services)
  - [ ] Verify Gradle build succeeds
  - [ ] Test on physical device (Pixel 5+)

- [ ] WebGL
  - [ ] Test in Chrome, Firefox, Safari
  - [ ] Verify graceful degradation (no IDFA/GAID)
  - [ ] Test ad loading with CORS-enabled backend

- [ ] Standalone (Windows/macOS)
  - [ ] Verify Editor build behavior (mock platform bridge)
  - [ ] Test in packaged build (not just Editor Play Mode)

**Acceptance**:
- [ ] SDK builds without errors on iOS, Android, WebGL, Standalone
- [ ] Ads load and show correctly on all platforms (tested manually)

---

### 8.3 CI/CD Pipeline

**Goal**: Automate testing and release builds.

**Tasks**:
- [ ] Add Unity test job to `.github/workflows/ci.yml`:
  - [ ] Run Play Mode tests
  - [ ] Generate code coverage report
  - [ ] Upload test results as artifacts

- [ ] Add build job for sample scenes:
  - [ ] Build iOS Xcode project
  - [ ] Build Android APK
  - [ ] Build WebGL (upload to test server)

- [ ] Release automation:
  - [ ] Tag commit triggers UPM package build
  - [ ] Publish `.tgz` to GitHub Releases
  - [ ] Update package registry (if using private registry)

**Acceptance**:
- [ ] CI runs Unity tests on every PR
- [ ] Release workflow publishes UPM package automatically
- [ ] Sample builds uploadable to test devices

---

## 9. Documentation (P1)

### 9.1 API Reference

**Goal**: Comprehensive API docs for all public classes and methods.

**Tasks**:
- [ ] Add XML doc comments to all public APIs:
  ```csharp
  /// <summary>
  /// Initializes the Apex Mediation SDK.
  /// </summary>
  /// <param name="config">SDK configuration asset</param>
  /// <param name="onComplete">Callback fired on completion (true = success)</param>
  public static void Initialize(SDKConfig config, Action<bool> onComplete)
  ```

- [ ] Generate API docs using DocFX or Doxygen
- [ ] Publish to `docs/Unity/API/` in HTML format

**Acceptance**:
- [ ] All public APIs documented with XML comments
- [ ] API docs viewable in IDE (IntelliSense/tooltips)
- [ ] HTML docs generated and published

---

### 9.2 Integration Guide

**Goal**: Step-by-step guide for integrating SDK into Unity project.

**Document Structure** (`docs/Customer-Facing/SDKs/UNITY_QUICKSTART.md`):
1. **Installation** (via UPM, Git URL, or tarball)
2. **Configuration** (create `SDKConfig`, set API key)
3. **Initialization** (call `ApexMediation.Initialize()` in first scene)
4. **Loading Ads** (Interstitial, Rewarded, Banner examples)
5. **Showing Ads** (lifecycle callbacks, error handling)
6. **Consent Management** (GDPR/CCPA/COPPA)
7. **Debugging** (enable debug logging, use debug panel)
8. **Platform-Specific Notes** (iOS ATT, Android permissions)
9. **Troubleshooting** (common errors and solutions)

**Acceptance**:
- [ ] Developer can integrate SDK following guide in <1 hour
- [ ] All code examples tested and functional
- [ ] Screenshots included for Unity Editor steps

---

### 9.3 Migration Guide (from other SDKs)

**Goal**: Help developers migrate from competing SDKs (e.g., ironSource, AdMob).

**Document Structure**:
- [ ] API mapping table (ironSource → Apex Mediation)
- [ ] Code diff examples (before/after)
- [ ] Breaking changes and deprecations
- [ ] Migration checklist

**Acceptance**:
- [ ] Migration guide covers top 3 competitor SDKs
- [ ] Code examples valid and tested

---

## 10. Acceptance Criteria & Success Metrics

### Production-Ready Checklist

**Functional Requirements**:
- [ ] All ad formats implemented (Interstitial, Rewarded, Banner, Rewarded Interstitial)
- [ ] S2S auction flow functional (load, show, callbacks)
- [ ] OTA config fetching and caching works
- [ ] Consent management integrated (GDPR/CCPA/COPPA)
- [ ] Platform-specific features work (IDFA on iOS, GAID on Android)

**Quality Requirements**:
- [ ] Unit test coverage ≥ 80%
- [ ] Integration tests pass on iOS and Android
- [ ] No memory leaks (verified via Profiler)
- [ ] DLL size ≤ 300KB (IL2CPP stripped)
- [ ] Frame rate impact ≤ 5ms per ad operation

**Developer Experience**:
- [ ] Unity Package Manager installation works
- [ ] Sample scenes run without errors
- [ ] Integration guide tested by external developer (<1 hour to first ad)
- [ ] Debug panel functional and helpful

**Platform Coverage**:
- [ ] iOS 12+ (Xcode 14+)
- [ ] Android API 21+ (Android 5.0+)
- [ ] WebGL (Chrome, Firefox, Safari)
- [ ] Standalone (Windows, macOS, Linux)

**Parity with Mobile SDKs**:
- [ ] Feature parity with Android/iOS (facades, OTA config, consent, debug panel)
- [ ] Taxonomy parity (error codes match Android/iOS)
- [ ] Behavior parity (TTL, expiry, double-show prevention)

---

## 11. Timeline & Milestones

### Week 1: Foundation & Core Infrastructure
- [ ] Project structure and assembly definitions
- [ ] Platform abstraction layer (iOS/Android/WebGL bridges)
- [ ] Initialization and lifecycle management
- [ ] SDK config (ScriptableObject)

**Deliverable**: SDK initializes and logs to console on all platforms

---

### Week 2: Ad Formats & Networking
- [ ] Interstitial ad implementation
- [ ] Rewarded ad implementation
- [ ] Auction client (S2S requests)
- [ ] Ad request/response models

**Deliverable**: Interstitial and Rewarded ads load and show (with mock creative)

---

### Week 3: Configuration, Consent & Polish
- [ ] OTA config fetcher and signature verification
- [ ] Consent management API
- [ ] Banner ad implementation
- [ ] Rewarded Interstitial implementation
- [ ] Debug panel (runtime UI)
- [ ] Integration validator (Editor tool)

**Deliverable**: All ad formats functional, debug tools available

---

### Week 4: Testing, Documentation & Release Prep
- [ ] Unit tests (Play Mode)
- [ ] Integration tests (Editor & Device)
- [ ] Performance profiling and optimization
- [ ] API documentation (XML comments + HTML)
- [ ] Integration guide (Quickstart)
- [ ] Sample scenes polish
- [ ] UPM package build

**Deliverable**: Production-ready SDK with documentation

---

## 12. Known Limitations & Future Work

### Current Limitations
- **WebView dependency**: HTML creatives require third-party WebView plugin (Vuplex/UniWebView) or external browser redirect
- **OM SDK**: Native OM SDK integration deferred (use custom telemetry hooks)
- **Server-side rewards**: Optional, not enforced by default (client-side grant)
- **Advanced targeting**: Contextual signals (game genre, player LTV) not included in v1

### Future Enhancements (Post-v1)
- [ ] Native OM SDK integration (via iOS/Android plugins)
- [ ] App Open ad format
- [ ] Native ad format (for in-game UI integration)
- [ ] Advanced caching (preload multiple ads per placement)
- [ ] A/B testing framework (client-side experimentation)
- [ ] Real-time bidding (header bidding via Unity)
- [ ] WebGL-optimized rendering (avoid WebView dependency)

---

## 13. Dependencies & Third-Party Libraries

### Required Dependencies
- **Chaos.NaCl** — Ed25519 signature verification (MIT license)
  - NuGet package or Unity-compatible DLL
  - Alternative: BouncyCastle (if Chaos.NaCl not available)

### Optional Dependencies
- **Vuplex WebView** — HTML ad rendering (paid asset, ~$200)
  - Alternative: UniWebView (similar pricing)
  - Fallback: Open external browser (free, worse UX)

### No Dependencies
- Networking: Use `UnityWebRequest` (built-in)
- JSON parsing: Use `JsonUtility` (built-in)
- UI: Use Unity UI (built-in UGUI or IMGUI)

---

## 14. Risk Assessment

### High Risk 🔴
- **WebView dependency**: HTML ads require paid plugin or external browser (UX degradation)
  - **Mitigation**: Prioritize image/video ads, document WebView requirement clearly

- **Platform-specific crashes**: IL2CPP can introduce runtime issues not present in Editor
  - **Mitigation**: Extensive device testing on iOS/Android before release

### Medium Risk 🟡
- **Unity version fragmentation**: Supporting Unity 2020.3 → 2023.x requires compatibility testing
  - **Mitigation**: Test on LTS versions (2020.3, 2021.3, 2022.3)

- **Signature verification performance**: Ed25519 verification may be slow on low-end devices
  - **Mitigation**: Cache verified configs, allow bypass in test mode

### Low Risk 🟢
- **API changes**: Backend API stable, breaking changes unlikely
  - **Mitigation**: Version API requests, handle unknown fields gracefully

---

## 15. Success Metrics (Post-Launch)

### Developer Adoption
- [ ] 10+ Unity games integrated within 3 months
- [ ] Average integration time < 2 hours (measured via surveys)
- [ ] Developer satisfaction score ≥ 8/10 (post-integration survey)

### Technical Performance
- [ ] Ad load success rate ≥ 95%
- [ ] Average ad load time < 3s
- [ ] Crash-free session rate ≥ 99.9%
- [ ] Frame rate impact ≤ 2ms average (measured in production games)

### Competitive Position
- [ ] Feature parity with ironSource Unity SDK ✅
- [ ] Smaller SDK size than competitors (< 50% of ironSource Unity SDK)
- [ ] Faster ad loads than competitors (< 80% of average competitor load time)

---

## Appendix A: Code Examples

### Example: Basic Interstitial Integration
```csharp
using ApexMediation;

public class AdManager : MonoBehaviour
{
    [SerializeField] private SDKConfig sdkConfig;
    private const string InterstitialPlacement = "main_menu_interstitial";
    
    void Start()
    {
        // Initialize SDK
        ApexMediation.Initialize(sdkConfig, success =>
        {
            if (success)
            {
                Debug.Log("Apex Mediation initialized!");
                LoadInterstitial();
            }
            else
            {
                Debug.LogError("Failed to initialize Apex Mediation");
            }
        });
    }
    
    void LoadInterstitial()
    {
        ApexInterstitial.Load(InterstitialPlacement, error =>
        {
            if (error == null)
            {
                Debug.Log("Interstitial loaded!");
            }
            else
            {
                Debug.LogError($"Interstitial load failed: {error.Code}");
            }
        });
    }
    
    public void ShowInterstitial()
    {
        if (ApexInterstitial.IsReady(InterstitialPlacement))
        {
            ApexInterstitial.Show(
                InterstitialPlacement,
                onShown: error =>
                {
                    if (error != null)
                    {
                        Debug.LogError($"Interstitial show failed: {error.Code}");
                    }
                },
                onClosed: () =>
                {
                    Debug.Log("Interstitial closed");
                    LoadInterstitial(); // Preload next ad
                }
            );
        }
        else
        {
            Debug.LogWarning("Interstitial not ready");
        }
    }
}
```

### Example: Rewarded Ad with Reward Grant
```csharp
public void ShowRewardedAd()
{
    if (ApexRewarded.IsReady("level_complete_rewarded"))
    {
        ApexRewarded.Show(
            "level_complete_rewarded",
            onShown: error =>
            {
                if (error != null)
                {
                    Debug.LogError($"Rewarded show failed: {error.Code}");
                }
            },
            onRewarded: reward =>
            {
                Debug.Log($"User earned {reward.Amount} {reward.Type}");
                // Grant reward in game
                PlayerInventory.AddCoins(reward.Amount);
            },
            onClosed: () =>
            {
                Debug.Log("Rewarded ad closed");
            }
        );
    }
}
```

---

## Appendix B: Platform-Specific Notes

### iOS
- **ATT Framework**: Request App Tracking Transparency permission before accessing IDFA
  - Add `NSUserTrackingUsageDescription` to Info.plist
  - Call `ATTrackingManager.RequestTrackingAuthorization()` before SDK init

- **SKAdNetwork**: Register attribution callbacks for Apple's privacy-preserving attribution
  - Add SKAdNetwork IDs to Info.plist

### Android
- **Permissions**: Add to `AndroidManifest.xml`:
  ```xml
  <uses-permission android:name="android.permission.INTERNET" />
  <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
  <uses-permission android:name="com.google.android.gms.permission.AD_ID" />
  ```

- **Google Play Services**: GAID retrieval requires Google Play Services dependency
  - Add `com.google.android.gms:play-services-ads-identifier` to Gradle

### WebGL
- **CORS**: Ensure backend auction endpoint enables CORS for WebGL domain
- **No Advertising IDs**: WebGL builds cannot access IDFA/GAID (use fallback identifiers)

---

## Appendix C: FAQ

**Q: Does the Unity SDK require native plugins?**  
A: Minimal native code for iOS (IDFA) and Android (GAID). Core SDK is pure C# with platform abstractions.

**Q: What Unity versions are supported?**  
A: Unity 2020.3 LTS and newer. Tested on 2020.3, 2021.3, 2022.3, 2023.x.

**Q: Can I use this SDK in WebGL builds?**  
A: Yes, but with limitations (no IDFA/GAID, HTML ads may require external browser).

**Q: How does signature verification work?**  
A: Ed25519 signature verification using Chaos.NaCl library. Bypass available in test mode.

**Q: What's the SDK size impact?**  
A: ≤ 300KB DLL (IL2CPP stripped). Minimal impact on build size compared to game assets.

**Q: Is OM SDK supported?**  
A: Custom telemetry hooks provided. Native OM SDK integration planned for future release.

---

## Appendix D: Additional Implementation Guidance

### D.1 IL2CPP, AOT, and Stripping Constraints
- Avoid reflection-heavy patterns and dynamic code generation (no `System.Reflection.Emit`, `Activator.CreateInstance` on unknown types).
- Prefer concrete types over open generic APIs across public surfaces to reduce AOT stubs. If generics are required, keep the set of closed generic types finite and referenced to prevent stripping.
- Provide `link.xml` with explicit preserves for:
  - Public API models passed through JSON (request/response DTOs)
  - Any types accessed via reflection or native interop
- Do not rely on `System.Text.Json` in older Unity versions. Use `UnityEngine.JsonUtility` for simple POCOs; for dictionaries/arrays, add minimal hand-written serialization helpers in `NetworkHelpers` (no external JSON libs to keep zero-dep policy).
- Validate IL2CPP builds for iOS/Android and Mono for Editor; add CI gates for both.

### D.2 Error Taxonomy Parity (Unity ↔ Android/iOS)
- Map network and server conditions consistently:
  - 204 → `NoFill`
  - 400/404 → `InvalidRequest`
  - 401/403 → `Unauthorized`
  - 408/timeout/socket → `Timeout`
  - 429 → `RateLimited`
  - 5xx → `ServerError`
  - JSON parse/schema mismatch → `ParseError`
  - Not initialized/already initialized → `StateError`
- Document in code comments and keep a single `ErrorCodes.cs` enum mirroring Android `SdkError` and iOS `SDKError`.

### D.3 ATT/IDFA Timing & UX (iOS)
- The SDK must not trigger the ATT prompt automatically. Expose:
  - `GetATTStatus()` API for host apps to decide when to prompt
  - A helper `ShouldRequestATT()` that returns true if status is `notDetermined`
- Defer IDFA requests until after ATT authorized. If denied, omit IDFA entirely from requests.
- Provide sample code in `Samples~/AdvancedUsage/` demonstrating a recommended ATT flow at a natural onboarding moment.

### D.4 WebGL-Specific Constraints
- Networking: Use `UnityWebRequest` only; ensure CORS headers present on backend. No sockets or custom TLS.
- IDs: No IDFA/GAID. Use a stable, salted hash of `SystemInfo.deviceUniqueIdentifier` when available, else random install GUID persisted via `PlayerPrefs`.
- Threading: Assume single-threaded execution. Marshal all callbacks to main thread explicitly.
- Storage: Use `PlayerPrefs` for small caches (config, install GUID). Avoid large writes due to IndexedDB limits.
- Timeouts: Increase slightly for WebGL (slow start), and surface user-friendly warnings in the debug panel.

### D.5 Memory and Allocation Budgets
- Per ad request target heap allocation ≤ 50KB; per frame allocations of SDK code ≤ 1KB during idle.
- No long-lived allocations for banners when hidden; destroy and re-create cleanly.
- Add a CI profiler smoke (Editor) that asserts allocations do not regress by >10% across releases.

### D.6 Logging and Telemetry
- Logging levels: `Off`, `Error`, `Warn`, `Info`, `Debug`. Default `Warn` in production, `Debug` in test mode.
- Redact PII (IDs, consent strings) in logs by default; allow opt-in verbose redaction bypass in Editor only.
- Telemetry hooks should be no-op in WebGL if OM SDK is unavailable.

### D.7 CI Matrix and Supported Versions
- Build matrix:
  - Unity 2020.3 LTS, 2021.3 LTS, 2022.3 LTS, 2023.x (latest)
  - Platforms: iOS (IL2CPP), Android (IL2CPP), WebGL, Editor Mono
- CI checks:
  - Compile Runtime/Editor assemblies
  - Run Edit Mode tests and selected Play Mode tests (headless) where supported
  - Verify package import, assembly separation, and size budget gate (≤ 300KB stripped)

### D.8 Security Notes
- Enforce TLS 1.2+ on all requests; reject plaintext endpoints.
- Verify OTA config signatures with Ed25519 in production; bypass only in test mode.
- Consider optional domain allowlist for auction endpoints; expose as config with sane defaults.

### D.9 Versioning and Release Process
- Semantic Versioning (SemVer): MAJOR.MINOR.PATCH.
- Maintain `CHANGELOG.md` in `Documentation~/` following Keep a Changelog format.
- Each release must include:
  - Updated package `version` in `package.json`
  - Release notes, updated API docs, and sample import verification
  - CI artifact with built `.tgz` for UPM and importable `.unitypackage` if needed

---

**End of Unity SDK Design Document**
