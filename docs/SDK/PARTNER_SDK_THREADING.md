# Partner SDK Threading Guide

Last updated: 2025-01-06
Owner: SDK Engineering

## Overview

Ad network partner SDKs have varying threading requirements. This document outlines the threading behavior of each partner SDK to help developers avoid common pitfalls like ANRs, deadlocks, and UI thread violations.

---

## Quick Reference Table

| Partner SDK | Main Thread Required | Has Own Thread Pool | Callbacks Thread | Notes |
|-------------|---------------------|---------------------|------------------|-------|
| AdMob | Yes (init) | Yes | Main | Most callbacks on main thread |
| Facebook Audience Network | Yes (init) | Yes | Main | UI components require main thread |
| Unity Ads | No | Yes | Any | Thread-safe, callbacks on calling thread |
| AppLovin | Yes (init + show) | Yes | Main | Load can be background |
| Vungle | Yes (init) | Yes | Main | Video rendering on main thread |
| IronSource | Yes (init + show) | Yes | Main | Mediation requires main thread |
| Mintegral | Yes (init) | Yes | Main | Similar to IronSource |
| Chartboost | Yes | Yes | Main | All operations on main thread |
| InMobi | Yes (init) | Yes | Main | Load can be background |
| Pangle | Yes | No | Main | All operations on main thread |

---

## Detailed Guidelines by Platform

### Android

#### Main Thread Requirements

```kotlin
// ✅ CORRECT: Initialize on main thread
class MyApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        
        // Most SDKs require main thread for init
        MobileAds.initialize(this) { status -> 
            // Callback also on main thread
        }
    }
}

// ❌ WRONG: Initializing on background thread
CoroutineScope(Dispatchers.IO).launch {
    MobileAds.initialize(context) { } // May crash or behave unexpectedly
}
```

#### Safe Background Loading

```kotlin
// ✅ CORRECT: Load ads on background, but use handler for callbacks
class AdLoader(private val context: Context) {
    private val mainHandler = Handler(Looper.getMainLooper())
    
    fun loadAdAsync() {
        CoroutineScope(Dispatchers.IO).launch {
            // Some SDKs allow background loading
            val request = AdRequest.Builder().build()
            
            // But ensure callbacks run on main thread
            withContext(Dispatchers.Main) {
                interstitialAd.loadAd(request)
            }
        }
    }
}
```

#### Checking Thread

```kotlin
fun ensureMainThread() {
    if (Looper.myLooper() != Looper.getMainLooper()) {
        throw IllegalStateException("Must be called on main thread")
    }
}

// Or use our SDK helper
import com.anthropic.sdk.threading.ThreadChecker

ThreadChecker.assertMainThread()
```

### iOS

#### Main Thread Requirements

```swift
// ✅ CORRECT: Initialize and show on main thread
class AppDelegate: UIResponder, UIApplicationDelegate {
    func application(_ application: UIApplication,
                     didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        
        // Most SDKs require main thread for init
        GADMobileAds.sharedInstance().start { status in
            // Callback on main thread
        }
        
        return true
    }
}

// ❌ WRONG: Initializing on background queue
DispatchQueue.global().async {
    GADMobileAds.sharedInstance().start { _ in } // May crash
}
```

#### Safe Dispatch to Main

```swift
// ✅ CORRECT: Always dispatch ad operations to main
func showAd() {
    guard let ad = interstitialAd else { return }
    
    if Thread.isMainThread {
        ad.present(fromRootViewController: viewController)
    } else {
        DispatchQueue.main.async {
            ad.present(fromRootViewController: self.viewController)
        }
    }
}
```

#### Using Our SDK Helper

```swift
import AnthropicAdSDK

// Automatically dispatches to main if needed
AdThreading.onMain {
    self.showInterstitial()
}

// Assert main thread (debug only)
AdThreading.assertMain()
```

### Unity

#### Main Thread Requirements

```csharp
// ✅ CORRECT: Use UnityMainThreadDispatcher for ad operations
public class AdManager : MonoBehaviour
{
    private void OnAdLoaded()
    {
        // This callback may come from a background thread!
        UnityMainThreadDispatcher.Instance.Enqueue(() =>
        {
            // Now safe to update UI
            ShowAdButton.interactable = true;
        });
    }
}

// ❌ WRONG: Updating UI from callback thread
public void OnAdLoaded()
{
    // May crash if not on main thread
    ShowAdButton.interactable = true;
}
```

#### Thread-Safe Pattern

```csharp
using Anthropic.SDK.Threading;

public class SafeAdCallback : IAdListener
{
    public void OnAdLoaded(Ad ad)
    {
        MainThread.Run(() =>
        {
            // Safe UI updates here
            Debug.Log("Ad loaded!");
        });
    }
    
    public void OnAdFailed(AdError error)
    {
        MainThread.Run(() =>
        {
            Debug.LogError($"Ad failed: {error.Message}");
        });
    }
}
```

---

## Common Issues and Solutions

### Issue 1: ANR on Android During Initialization

**Symptom**: App Not Responding dialog during startup

**Cause**: Heavy SDK initialization blocking main thread

**Solution**:
```kotlin
// Defer non-critical SDK init
class MyApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        
        // Initialize critical SDKs immediately
        MobileAds.initialize(this)
        
        // Defer others
        Handler(Looper.getMainLooper()).postDelayed({
            initializeSecondarySDKs()
        }, 500)
    }
}
```

### Issue 2: Crash on iOS Background Thread

**Symptom**: `NSInternalInconsistencyException: Modifications to the layout engine must not be performed from a background thread`

**Cause**: UI update from ad callback running on background thread

**Solution**:
```swift
// Always wrap UI updates
NotificationCenter.default.addObserver(
    forName: .adLoaded,
    object: nil,
    queue: .main  // Specify main queue!
) { _ in
    self.updateUI()
}
```

### Issue 3: Unity Crash in Play Mode

**Symptom**: `UnityException: get_interactable can only be called from the main thread`

**Cause**: Ad network callback not on Unity main thread

**Solution**:
```csharp
// Use our thread-safe wrapper
[RuntimeInitializeOnLoadMethod]
static void InitializeDispatcher()
{
    UnityMainThreadDispatcher.Initialize();
}
```

---

## Partner-Specific Notes

### AdMob / Google Mobile Ads

- Initialization MUST be on main thread
- Load operations can be called from any thread (internally dispatches)
- All callbacks are on main thread
- `MobileAds.initialize()` is slow (~200-500ms), consider splash screen

### Facebook Audience Network

- Strict main thread requirements
- Initialize during `Application.onCreate()` / `application:didFinishLaunching`
- All methods must be called on main thread
- WebView-based ads especially sensitive

### Unity Ads

- More thread-tolerant than others
- Initialization can be called from any thread
- Callbacks may come on any thread - wrap in dispatcher
- `UnityAds.show()` must be called from main thread

### AppLovin

- MAX Mediation has strict main thread requirements
- `AppLovinSdk.getInstance().showMediationDebugger()` - main thread only
- Load operations can be background
- Interstitial/Rewarded show MUST be main thread

### IronSource

- Heavy initialization, consider async patterns
- All mediation callbacks on main thread
- `IronSource.init()` should be after consent
- Integration Verification Tool requires main thread

---

## Best Practices

1. **Default to Main Thread**: When in doubt, dispatch to main thread
2. **Wrap Callbacks**: Always wrap ad callbacks in main thread dispatcher
3. **Lazy Initialization**: Defer SDK init after app launch critical path
4. **Use SDK Helpers**: Our SDK provides `MainThread.run()` wrappers
5. **Test on Low-End Devices**: Threading issues more visible on slower devices

## Related Documentation

- [Android Background Restrictions](./ANDROID_BACKGROUND_RESTRICTIONS.md)
- [iOS ATS Exceptions](./IOS_ATS_EXCEPTIONS.md)
- [Unity Duplicate Symbols](./UNITY_DUPLICATE_SYMBOLS.md)
