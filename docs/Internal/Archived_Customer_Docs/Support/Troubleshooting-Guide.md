# Troubleshooting Guide

Common errors, solutions, and debugging tips for ApexMediation SDK integration.

## Table of Contents

1. [SDK Integration Errors](#sdk-integration-errors)
2. [Ad Loading Errors](#ad-loading-errors)
3. [Network Errors](#network-errors)
4. [Performance Issues](#performance-issues)
5. [Platform-Specific Issues](#platform-specific-issues)
6. [Testing & Debugging](#testing--debugging)

---

## SDK Integration Errors

### Error: SDK not initialized

**Symptom:**
```
Error: ApexMediation SDK not initialized. Call ApexMediation.Initialize() first.
```

**Cause:** Trying to use SDK before initialization

**Solution:**
```typescript
// ❌ Wrong
ApexMediation.LoadAd(AdType.Interstitial);

// ✅ Correct
await ApexMediation.Initialize("your_app_key");
ApexMediation.LoadAd(AdType.Interstitial);
```

**Unity:**
```csharp
void Start() {
    ApexMediation.Initialize("your_app_key");
    // Wait for initialization
    ApexMediation.OnInitialized += OnApexMediationReady;
}

void OnApexMediationReady() {
    ApexMediation.LoadAd(AdType.Interstitial);
}
```

---

### Error: Invalid API key

**Symptom:**
```
Error: API key 'abc123' is invalid or expired
```

**Cause:** Wrong API key or revoked key

**Solution:**
1. Get correct key from Dashboard → Settings → API Keys
2. Check for typos (keys are case-sensitive)
3. Ensure key hasn't been revoked
4. Use correct environment key (dev vs production)

```typescript
// Check your key format
const API_KEY = "adsk_live_abc123def456ghi789"; // Production
const DEV_KEY = "adsk_test_xyz987uvw654rst321"; // Development
```

---

### Error: SDK already initialized

**Symptom:**
```
Warning: ApexMediation SDK already initialized. Ignoring duplicate call.
```

**Cause:** Calling `Initialize()` multiple times

**Solution:**
```typescript
// ❌ Wrong
ApexMediation.Initialize("key");
// Later...
ApexMediation.Initialize("key"); // Duplicate!

// ✅ Correct
let isInitialized = false;

if (!isInitialized) {
    await ApexMediation.Initialize("key");
    isInitialized = true;
}

// Or use SDK check
if (!ApexMediation.IsInitialized()) {
    await ApexMediation.Initialize("key");
}
```

---

## Ad Loading Errors

### Error: No fill

**Symptom:**
```
Error: No ad available. Fill rate: 0%
```

**Cause:** No ad networks have ads available

**Common reasons:**
1. **Low eCPM floor:** Floor price too high, networks can't compete
2. **Limited networks:** Only 1-2 networks integrated
3. **Geo restrictions:** User in unsupported country
4. **Frequency cap:** User hit daily/hourly limit
5. **Invalid traffic:** User flagged as fraud

**Solutions:**

**1. Check fill rate:**
```bash
curl "https://api.apexmediation.ee/v1/analytics?metric=fill_rate&period=24h" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

If <90%, investigate:

**2. Lower floor price:**
```typescript
// Too high
ApexMediation.SetFloorPrice("interstitial", 5.00); // Might get no fill

// Better
ApexMediation.SetFloorPrice("interstitial", 2.00); // Balance quality vs fill
```

**3. Add more networks:**
```
Dashboard → Ad Networks → Add Network
```

Target: 10-15 networks for 95%+ fill rate

**4. Check geo support:**
```typescript
const country = await ApexMediation.GetUserCountry();
console.log(`User country: ${country}`);
// Check if networks support this country
```

**5. Implement fallback:**
```typescript
ApexMediation.LoadAd(AdType.Interstitial);

ApexMediation.OnAdLoadFailed += (adType, error) => {
    if (error.code === "NO_FILL") {
        // Show organic content instead
        ShowOrganicPromo();
    }
};
```

---

### Error: Ad load timeout

**Symptom:**
```
Error: Ad load timeout after 5000ms
```

**Cause:** Networks taking too long to respond

**Solutions:**

**1. Increase timeout:**
```typescript
ApexMediation.Configure(new ApexMediationConfig {
    AdLoadTimeout = 7000 // 7 seconds (default: 5 seconds)
});
```

**2. Check network latency:**
```bash
# Dashboard → Analytics → Performance
# Check "Average Latency by Network"
```

Disable slow networks (>2000ms average)

**3. Preload ads:**
```typescript
// ❌ Don't load at show time
ShowInterstitialButton.onClick = () => {
    ApexMediation.LoadAd(AdType.Interstitial); // User waits 5 seconds!
    ApexMediation.ShowAd(AdType.Interstitial);
};

// ✅ Preload earlier
void Start() {
    ApexMediation.PreloadAd(AdType.Interstitial);
}

ShowInterstitialButton.onClick = () => {
    if (ApexMediation.IsAdReady(AdType.Interstitial)) {
        ApexMediation.ShowAd(AdType.Interstitial); // Instant!
    }
};
```

---

### Error: Ad already loaded

**Symptom:**
```
Warning: Ad already loaded for placement 'interstitial'. Ignoring duplicate load.
```

**Cause:** Calling `LoadAd()` while ad already loaded

**Solution:**
```typescript
// ❌ Wrong
ApexMediation.LoadAd(AdType.Interstitial);
ApexMediation.LoadAd(AdType.Interstitial); // Duplicate!

// ✅ Correct
if (!ApexMediation.IsAdReady(AdType.Interstitial)) {
    ApexMediation.LoadAd(AdType.Interstitial);
}
```

---

## Network Errors

### Error: Network request failed

**Symptom:**
```
Error: Network request failed: Connection timeout
```

**Cause:** Network connectivity issues

**Solutions:**

**1. Check internet connection:**
```typescript
if (!Application.internetReachability) {
    Debug.Log("No internet connection");
    return;
}
```

**2. Retry with exponential backoff:**
```typescript
async function loadAdWithRetry(adType: AdType, maxRetries = 3) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            await ApexMediation.LoadAd(adType);
            return; // Success
        } catch (error) {
            if (attempt === maxRetries) {
                throw error; // Give up
            }

            const delay = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
            await sleep(delay);
        }
    }
}
```

**3. Check firewall/proxy:**
- ApexMediation requires access to `*.apexmediation.ee`
- Some corporate firewalls block ad domains
- Whitelist: `api.apexmediation.ee`, `cdn.apexmediation.ee`

---

### Error: SSL certificate verification failed

**Symptom:**
```
Error: SSL certificate verification failed for api.apexmediation.ee
```

**Cause:** Device system time incorrect or certificate issue

**Solutions:**

**1. Check device time:**
```typescript
const now = Date.now();
const year = new Date(now).getFullYear();
if (year < 2023 || year > 2030) {
    console.warn("Device time is incorrect");
}
```

**2. Update SDK:**
```bash
# Old SDK may have outdated certificate pinning
npm update @apexmediation/sdk
```

**3. Contact support:**
If device time is correct and SDK is updated, contact support@apexmediation.ee (certificate may have been renewed).

---

### Error: Rate limit exceeded

**Symptom:**
```
Error: Rate limit exceeded. Try again in 60 seconds. (429 Too Many Requests)
```

**Cause:** Too many API calls in short period

**Rate limits:**
- Ad requests: 100/minute per user
- API calls: 1000/minute per app
- Analytics: 100/minute

**Solutions:**

**1. Cache ad instances:**
```typescript
// ❌ Don't reload every frame
Update() {
    ApexMediation.LoadAd(AdType.Banner); // Called 60 times/second!
}

// ✅ Load once, reuse
void Start() {
    ApexMediation.LoadAd(AdType.Banner);
}
```

**2. Respect retry-after header:**
```typescript
ApexMediation.OnAdLoadFailed += (adType, error) => {
    if (error.code === 429) {
        const retryAfter = error.retryAfter || 60;
        Debug.Log($"Rate limited. Retry in {retryAfter} seconds");
        // Wait before retry
    }
};
```

**3. Request rate limit increase:**
Email support@apexmediation.ee if you have legitimate high-traffic needs.

---

## Performance Issues

### Issue: High latency (>200ms)

**Symptom:** Ads take too long to load, users complain

**Diagnosis:**
```bash
# Check Dashboard → Analytics → Performance
# Latency breakdown:
# - SDK processing: <10ms (good)
# - Network request: <50ms (good)
# - Ad network bidding: 150ms (slow!)
# - Ad rendering: <10ms (good)
```

**Solutions:**

**1. Reduce bidding timeout:**
```typescript
ApexMediation.Configure(new ApexMediationConfig {
    BiddingTimeout = 300 // 300ms (default: 500ms)
});
```

**2. Disable slow networks:**
```
Dashboard → Ad Networks → [Slow Network] → Disable
```

**3. Enable bid caching:**
```typescript
ApexMediation.Configure(new ApexMediationConfig {
    EnableBidCaching = true,
    BidCacheTTL = 300 // 5 minutes
});
```

**4. Preload ads earlier:**
```typescript
// Load during gameplay, not at show time
void OnLevelStart() {
    ApexMediation.PreloadAd(AdType.Interstitial); // Ready for level complete
}

void OnLevelComplete() {
    ApexMediation.ShowAd(AdType.Interstitial); // Instant show
}
```

---

### Issue: High memory usage

**Symptom:** App crashes with "Out of Memory" error

**Diagnosis:**
```csharp
// Check memory usage
float memoryUsage = Profiler.GetTotalAllocatedMemoryLong() / 1024f / 1024f;
Debug.Log($"Memory usage: {memoryUsage} MB");
```

**Solutions:**

**1. Unload ads when done:**
```typescript
ApexMediation.OnAdClosed += (adType) => {
    ApexMediation.UnloadAd(adType); // Free memory
};
```

**2. Limit concurrent ads:**
```typescript
// ❌ Don't preload everything
ApexMediation.PreloadAd(AdType.Banner);
ApexMediation.PreloadAd(AdType.Interstitial);
ApexMediation.PreloadAd(AdType.RewardedVideo);
ApexMediation.PreloadAd(AdType.NativeAd);
// 4 ads in memory!

// ✅ Preload only what's needed next
ApexMediation.PreloadAd(AdType.Interstitial); // For level complete
// Load others on-demand
```

**3. Use memory-efficient ad formats:**
```typescript
// Banner: ~2 MB memory
// Interstitial: ~5 MB memory
// Rewarded Video: ~10 MB memory (pre-cached video)
```

---

### Issue: ANR (Application Not Responding)

**Symptom:** App freezes for >5 seconds on Android

**Diagnosis:**
```bash
# Check Dashboard → Analytics → Performance → ANR Contribution
# Target: <0.02%
```

**Solutions:**

**1. Don't load ads on main thread:**
```typescript
// ❌ Blocks main thread
void OnClick() {
    ApexMediation.LoadAd(AdType.Interstitial); // Synchronous, blocks for 500ms
    ApexMediation.ShowAd(AdType.Interstitial);
}

// ✅ Load asynchronously
async void OnClick() {
    await ApexMediation.LoadAdAsync(AdType.Interstitial);
    ApexMediation.ShowAd(AdType.Interstitial);
}

// ✅ Or preload earlier
void Start() {
    ApexMediation.PreloadAd(AdType.Interstitial); // Background thread
}

void OnClick() {
    ApexMediation.ShowAd(AdType.Interstitial); // Main thread, instant
}
```

**2. Reduce SDK work on main thread:**
```typescript
ApexMediation.Configure(new ApexMediationConfig {
    OffloadToBackgroundThread = true // Default: true
});
```

---

## Platform-Specific Issues

### iOS

#### Error: App Transport Security (ATS) blocking requests

**Symptom:**
```
Error: NSURLSession/NSURLConnection HTTP load failed (kCFStreamErrorDomainSSL, -9802)
```

**Solution:** Add exception to `Info.plist`:
```xml
<key>NSAppTransportSecurity</key>
<dict>
    <key>NSAllowsArbitraryLoads</key>
    <false/>
    <key>NSExceptionDomains</key>
    <dict>
        <key>apexmediation.ee</key>
        <dict>
            <key>NSExceptionAllowsInsecureHTTPLoads</key>
            <true/>
            <key>NSIncludesSubdomains</key>
            <true/>
        </dict>
    </dict>
</dict>
```

#### Error: Missing Ad Tracking Transparency (ATT) prompt

**Symptom:** Ads not personalized on iOS 14.5+

**Solution:** Request ATT authorization:
```swift
import AppTrackingTransparency

func requestATT() {
    ATTrackingManager.requestTrackingAuthorization { status in
        switch status {
        case .authorized:
            // User granted permission
            ApexMediation.setConsent(.personalizedAds, true)
        case .denied:
            // User denied permission
            ApexMediation.setConsent(.personalizedAds, false)
        default:
            break
        }
    }
}
```

Add to `Info.plist`:
```xml
<key>NSUserTrackingUsageDescription</key>
<string>We use your data to show you personalized ads</string>
```

---

### Android

#### Error: Manifest merger failed

**Symptom:**
```
Error: Attribute application@label value=(App Name) from AndroidManifest.xml
is also present at [com.rivalapexmediation.sdk] AndroidManifest.xml
```

**Solution:** Add to `AndroidManifest.xml`:
```xml
<application
    android:label="@string/app_name"
    tools:replace="android:label">
```

#### Error: Multidex enabled but not configured

**Symptom:**
```
Error: Cannot fit requested classes in a single dex file
```

**Solution:** Enable multidex in `build.gradle`:
```gradle
android {
    defaultConfig {
        multiDexEnabled true
    }
}

dependencies {
    implementation 'androidx.multidex:multidex:2.0.1'
}
```

---

### Unity

#### Error: Unity IL2CPP stripping removes SDK code

**Symptom:**
```
MissingMethodException: Method 'ApexMediation.Initialize' not found
```

**Solution:** Add to `link.xml`:
```xml
<linker>
    <assembly fullname="ApexMediation.SDK" preserve="all"/>
    <assembly fullname="ApexMediation.SDK.Android" preserve="all"/>
    <assembly fullname="ApexMediation.SDK.iOS" preserve="all"/>
</linker>
```

#### Error: DllNotFoundException on Android

**Symptom:**
```
DllNotFoundException: libapexmediation.so
```

**Solution:** Ensure plugins are in correct folders:
```
Assets/
  Plugins/
    Android/
      libs/
        arm64-v8a/
          libapexmediation.so
        armeabi-v7a/
          libapexmediation.so
```

---

## Testing & Debugging

### Enable Test Mode

```typescript
// Show test ads (don't count as impressions)
ApexMediation.SetTestMode(true);
ApexMediation.LoadAd(AdType.Interstitial);
```

**Test ads:**
- Always fill (100%)
- Faster loading (<100ms)
- Labeled "Test Ad"
- No revenue

**Important:** Disable before production release!

---

### Enable Debug Logging

```typescript
// Unity
ApexMediation.SetLogLevel(LogLevel.Debug);

// iOS
ApexMediation.setLogLevel(.debug)

// Android
ApexMediation.setLogLevel(LogLevel.DEBUG);

// Web
ApexMediation.setLogLevel('debug');
```

**Output:**
```
[ApexMediation] [DEBUG] Initializing SDK...
[ApexMediation] [DEBUG] API key validated
[ApexMediation] [DEBUG] Loading ad: interstitial
[ApexMediation] [DEBUG] Requesting bids from 5 networks...
[ApexMediation] [DEBUG] Bid received: AdMob ($2.50)
[ApexMediation] [DEBUG] Bid received: Meta ($2.80)
[ApexMediation] [DEBUG] Winner: Meta ($2.80)
[ApexMediation] [DEBUG] Ad loaded successfully
```

---

### SDK Info

```typescript
// Get SDK version
const version = ApexMediation.GetSDKVersion(); // "2.1.0"

// Get SDK build
const build = ApexMediation.GetSDKBuild(); // "2025110401"

// Get user ID
const userId = ApexMediation.GetUserId(); // "user_xyz789"

// Get device info
const device = ApexMediation.GetDeviceInfo();
console.log(device);
// {
//   model: "iPhone 15 Pro",
//   os: "iOS",
//   os_version: "17.1.2",
//   advertising_id: "abc123..."
// }
```

---

### Check Ad Status

```typescript
// Is SDK initialized?
if (!ApexMediation.IsInitialized()) {
    console.log("SDK not initialized");
}

// Is ad loaded?
if (!ApexMediation.IsAdReady(AdType.Interstitial)) {
    console.log("Ad not ready");
}

// Get load status
const status = ApexMediation.GetAdLoadStatus(AdType.Interstitial);
console.log(status);
// "loading" | "loaded" | "failed" | "not_loaded"
```

---

### Network Diagnostics

```bash
# Test API connectivity
curl -I https://api.apexmediation.ee/health

# Expected:
# HTTP/2 200
# {"status":"ok","version":"2.1.0"}

# Test CDN
curl -I https://cdn.apexmediation.ee/sdk/apexmediation.min.js

# Expected:
# HTTP/2 200
```

---

### Export Logs

```typescript
// Export logs for support
const logs = await ApexMediation.ExportLogs();
// Send to support@apexmediation.ee
```

**Or download from Dashboard:**
```
Dashboard → Settings → Logs → Download Logs
```

---

## Getting Help

### 1. Check Documentation

- **API Reference:** https://apexmediation.bel-consulting.ee/docs/api
- **SDK Guides:** https://apexmediation.bel-consulting.ee/docs/sdk
- **FAQ:** https://apexmediation.bel-consulting.ee/docs/faq

### 2. Search Community

- **Discord:** https://discord.gg/apexmediation (500+ developers)
- **Stack Overflow:** Tag: `ad-stack`
- **GitHub Issues:** https://github.com/apexmediation/sdk/issues

### 3. Contact Support

**Email:** support@apexmediation.ee

**Include:**
- SDK version
- Platform (Unity/iOS/Android/Web)
- Error message (full text)
- Steps to reproduce
- Logs (enable debug mode)

**Response time:**
- Critical (ads not showing): <1 hour
- High (revenue impact): <4 hours
- Normal: <24 hours
- Low: <48 hours

### 4. Schedule Call

**For complex issues:**
- Book call: https://calendly.com/apexmediation-support
- 30-minute slots
- Screen sharing available
- Mon-Fri, 9am-5pm EET

---

## Quick Reference

### Common Error Codes

| Code | Meaning | Solution |
|------|---------|----------|
| `SDK_NOT_INITIALIZED` | SDK not initialized | Call `Initialize()` first |
| `INVALID_API_KEY` | Wrong API key | Check Dashboard → API Keys |
| `NO_FILL` | No ads available | Lower floor price, add networks |
| `TIMEOUT` | Ad load timeout | Increase timeout, preload earlier |
| `NETWORK_ERROR` | Network connectivity | Check internet, retry |
| `RATE_LIMIT` | Too many requests | Wait 60s, cache ad instances |
| `AD_ALREADY_LOADED` | Duplicate load call | Check `IsAdReady()` first |
| `AD_NOT_READY` | Trying to show unloaded ad | Call `LoadAd()` first |
| `INVALID_PLACEMENT` | Unknown placement ID | Check placement name |
| `FRAUD_DETECTED` | User flagged as fraud | User blocked, check dashboard |

### Status Codes

| HTTP | Meaning | Action |
|------|---------|--------|
| 200 | Success | Normal operation |
| 400 | Bad request | Check request parameters |
| 401 | Unauthorized | Check API key |
| 403 | Forbidden | Account suspended, contact support |
| 404 | Not found | Check endpoint URL |
| 429 | Rate limit | Wait and retry |
| 500 | Server error | Retry, contact support if persists |
| 503 | Service unavailable | Check status page, retry |

---

## Status Page

**Check service status:** https://status.apexmediation.ee

**Subscribe to updates:**
- Email notifications
- SMS (premium)
- Slack webhook
- RSS feed

**Recent incidents:** None (99.99% uptime since Jan 2024)
