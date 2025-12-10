# Ad Mediation Deep Dive

Complete technical guide to ApexMediation's advanced ad mediation platform.

## Table of Contents

1. [Overview](#overview)
2. [How Mediation Works](#how-mediation-works)
3. [Waterfall vs Header Bidding](#waterfall-vs-header-bidding)
4. [Network Integration](#network-integration)
5. [Bidding Logic](#bidding-logic)
6. [Performance Optimization](#performance-optimization)
7. [Advanced Features](#advanced-features)
8. [Best Practices](#best-practices)

---

## Overview

ApexMediation's mediation platform acts as an intelligent intermediary between your app and multiple ad networks, automatically selecting the highest-paying ad for each impression.

### Key Benefits

- **12-15% higher revenue** vs single network
- **<50ms latency** for ad requests
- **Transparent bid landscapes** - see every bid
- **Automatic optimization** - machine learning picks best network
- **No integration overhead** - single SDK, multiple networks

### Supported Networks

**Tier 1 Networks:**
- Google AdMob
- Meta Audience Network
- Unity Ads
- AppLovin
- ironSource
- Vungle
- AdColony
- Chartboost

**Tier 2 Networks:**
- Moloco
- Tapjoy
- Fyber
- Smaato
- MoPub
- Pangle (TikTok)

**Total:** 50+ ad networks integrated

---

## How Mediation Works

### Request Flow

```
┌─────────────┐
│   Your App  │
└──────┬──────┘
       │ 1. Request Ad
       ▼
┌─────────────────┐
│  ApexMediation SDK   │
└──────┬──────────┘
       │ 2. Send to Platform
       ▼
┌─────────────────────┐
│ ApexMediation Platform   │
│ - User profiling    │
│ - Network selection │
│ - Bid management    │
└──────┬──────────────┘
       │ 3. Request Bids (parallel)
       ▼
┌─────────────────────────────────────┐
│  AdMob │ Meta │ Unity │ AppLovin │...│
└──────┬───┬────┬───┬────┬────────────┘
       │   │    │   │    │
       ▼   ▼    ▼   ▼    ▼
    $2.50 $2.80 $2.30 $2.65
       │   │    │   │    │
       └───┴────┴───┴────┘
             │ 4. Highest Bid Wins
             ▼
       ┌─────────┐
       │  Meta   │ ◄── $2.80 (winner)
       └────┬────┘
            │ 5. Serve Ad
            ▼
       ┌─────────┐
       │ Your App│
       └─────────┘
```

### Timing Breakdown

| Step | Time | Description |
|------|------|-------------|
| 1. SDK Request | 2-5ms | Local SDK processes request |
| 2. Network Call | 10-20ms | Send to ApexMediation servers |
| 3. Bidding | 50-100ms | Parallel requests to networks |
| 4. Bid Selection | 2-5ms | Algorithm picks winner |
| 5. Ad Delivery | 20-50ms | Winner serves ad |
| **Total** | **84-180ms** | **End-to-end latency** |

Our **<50ms latency** refers to the ApexMediation platform processing time (steps 2-4), not including network ad serving.

---

## Waterfall vs Header Bidding

ApexMediation supports both mediation strategies:

### Waterfall (Traditional)

Networks called sequentially in priority order until one fills.

```
Priority 1: AdMob    → No fill
Priority 2: Meta     → No fill
Priority 3: Unity    → ✓ Fill ($2.30)
Priority 4: AppLovin → (not called)
```

**Pros:**
- Simple to understand
- Predictable behavior
- Works with all networks

**Cons:**
- Misses higher bids from lower priorities
- Sequential = slower
- Revenue loss of 5-10%

### Header Bidding (Recommended)

All networks bid simultaneously, highest bid wins.

```
Parallel Requests:
├─ AdMob:    $2.50
├─ Meta:     $2.80 ◄── Winner
├─ Unity:    $2.30
└─ AppLovin: $2.65
```

**Pros:**
- 12-15% higher revenue
- True price competition
- Faster (parallel requests)

**Cons:**
- More complex
- Requires all networks support bidding
- Higher QPS to your servers

### Configuration

```typescript
// Unity SDK
ApexMediation.Configure(new ApexMediationConfig {
    MediationStrategy = MediationStrategy.HeaderBidding,
    BiddingTimeout = 500, // ms
    FallbackToWaterfall = true // if bidding fails
});
```

```swift
// iOS SDK
let config = ApexMediationConfig()
config.mediationStrategy = .headerBidding
config.biddingTimeout = 0.5 // seconds
config.fallbackToWaterfall = true
ApexMediation.configure(config)
```

---

## Network Integration

### Adding Networks

1. **Dashboard Configuration**
   - Go to **Settings → Ad Networks**
   - Click **Add Network**
   - Select network (e.g., AdMob)
   - Enter credentials (API key, placement IDs)
   - Set priority/floor prices

2. **SDK Integration**

   No code changes needed! Networks are configured server-side.

3. **Testing**

   Use test mode to verify integration:
   ```typescript
   ApexMediation.SetTestMode(true);
   ApexMediation.LoadAd(AdType.Interstitial);
   ```

### Network Credentials

**Google AdMob:**
- App ID: `ca-app-pub-XXXXXXXXXXXXXXXX~XXXXXXXXXX`
- Ad Unit IDs: Banner, Interstitial, Rewarded

**Meta Audience Network:**
- Placement IDs: `XXXXXXXXXXXXXXXX_XXXXXXXXXXXXXXXX`

**Unity Ads:**
- Game ID: `XXXXXXX`
- Placement IDs: `video`, `rewardedVideo`, `banner`

**AppLovin:**
- SDK Key: `XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX`
- Placement names: Custom or default

Store credentials securely - never hardcode in app.

### Network Adapters

ApexMediation uses adapter pattern for network integration:

```
┌─────────────┐
│ ApexMediation SDK│
└──────┬──────┘
       │
       ├─► AdMobAdapter
       ├─► MetaAdapter
       ├─► UnityAdapter
       └─► AppLovinAdapter
```

Adapters automatically installed with SDK (no manual integration needed).

---

## Bidding Logic

### Bid Request

```json
{
  "request_id": "req_a1b2c3d4e5f6",
  "app": {
    "bundle_id": "com.example.game",
    "name": "Super Game",
    "store_url": "https://apps.apple.com/app/id123456789"
  },
  "device": {
    "os": "iOS",
    "os_version": "17.1",
    "model": "iPhone 15 Pro",
    "screen_size": "1179x2556",
    "language": "en",
    "timezone": "Europe/Tallinn"
  },
  "user": {
    "id": "user_xyz789",
    "age": 28,
    "gender": "M",
    "interests": ["gaming", "sports"]
  },
  "ad_request": {
    "type": "interstitial",
    "placement": "level_complete",
    "floor_price": 2.00
  },
  "timeout": 500
}
```

### Bid Response

```json
{
  "request_id": "req_a1b2c3d4e5f6",
  "network": "meta",
  "bid_price": 2.80,
  "currency": "USD",
  "creative_id": "creative_abc123",
  "ad_markup": "<html>...</html>",
  "ttl": 300,
  "bid_time_ms": 87
}
```

### Bid Selection Algorithm

```python
def select_winning_bid(bids):
    # Filter valid bids
    valid_bids = [b for b in bids if b.bid_price >= floor_price]

    if not valid_bids:
        return None  # No fill

    # Sort by adjusted price (eCPM with quality score)
    for bid in valid_bids:
        bid.adjusted_price = bid.bid_price * bid.network_quality_score

    valid_bids.sort(key=lambda b: b.adjusted_price, reverse=True)

    # Winner
    winner = valid_bids[0]

    # Second-price auction (winner pays 2nd highest + $0.01)
    if len(valid_bids) > 1:
        winner.final_price = valid_bids[1].adjusted_price + 0.01
    else:
        winner.final_price = winner.bid_price

    return winner
```

### Network Quality Score

Quality score adjusts bids based on network performance:

```
Adjusted Bid = Raw Bid × Quality Score

Quality Score = (
    0.5 × Fill Rate +
    0.3 × Click-Through Rate +
    0.2 × (1 - Error Rate)
)
```

**Example:**
- AdMob bids $2.80, quality 0.95 → Adjusted: $2.66
- Meta bids $2.65, quality 1.00 → Adjusted: $2.65
- Winner: AdMob (higher adjusted bid)

---

## Performance Optimization

### Parallel Bidding

ApexMediation requests bids from all networks simultaneously:

```typescript
// Sequential (slow - 500ms)
const bid1 = await requestBid('admob');
const bid2 = await requestBid('meta');
const bid3 = await requestBid('unity');

// Parallel (fast - 120ms)
const [bid1, bid2, bid3] = await Promise.all([
    requestBid('admob'),
    requestBid('meta'),
    requestBid('unity')
]);
```

### Timeout Management

```typescript
const BIDDING_TIMEOUT = 500; // ms

async function requestBidsWithTimeout(networks) {
    const bidPromises = networks.map(network =>
        requestBid(network).catch(err => null)
    );

    const timeoutPromise = new Promise(resolve =>
        setTimeout(() => resolve([]), BIDDING_TIMEOUT)
    );

    return Promise.race([
        Promise.all(bidPromises),
        timeoutPromise
    ]);
}
```

### Caching

**Bid Caching:**
- Cache winning bids for 5 minutes
- Use cached bid if no new bids available
- Reduces latency by 70%

**Network Caching:**
- Cache network configurations (60 minutes)
- Cache user segments (24 hours)
- Cache creative assets (7 days)

### Preloading

```typescript
// Preload ads during gameplay
ApexMediation.PreloadAd(AdType.Interstitial);
ApexMediation.PreloadAd(AdType.RewardedVideo);

// Show instantly when needed
if (ApexMediation.IsAdReady(AdType.Interstitial)) {
    ApexMediation.ShowAd(AdType.Interstitial);
}
```

---

## Advanced Features

### A/B Testing

Test different mediation strategies:

```typescript
// Dashboard: Create A/B test
// Variant A: Header bidding (50% traffic)
// Variant B: Waterfall (50% traffic)

// SDK automatically participates
ApexMediation.LoadAd(AdType.Banner);
// User assigned to variant, strategy applied
```

View results in Dashboard → A/B Tests:
- Revenue per user (RPU)
- Fill rate
- eCPM
- Statistical significance

### Floor Pricing

Set minimum bid prices per placement:

```typescript
// Global floor
ApexMediation.SetGlobalFloorPrice(1.50);

// Per-placement floor
ApexMediation.SetFloorPrice("level_complete", 2.00);
ApexMediation.SetFloorPrice("main_menu", 1.00);
```

Dynamic floors adjust based on historical performance.

### Geo-Targeting

Different networks perform better in different regions:

```
US/Canada: AdMob, Meta (high CPM)
Europe: Unity, AppLovin
Asia: Vungle, Pangle
Emerging: Moloco, Fyber
```

ApexMediation automatically optimizes network priority by geo.

### User Segments

Create custom segments for personalized mediation:

```typescript
ApexMediation.SetUserSegment("high_value", {
    minLifetimeRevenue: 10.00,
    minSessionCount: 50
});

// High-value users get premium ad experience
// (higher floor prices, better networks)
```

### Frequency Capping

Limit ad impressions per user:

```typescript
ApexMediation.SetFrequencyCap(AdType.Interstitial, {
    maxImpressions: 5,
    timeWindow: 3600 // 1 hour
});
```

### Ad Quality Filtering

Filter low-quality ads automatically:

```typescript
ApexMediation.SetQualityFilters({
    blockAdultContent: true,
    blockGamblingContent: true,
    blockPoliticalContent: true,
    minimumCreativeQuality: 0.7
});
```

---

## Best Practices

### 1. Use Header Bidding

**Always use header bidding for maximum revenue.**

```typescript
ApexMediation.Configure(new ApexMediationConfig {
    MediationStrategy = MediationStrategy.HeaderBidding
});
```

### 2. Set Appropriate Timeouts

**Balance revenue vs latency:**

- **Games:** 500ms timeout (users tolerate slight delay)
- **Utility apps:** 300ms timeout (users expect instant response)
- **News/content:** 700ms timeout (revenue prioritized)

### 3. Preload Ads

**Always preload ads before showing:**

```typescript
// ❌ Bad: Load and show immediately
ApexMediation.LoadAd(AdType.Interstitial);
ApexMediation.ShowAd(AdType.Interstitial); // Not ready!

// ✅ Good: Preload, then show when ready
ApexMediation.PreloadAd(AdType.Interstitial);
// ... gameplay ...
if (ApexMediation.IsAdReady(AdType.Interstitial)) {
    ApexMediation.ShowAd(AdType.Interstitial);
}
```

### 4. Integrate Multiple Networks

**More networks = higher competition = more revenue.**

**Minimum:** 5 networks
**Recommended:** 10-15 networks
**Maximum:** 25 networks (diminishing returns)

### 5. Monitor Performance

**Check Dashboard weekly:**

- **Fill rate** (target: >95%)
- **eCPM** (compare to industry benchmarks)
- **Latency** (target: <200ms end-to-end)
- **Error rate** (target: <1%)

### 6. Set Floor Prices

**Protect your inventory value:**

```typescript
// Start with industry averages
ApexMediation.SetFloorPrice("interstitial", 2.00);
ApexMediation.SetFloorPrice("rewarded", 5.00);
ApexMediation.SetFloorPrice("banner", 0.50);

// Adjust based on performance
```

### 7. Test Thoroughly

**Always test before production:**

```typescript
ApexMediation.SetTestMode(true);
// Test each ad type
ApexMediation.LoadAd(AdType.Banner);
ApexMediation.LoadAd(AdType.Interstitial);
ApexMediation.LoadAd(AdType.RewardedVideo);
```

### 8. Handle Errors Gracefully

```typescript
ApexMediation.OnAdLoadFailed += (adType, error) => {
    Debug.LogError($"Ad load failed: {error}");
    // Show organic content instead
    ShowOrganicContent();
};
```

### 9. Optimize Placements

**Strategic ad placement increases revenue:**

- **Interstitials:** Level complete, app launch, pause menu
- **Rewarded:** Extra lives, currency, power-ups
- **Banners:** Persistent UI (minimize accidental clicks)

### 10. Use Analytics

**Track custom events for optimization:**

```typescript
ApexMediation.TrackEvent("level_complete", new {
    level = 5,
    duration = 120,
    score = 1500
});

// Correlate events with ad performance
```

---

## Performance Metrics

### Industry Benchmarks

| Metric | ApexMediation | Industry Avg | Improvement |
|--------|----------|--------------|-------------|
| **eCPM** | $2.80 | $2.43 | +15% |
| **Fill Rate** | 97% | 89% | +8% |
| **Latency** | 84ms | 350ms | -76% |
| **Revenue Lift** | +12-15% | - | - |

### Optimization Results

**Case Study: Mobile Game (500K DAU)**

| Metric | Before | After | Change |
|--------|--------|-------|--------|
| Daily Revenue | $1,200 | $1,380 | +15% |
| eCPM | $2.40 | $2.76 | +15% |
| Fill Rate | 88% | 97% | +9% |
| Latency | 420ms | 87ms | -79% |

**Changes Made:**
1. Switched waterfall → header bidding
2. Added 8 new ad networks
3. Enabled dynamic floor pricing
4. Implemented bid caching
5. Optimized ad placements

---

## API Reference

### Load Ad

```typescript
ApexMediation.LoadAd(
    adType: AdType,
    placement?: string,
    options?: {
        floorPrice?: number,
        timeout?: number,
        userId?: string
    }
): Promise<void>
```

### Show Ad

```typescript
ApexMediation.ShowAd(
    adType: AdType,
    placement?: string
): Promise<AdResult>
```

### Check Ad Ready

```typescript
ApexMediation.IsAdReady(
    adType: AdType,
    placement?: string
): boolean
```

### Set Mediation Strategy

```typescript
ApexMediation.SetMediationStrategy(
    strategy: MediationStrategy.HeaderBidding | MediationStrategy.Waterfall
): void
```

### Configure Networks

```typescript
ApexMediation.ConfigureNetworks(
    networks: Array<{
        name: string,
        priority: number,
        enabled: boolean
    }>
): void
```

---

## Troubleshooting

### Low Fill Rate (<90%)

**Causes:**
- Floor prices too high
- Limited network integrations
- Geo restrictions

**Solutions:**
1. Lower floor prices by 20%
2. Add more ad networks (target 10+)
3. Check geo-targeting settings
4. Review network credentials

### High Latency (>200ms)

**Causes:**
- Too many networks
- High bidding timeout
- Slow network connections

**Solutions:**
1. Reduce bidding timeout to 500ms
2. Disable underperforming networks
3. Enable bid caching
4. Preload ads earlier

### Low eCPM (<$2.00)

**Causes:**
- Poor ad placements
- Low network competition
- Waterfall mediation

**Solutions:**
1. Switch to header bidding
2. Add premium networks (AdMob, Meta)
3. Set floor prices
4. Optimize placements (fewer, better placed)

### Frequent Errors

**Causes:**
- Network downtime
- Invalid credentials
- SDK integration issues

**Solutions:**
1. Verify network credentials in Dashboard
2. Update SDK to latest version
3. Check error logs for specific issues
4. Contact support: support@apexmediation.ee

---

## Support

**Email:** support@apexmediation.ee
**Dashboard:** https://console.apexmediation.ee
**Documentation:** https://apexmediation.bel-consulting.ee/docs
**Status Page:** https://status.apexmediation.ee

**Response Times:**
- Critical issues: <1 hour
- Standard support: <24 hours
- Feature requests: <7 days
