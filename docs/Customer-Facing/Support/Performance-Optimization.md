# Performance Optimization Guide

Best practices and techniques for optimizing ApexMediation SDK performance and maximizing revenue.

## Table of Contents

1. [Performance Metrics](#performance-metrics)
2. [Latency Optimization](#latency-optimization)
3. [Memory Optimization](#memory-optimization)
4. [Battery Optimization](#battery-optimization)
5. [Network Optimization](#network-optimization)
6. [Revenue Optimization](#revenue-optimization)
7. [Platform-Specific Tips](#platform-specific-tips)
8. [Monitoring & Profiling](#monitoring--profiling)

---

## Performance Metrics

### Target Benchmarks

| Metric | Target | Good | Excellent |
|--------|--------|------|-----------|
| **Ad Load Time** | <200ms | <150ms | <100ms |
| **SDK Init Time** | <100ms | <50ms | <30ms |
| **Memory Usage** | <10MB | <5MB | <3MB |
| **Battery Impact** | <2% | <1% | <0.5% |
| **ANR Contribution** | <0.02% | <0.01% | 0% |
| **Crash Rate** | <0.1% | <0.05% | 0% |
| **Network Usage** | <5MB/day | <3MB/day | <1MB/day |

### Measuring Performance

**Dashboard → Analytics → Performance**

```
┌─────────────────────────────────────────────────┐
│  Performance Overview (Last 7 Days)             │
├─────────────────────────────────────────────────┤
│  Avg Load Time:      87ms        ✅            │
│  Memory Usage:       4.2MB       ✅            │
│  Battery Impact:     0.8%        ✅            │
│  ANR Contribution:   0.01%       ✅            │
│  Crash Rate:         0.03%       ✅            │
│  Network Usage:      2.1MB/day   ✅            │
└─────────────────────────────────────────────────┘
```

---

## Latency Optimization

### 1. Preload Ads

**Impact:** 70% faster perceived load time

```typescript
// ❌ Bad: Load on-demand (200ms delay)
ShowAdButton.onClick = () => {
    ApexMediation.LoadAd(AdType.Interstitial); // User waits...
    ApexMediation.ShowAd(AdType.Interstitial);
};

// ✅ Good: Preload during gameplay
void OnLevelStart() {
    ApexMediation.PreloadAd(AdType.Interstitial); // Loads in background
}

void OnLevelComplete() {
    if (ApexMediation.IsAdReady(AdType.Interstitial)) {
        ApexMediation.ShowAd(AdType.Interstitial); // Instant!
    }
}
```

**Result:**
- Before: 200ms wait after button click
- After: 0ms wait (ad ready instantly)

### 2. Enable Bid Caching

**Impact:** 50% faster on repeated loads

```typescript
ApexMediation.Configure(new ApexMediationConfig {
    EnableBidCaching = true,
    BidCacheTTL = 300 // 5 minutes
});
```

**How it works:**
```
First load:  Request bids → 150ms
Second load: Use cached bid → 20ms (88% faster)
```

### 3. Reduce Bidding Timeout

**Impact:** Faster loads, slightly lower fill rate

```typescript
ApexMediation.Configure(new ApexMediationConfig {
    BiddingTimeout = 300 // 300ms (default: 500ms)
});
```

**Tradeoff:**
- Timeout 500ms: 97% fill, 150ms avg latency
- Timeout 300ms: 95% fill, 90ms avg latency ✅

Faster loads worth 2% fill rate loss for most apps.

### 4. Optimize Network Priority

**Impact:** 20-30% faster by prioritizing fast networks

```typescript
// Check network latency in Dashboard
// Disable slow networks (>200ms avg)

ApexMediation.ConfigureNetworks([
    { name: "admob", priority: 1, enabled: true },    // Fast
    { name: "meta", priority: 2, enabled: true },     // Fast
    { name: "unity", priority: 3, enabled: true },    // Medium
    { name: "slownetwork", priority: 4, enabled: false } // Disabled
]);
```

### 5. Use Header Bidding

**Impact:** 40% faster than waterfall

**Waterfall (sequential):**
```
Network 1 → No fill (100ms)
Network 2 → No fill (100ms)
Network 3 → Fill! (100ms)
Total: 300ms
```

**Header Bidding (parallel):**
```
Network 1 ┐
Network 2 ├─ All request simultaneously
Network 3 ┘
Total: 100ms (winner selected)
```

```typescript
ApexMediation.Configure(new ApexMediationConfig {
    MediationStrategy = MediationStrategy.HeaderBidding
});
```

---

## Memory Optimization

### 1. Unload Ads After Use

**Impact:** 5-10MB freed per ad

```typescript
ApexMediation.OnAdClosed += (adType) => {
    ApexMediation.UnloadAd(adType); // Free memory immediately
};

// Or explicit unload
ApexMediation.ShowAd(AdType.Interstitial);
// ... ad shown ...
ApexMediation.UnloadAd(AdType.Interstitial); // Free 5MB
```

### 2. Limit Concurrent Preloads

**Impact:** Reduce peak memory by 20-30MB

```typescript
// ❌ Bad: Preload everything (40MB)
ApexMediation.PreloadAd(AdType.Banner);         // 2MB
ApexMediation.PreloadAd(AdType.Interstitial);   // 5MB
ApexMediation.PreloadAd(AdType.RewardedVideo);  // 10MB
ApexMediation.PreloadAd(AdType.NativeAd);       // 3MB
ApexMediation.PreloadAd(AdType.Interstitial, "level_complete"); // 5MB
ApexMediation.PreloadAd(AdType.Interstitial, "pause_menu");     // 5MB
ApexMediation.PreloadAd(AdType.RewardedVideo, "extra_life");    // 10MB
// Total: 40MB!

// ✅ Good: Preload only next ad (10MB)
ApexMediation.PreloadAd(AdType.Interstitial, "level_complete");
// Load others on-demand
```

### 3. Use Memory-Efficient Formats

**Impact:** 5-8MB saved per impression

```
Banner:          ~2 MB  ✅ Most efficient
Interstitial:    ~5 MB  ✅ Good
Rewarded Video: ~10 MB  ⚠️ Memory-heavy (but high revenue)
Native Ad:       ~3 MB  ✅ Efficient
```

**Recommendation:**
- Low-memory devices (<2GB RAM): Prefer banners, native ads
- High-memory devices (>4GB RAM): All formats fine

```typescript
// Detect device memory
const deviceMemory = SystemInfo.systemMemorySize; // MB

if (deviceMemory < 2048) {
    // Low memory: Use lightweight ads
    ApexMediation.LoadAd(AdType.Banner);
} else {
    // High memory: Use rewarded video
    ApexMediation.LoadAd(AdType.RewardedVideo);
}
```

### 4. Clear Image Cache Periodically

**Impact:** 10-20MB freed

```typescript
// Clear cache weekly
const lastClear = PlayerPrefs.GetInt("last_cache_clear", 0);
const now = Date.now();

if (now - lastClear > 7 * 24 * 60 * 60 * 1000) { // 7 days
    await ApexMediation.ClearImageCache();
    PlayerPrefs.SetInt("last_cache_clear", now);
}
```

### 5. Disable Video Precaching (If Needed)

**Impact:** 50MB saved, but slower video ad loads

```typescript
ApexMediation.Configure(new ApexMediationConfig {
    PrecacheVideoAds = false // Default: true
});
```

**Tradeoff:**
- Enabled (default): Faster video loads, higher memory
- Disabled: Slower video loads, lower memory

Only disable if memory-constrained (<1GB RAM devices).

---

## Battery Optimization

### 1. Limit Background Activity

**Impact:** 50% battery savings

```typescript
// Pause ad loading when app backgrounded
void OnApplicationPause(bool paused) {
    if (paused) {
        ApexMediation.PauseAdLoading();
    } else {
        ApexMediation.ResumeAdLoading();
    }
}
```

### 2. Reduce Refresh Rate

**Impact:** 30% battery savings for banner ads

```typescript
// ❌ Default: Refresh every 30 seconds (high battery drain)
ApexMediation.LoadAd(AdType.Banner);

// ✅ Better: Refresh every 60 seconds
ApexMediation.Configure(new ApexMediationConfig {
    BannerRefreshInterval = 60 // seconds
});

// ✅ Best: Manual refresh only
ApexMediation.Configure(new ApexMediationConfig {
    BannerAutoRefresh = false
});
// Refresh manually when needed
ApexMediation.RefreshAd(AdType.Banner);
```

### 3. Disable Location Tracking

**Impact:** 20% battery savings (GPS drains battery)

```typescript
ApexMediation.Configure(new ApexMediationConfig {
    CollectLocation = false // Use IP-based geo only
});
```

**Tradeoff:**
- Enabled: Better geo-targeting, higher eCPM (+5%), battery drain
- Disabled: IP-based geo, standard eCPM, battery friendly ✅

### 4. Use Wi-Fi for Large Downloads

**Impact:** 40% battery savings vs cellular

```typescript
// Wait for Wi-Fi before precaching videos
ApexMediation.Configure(new ApexMediationConfig {
    PrecacheOnlyOnWifi = true
});
```

### 5. Batch Network Requests

**Impact:** 15% battery savings

```typescript
ApexMediation.Configure(new ApexMediationConfig {
    BatchNetworkRequests = true, // Default: true
    BatchInterval = 5 // seconds
});
```

**How it works:**
- Without batching: 10 requests = 10 radio wake-ups
- With batching: 10 requests = 2 radio wake-ups (batched every 5s)

---

## Network Optimization

### 1. Enable Compression

**Impact:** 60% bandwidth savings

```typescript
ApexMediation.Configure(new ApexMediationConfig {
    EnableCompression = true // Default: true
});
```

**Data savings:**
- Without compression: 5MB/day
- With compression: 2MB/day (60% savings)

### 2. Prefetch Over Wi-Fi Only

**Impact:** Save user's cellular data

```typescript
ApexMediation.Configure(new ApexMediationConfig {
    PrefetchOnlyOnWifi = true
});
```

**User-friendly:** Respects limited data plans

### 3. Reduce Image Quality

**Impact:** 40% bandwidth savings

```typescript
ApexMediation.Configure(new ApexMediationConfig {
    ImageQuality = ImageQuality.Medium // High, Medium, Low
});
```

**Quality comparison:**
- High: 500KB per image, crisp
- Medium: 300KB per image, good (recommended) ✅
- Low: 150KB per image, compressed

### 4. Limit Video Bitrate

**Impact:** 50% bandwidth savings for video ads

```typescript
ApexMediation.Configure(new ApexMediationConfig {
    MaxVideoBitrate = 1000 // kbps (1 Mbps)
});
```

**Bitrate guide:**
- 2000 kbps: HD quality, 15MB per 60s video
- 1000 kbps: Good quality, 7.5MB per 60s video ✅
- 500 kbps: Medium quality, 3.75MB per 60s video

### 5. Cache Aggressively

**Impact:** 70% fewer network requests

```typescript
ApexMediation.Configure(new ApexMediationConfig {
    CacheEnabled = true,
    CacheDuration = 3600 // 1 hour
});
```

**Caching strategy:**
```
First request: Download from network (1MB)
Next 10 requests: Serve from cache (0MB)
Savings: 10MB
```

---

## Revenue Optimization

### 1. Optimize Floor Prices

**Impact:** +5-10% revenue

**Strategy:** A/B test floor prices

```typescript
// Test variants
Variant A: floor_price = $1.50
Variant B: floor_price = $2.00
Variant C: floor_price = $2.50

// Monitor:
// - Revenue per user (RPU)
// - Fill rate
// - eCPM

// Winner: B ($2.00) - +8% revenue
```

**Dashboard:** Dashboard → A/B Tests → Create Test

### 2. Use Header Bidding

**Impact:** +12-15% revenue vs waterfall

```typescript
ApexMediation.Configure(new ApexMediationConfig {
    MediationStrategy = MediationStrategy.HeaderBidding
});
```

**Why?** True price competition, highest bid always wins

### 3. Optimize Ad Placements

**Impact:** +10-20% revenue

**High-performing placements:**
```
1. Level complete   eCPM: $3.50 ⭐⭐⭐
2. App launch       eCPM: $3.20 ⭐⭐⭐
3. Pause menu       eCPM: $2.80 ⭐⭐
4. Settings         eCPM: $2.10 ⭐
5. Random (bad)     eCPM: $1.50 ❌
```

**Rule:** Place ads at natural breakpoints, not mid-action

### 4. Integrate More Networks

**Impact:** +8-12% revenue per additional network (up to 15 networks)

```
1 network:  85% fill, $2.00 eCPM
5 networks: 95% fill, $2.50 eCPM (+25% revenue)
10 networks: 97% fill, $2.76 eCPM (+38% revenue) ✅
20 networks: 98% fill, $2.80 eCPM (+40% revenue, diminishing returns)
```

**Sweet spot:** 10-15 networks

### 5. Segment Users

**Impact:** +15-20% revenue from high-value users

```typescript
// Identify high-value users
const ltv = calculateLTV(user);

if (ltv > 1.00) {
    // High-value: Premium networks, higher floors
    ApexMediation.SetFloorPrice("interstitial", 3.00);
    ApexMediation.ConfigureNetworks(["admob", "meta"]); // Premium only
} else if (ltv > 0.10) {
    // Medium-value: Standard strategy
    ApexMediation.SetFloorPrice("interstitial", 2.00);
} else {
    // Low-value: Maximize fill
    ApexMediation.SetFloorPrice("interstitial", 1.00);
}
```

### 6. Implement Rewarded Ads

**Impact:** +30-50% revenue (highest eCPM)

```typescript
// Rewarded ads: $5-10 eCPM vs $2-3 for interstitials

// Offer rewards for watching
ApexMediation.OnAdRewarded += (reward) => {
    GiveUserCoins(100);
    GiveUserExtraLife();
};

ApexMediation.ShowAd(AdType.RewardedVideo);
```

**Placement ideas:**
- Extra lives
- In-game currency
- Power-ups
- Skip level
- Unlock content

### 7. Use Dynamic Floor Prices

**Impact:** +5-8% revenue through automatic optimization

```typescript
ApexMediation.Configure(new ApexMediationConfig {
    DynamicFloorPricing = true // Adjusts based on performance
});
```

**How it works:**
- Algorithm analyzes historical bids
- Adjusts floor up if high bids available
- Adjusts floor down if low fill rate
- Updates every 24 hours

### 8. Monitor & Iterate

**Impact:** Continuous improvement

**Weekly review:**
```
Dashboard → Analytics → Revenue

Check:
- RPU trend (growing?)
- Fill rate (>95%?)
- eCPM by network (any underperforming?)
- Fraud rate (<2%?)

Action:
- Disable underperforming networks
- Adjust floor prices
- Test new ad placements
```

---

## Platform-Specific Tips

### iOS

#### 1. Enable Bitcode

**Impact:** 10-15% smaller app size, faster downloads

```
Xcode → Build Settings → Enable Bitcode → Yes
```

#### 2. Use App Thinning

**Impact:** 30% smaller download size

```
Xcode → General → App Icons and Launch Images → Enable App Thinning
```

#### 3. Request ATT Early

**Impact:** +20% consent rate (higher personalized ad revenue)

```swift
// Request on second session (not first - better consent rate)
func application(_ application: UIApplication, didFinishLaunchingWithOptions...) {
    let sessionCount = UserDefaults.standard.integer(forKey: "session_count")

    if sessionCount == 1 { // Second session
        requestATT()
    }

    UserDefaults.standard.set(sessionCount + 1, forKey: "session_count")
}
```

---

### Android

#### 1. Enable R8/ProGuard

**Impact:** 30-40% smaller APK, 10-15% faster runtime

```gradle
// build.gradle
buildTypes {
    release {
        minifyEnabled true
        shrinkResources true
        proguardFiles getDefaultProguardFile('proguard-android-optimize.txt'), 'proguard-rules.pro'
    }
}
```

#### 2. Use App Bundles

**Impact:** 35% smaller download size

```gradle
// Publish as .aab instead of .apk
android {
    bundle {
        language {
            enableSplit = true
        }
        density {
            enableSplit = true
        }
        abi {
            enableSplit = true
        }
    }
}
```

#### 3. Optimize Manifest

**Impact:** Faster SDK initialization

```xml
<!-- AndroidManifest.xml -->
<application
    android:allowBackup="false"
    android:largeHeap="false"
    android:hardwareAccelerated="true">

    <!-- Declare ad activities -->
    <activity android:name="com.apexmediation.sdk.AdActivity"
              android:configChanges="keyboard|keyboardHidden|orientation|screenLayout|screenSize"
              android:theme="@android:style/Theme.Translucent.NoTitleBar"/>
</application>
```

---

### Unity

#### 1. Enable IL2CPP

**Impact:** 20-30% faster runtime

```
Build Settings → Scripting Backend → IL2CPP
```

#### 2. Strip Engine Code

**Impact:** 50% smaller build size

```
Player Settings → Optimization → Strip Engine Code → Enabled
Managed Stripping Level → Medium
```

#### 3. Use Addressables

**Impact:** 40% faster load times for large projects

```csharp
// Load ad assets from Addressables
await Addressables.LoadAssetAsync<AdConfig>("ad_config");
```

---

## Monitoring & Profiling

### SDK Performance Monitor

```typescript
// Enable performance monitoring
ApexMediation.Configure(new ApexMediationConfig {
    PerformanceMonitoring = true
});

// Get performance metrics
const metrics = await ApexMediation.GetPerformanceMetrics();
console.log(metrics);
// {
//   ad_load_time_avg: 87,
//   sdk_init_time: 45,
//   memory_usage: 4.2,
//   battery_impact: 0.008,
//   network_usage: 2.1
// }
```

### Platform Profilers

**Unity:**
```csharp
// Unity Profiler
Window → Analysis → Profiler
// Check CPU, Memory, Rendering
```

**Xcode:**
```
Product → Profile → Instruments
// Time Profiler, Allocations, Network
```

**Android Studio:**
```
View → Tool Windows → Profiler
// CPU, Memory, Network, Energy
```

### Remote Monitoring

**Dashboard → Analytics → Performance → Real-Time**

```
Live Performance Monitor (Last 5 Minutes)

┌──────────────────────────────────────────────┐
│ Active Users: 1,234                          │
│ Avg Load Time: 89ms        ✅               │
│ P95 Load Time: 156ms       ✅               │
│ P99 Load Time: 234ms       ⚠️               │
│ Error Rate: 0.4%           ✅               │
└──────────────────────────────────────────────┘

Recent Slow Loads (>200ms):
┌─────────┬─────────────┬─────────┬──────────┐
│ Time    │ User        │ Latency │ Network  │
├─────────┼─────────────┼─────────┼──────────┤
│ 14:23   │ user_abc123 │ 234ms   │ SlowNet  │
│ 14:22   │ user_def456 │ 267ms   │ SlowNet  │
└─────────┴─────────────┴─────────┴──────────┘

Action: Consider disabling "SlowNet"
```

### Automated Alerts

**Dashboard → Settings → Performance Alerts**

```
Alert Rules:

✅ Load time >200ms for 5 minutes → Email dev@example.com
✅ Memory usage >10MB → Slack #alerts
✅ Error rate >1% → PagerDuty
✅ ANR rate >0.02% → Email + Slack
```

---

## Optimization Checklist

### Before Launch

- [ ] Enable header bidding
- [ ] Set appropriate floor prices
- [ ] Integrate 10-15 ad networks
- [ ] Implement rewarded video ads
- [ ] Optimize ad placements (natural breakpoints)
- [ ] Enable bid caching
- [ ] Configure appropriate timeouts
- [ ] Enable compression
- [ ] Test on low-end devices
- [ ] Profile memory usage
- [ ] Profile battery impact
- [ ] Test on slow networks (3G)

### After Launch

- [ ] Monitor Dashboard → Performance weekly
- [ ] A/B test floor prices
- [ ] A/B test ad placements
- [ ] Review network performance
- [ ] Disable slow/underperforming networks
- [ ] Segment users by LTV
- [ ] Adjust floor prices per segment
- [ ] Monitor fraud rate
- [ ] Optimize based on user feedback
- [ ] Update SDK quarterly

---

## Support

**Email:** support@apexmediation.ee
**Dashboard:** https://console.apexmediation.ee/performance
**Documentation:** https://apexmediation.bel-consulting.ee/docs/optimization

**Response Times:**
- Performance degradation: <4 hours
- Optimization advice: <24 hours
- Custom profiling: <3 days
