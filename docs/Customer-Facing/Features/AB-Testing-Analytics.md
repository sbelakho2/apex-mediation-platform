# A/B Testing & Analytics

Complete guide to optimizing ad revenue with data-driven A/B tests and comprehensive analytics.

## Table of Contents

1. [A/B Testing Overview](#ab-testing-overview)
2. [Creating A/B Tests](#creating-ab-tests)
3. [Test Types](#test-types)
4. [Statistical Significance](#statistical-significance)
5. [Analytics Dashboard](#analytics-dashboard)
6. [Custom Events](#custom-events)
7. [Revenue Analytics](#revenue-analytics)
8. [Best Practices](#best-practices)

---

## A/B Testing Overview

Test different ad strategies to maximize revenue. ApexMediation's A/B testing platform automatically splits traffic, collects data, and determines statistical significance.

### Why A/B Test?

- **Increase revenue by 10-20%** through optimization
- **Remove guesswork** - data-driven decisions
- **Test safely** - gradual rollout, easy rollback
- **Continuous improvement** - always testing, always learning

### What You Can Test

- Mediation strategies (waterfall vs header bidding)
- Ad placements (when/where to show ads)
- Ad formats (banner vs interstitial vs rewarded)
- Floor prices ($1.50 vs $2.00 vs $2.50)
- Ad networks (enable/disable specific networks)
- Frequency caps (5 vs 10 vs unlimited)
- User segments (high-value vs low-value)

---

## Creating A/B Tests

### Dashboard

**Navigate to: Dashboard → A/B Tests → Create Test**

**Step 1: Test Details**
```
Name: Header Bidding vs Waterfall
Description: Test if header bidding increases revenue
Duration: 14 days
Traffic Split: 50% / 50%
```

**Step 2: Control Variant (A)**
```
Name: Control - Waterfall
Mediation Strategy: Waterfall
Networks: AdMob, Meta, Unity, AppLovin (priority order)
Floor Price: $2.00
```

**Step 3: Treatment Variant (B)**
```
Name: Treatment - Header Bidding
Mediation Strategy: Header Bidding
Networks: AdMob, Meta, Unity, AppLovin (parallel bidding)
Floor Price: $2.00
```

**Step 4: Success Metrics**
```
Primary: Revenue per user (RPU)
Secondary: eCPM, Fill Rate, Latency
Minimum Sample Size: 10,000 users per variant
Minimum Improvement: 5% (for statistical significance)
```

**Step 5: Review & Launch**
```
Total Traffic: 100,000 daily users
Variant A: 50,000 users
Variant B: 50,000 users
Expected Duration: 14 days (reach significance)
```

### API

```bash
curl -X POST "https://api.apexmediation.ee/v1/ab-tests" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Header Bidding vs Waterfall",
    "description": "Test mediation strategies",
    "duration_days": 14,
    "variants": [
      {
        "name": "Control - Waterfall",
        "traffic_percentage": 50,
        "config": {
          "mediation_strategy": "waterfall",
          "networks": ["admob", "meta", "unity", "applovin"],
          "floor_price": 2.00
        }
      },
      {
        "name": "Treatment - Header Bidding",
        "traffic_percentage": 50,
        "config": {
          "mediation_strategy": "header_bidding",
          "networks": ["admob", "meta", "unity", "applovin"],
          "floor_price": 2.00
        }
      }
    ],
    "success_metrics": {
      "primary": "revenue_per_user",
      "secondary": ["ecpm", "fill_rate", "latency"],
      "minimum_sample_size": 10000,
      "minimum_improvement": 0.05
    }
  }'
```

### SDK (Auto-participation)

**No code changes needed!** Users automatically participate based on device ID hash.

```typescript
// SDK automatically assigns users to variants
ApexMediation.LoadAd(AdType.Interstitial);
// Behind the scenes:
// - User hashed to variant A or B
// - Variant config applied
// - Results tracked automatically
```

**Manual variant assignment (advanced):**
```typescript
// Force specific variant for testing
ApexMediation.SetTestVariant("test_abc123", "variant_b");
ApexMediation.LoadAd(AdType.Interstitial);
```

---

## Test Types

### 1. Mediation Strategy Test

**Goal:** Determine if header bidding increases revenue vs waterfall.

**Variants:**
- **A:** Waterfall (sequential)
- **B:** Header bidding (parallel)

**Expected result:** B wins with +12-15% revenue

**Example:**
```json
{
  "name": "Mediation Strategy Test",
  "variants": [
    {
      "name": "Waterfall",
      "config": {"mediation_strategy": "waterfall"}
    },
    {
      "name": "Header Bidding",
      "config": {"mediation_strategy": "header_bidding"}
    }
  ]
}
```

### 2. Floor Price Test

**Goal:** Find optimal floor price that maximizes revenue.

**Variants:**
- **A:** $1.50 floor
- **B:** $2.00 floor
- **C:** $2.50 floor

**Tradeoff:** Higher floor = higher eCPM but lower fill rate

**Example:**
```json
{
  "name": "Floor Price Optimization",
  "variants": [
    {"name": "$1.50", "config": {"floor_price": 1.50}},
    {"name": "$2.00", "config": {"floor_price": 2.00}},
    {"name": "$2.50", "config": {"floor_price": 2.50}}
  ]
}
```

### 3. Ad Placement Test

**Goal:** Test different times/places to show ads.

**Variants:**
- **A:** Interstitial every 3 levels
- **B:** Interstitial every 5 levels

**Expected result:** A has higher revenue but potentially lower retention

**Example:**
```typescript
// Variant A
ApexMediation.SetFrequencyCap(AdType.Interstitial, {
    maxImpressions: 999,
    levelsBetweenAds: 3
});

// Variant B
ApexMediation.SetFrequencyCap(AdType.Interstitial, {
    maxImpressions: 999,
    levelsBetweenAds: 5
});
```

### 4. Network Mix Test

**Goal:** Test different network combinations.

**Variants:**
- **A:** All networks (10+)
- **B:** Premium only (AdMob, Meta, Unity)

**Expected result:** A has higher fill rate, B has higher eCPM

**Example:**
```json
{
  "name": "Network Mix Test",
  "variants": [
    {
      "name": "All Networks",
      "config": {"networks": ["admob", "meta", "unity", "applovin", "ironsource", "vungle", ...]}
    },
    {
      "name": "Premium Only",
      "config": {"networks": ["admob", "meta", "unity"]}
    }
  ]
}
```

### 5. Ad Format Test

**Goal:** Compare banner vs interstitial revenue.

**Variants:**
- **A:** Persistent banner + interstitials
- **B:** Interstitials only

**Expected result:** Depends on game design and user tolerance

**Example:**
```typescript
// Variant A
ApexMediation.LoadAd(AdType.Banner);
ApexMediation.ShowAd(AdType.Banner); // Persistent
ApexMediation.LoadAd(AdType.Interstitial); // Occasional

// Variant B
// No banner
ApexMediation.LoadAd(AdType.Interstitial); // More frequent
```

---

## Statistical Significance

### How We Calculate It

**Bayesian A/B testing** - more accurate than frequentist t-tests.

```python
def calculate_significance(variant_a, variant_b):
    # Bayesian posterior distributions
    posterior_a = beta_distribution(
        successes=variant_a.revenue,
        trials=variant_a.users
    )
    posterior_b = beta_distribution(
        successes=variant_b.revenue,
        trials=variant_b.users
    )

    # Probability B > A
    prob_b_wins = monte_carlo_simulation(
        posterior_a, posterior_b, n_samples=100000
    )

    # Significance levels
    if prob_b_wins > 0.95:
        return "B wins (95% confidence)"
    elif prob_b_wins > 0.90:
        return "B likely wins (90% confidence)"
    elif prob_b_wins > 0.80:
        return "B trending up (80% confidence)"
    elif prob_b_wins < 0.05:
        return "A wins (95% confidence)"
    elif prob_b_wins < 0.10:
        return "A likely wins (90% confidence)"
    else:
        return "No clear winner yet"
```

### Sample Size Requirements

**Minimum sample sizes for reliable results:**

| Metric | Min Sample Per Variant | Reason |
|--------|------------------------|--------|
| Revenue per user | 10,000 users | High variance |
| eCPM | 5,000 impressions | Moderate variance |
| Fill rate | 1,000 impressions | Low variance |
| Click-through rate | 10,000 impressions | Low frequency event |

**Time to significance:**

```
Expected Users: 100,000/day
Traffic Split: 50% / 50%
Users per variant: 50,000/day

Day 1: 50,000 users - Not significant yet
Day 2: 100,000 users - Trending significance
Day 3: 150,000 users - 90% confidence ✅
Day 7: 350,000 users - 95% confidence ✅✅
Day 14: 700,000 users - 99% confidence ✅✅✅
```

### Results Dashboard

**Dashboard → A/B Tests → [Test Name]**

```
┌────────────────────────────────────────────────────┐
│  Header Bidding vs Waterfall (Day 7/14)           │
├────────────────────────────────────────────────────┤
│  Status: Running ● 95% Confidence Reached          │
│  Winner: Variant B (Header Bidding)               │
│  Revenue Lift: +13.4% (95% CI: +11.2% to +15.6%) │
└────────────────────────────────────────────────────┘

┌───────────────────┬─────────────┬─────────────┬──────────┐
│ Metric            │ Variant A   │ Variant B   │ Lift     │
├───────────────────┼─────────────┼─────────────┼──────────┤
│ Users             │ 350,000     │ 350,000     │ -        │
│ Revenue           │ $8,750      │ $9,923      │ +13.4% ✅│
│ RPU               │ $0.025      │ $0.0283     │ +13.4% ✅│
│ eCPM              │ $2.50       │ $2.83       │ +13.2% ✅│
│ Fill Rate         │ 92%         │ 97%         │ +5.4% ✅ │
│ Latency (avg)     │ 420ms       │ 87ms        │ -79.3% ✅│
│ Impressions       │ 3,500,000   │ 3,500,000   │ -        │
└───────────────────┴─────────────┴─────────────┴──────────┘

Recommendation: Roll out Variant B to 100% traffic
Estimated Annual Revenue Increase: $58,000
```

### Early Stopping

**Stop test early if:**
- **Clear winner:** 99% confidence reached before end date
- **No difference:** 0% probability of 5% improvement after 2x expected duration
- **Negative impact:** Variant significantly hurts key metric (retention, crashes)

**Example early stop:**
```
Day 3/14: 99% confidence reached
Estimated: $100 daily waste continuing test
Action: Stop test, roll out winner immediately
```

---

## Analytics Dashboard

### Overview

**Dashboard → Analytics → Overview**

```
┌─────────────────────────────────────────────────────┐
│  Revenue Overview (Last 30 Days)                    │
├─────────────────────────────────────────────────────┤
│  Total Revenue:        $34,567.89                   │
│  Daily Average:        $1,152.26                    │
│  Growth (vs prev):     +12.4% ↗                     │
│  Estimated Annual:     $420,675                     │
└─────────────────────────────────────────────────────┘

Revenue by Day (chart)
  $1,500 ┤                              ╭─╮
  $1,250 ┤                     ╭─╮ ╭──╮ │ │
  $1,000 ┤        ╭──╮    ╭───╮│ │╭╯  ╰─╯ ╰╮
    $750 ┤   ╭───╮│  │╭───╯   ╰╯ ╰╯        │
    $500 ┤╭──╯   ╰╯  ╰╯                    ╰─╮
         └┴─┴─┴─┴─┴─┴─┴─┴─┴─┴─┴─┴─┴─┴─┴─┴─┴─┴─
          1  5  10  15  20  25  30
```

### Key Metrics

**Revenue Metrics:**
- **Total Revenue:** $34,567.89 (30 days)
- **Daily Revenue:** $1,152.26 average
- **Revenue per User (RPU):** $0.0283
- **Revenue per Session:** $0.0047
- **Revenue per DAU:** $0.0283

**Engagement Metrics:**
- **DAU (Daily Active Users):** 40,726
- **MAU (Monthly Active Users):** 523,456
- **Sessions per User:** 6.0
- **Avg Session Duration:** 8.5 minutes
- **Retention (D1/D7/D30):** 42% / 18% / 8%

**Ad Metrics:**
- **Impressions:** 4,234,567
- **Fill Rate:** 96.8%
- **eCPM:** $2.76
- **Click-Through Rate:** 1.8%
- **Viewability:** 87%

**Performance Metrics:**
- **Avg Latency:** 89ms
- **Error Rate:** 0.4%
- **ANR Contribution:** <0.02%
- **Crash Rate:** 0.1%

### Cohort Analysis

**Dashboard → Analytics → Cohorts**

```
Revenue by Install Cohort

         │ Day 0 │ Day 1 │ Day 7 │ Day 30│ LTV   │
─────────┼───────┼───────┼───────┼───────┼───────┤
Oct 2025 │ $0.05 │ $0.08 │ $0.15 │ $0.28 │ $0.45 │
Sep 2025 │ $0.04 │ $0.07 │ $0.13 │ $0.25 │ $0.42 │
Aug 2025 │ $0.03 │ $0.06 │ $0.12 │ $0.23 │ $0.38 │

Growth: +18% LTV (Oct vs Aug)
```

**Retention by Cohort:**
```
         │ Day 1 │ Day 7 │ Day 30│
─────────┼───────┼───────┼───────┤
Oct 2025 │ 45%   │ 21%   │ 10%   │ ↗
Sep 2025 │ 42%   │ 18%   │ 8%    │ →
Aug 2025 │ 40%   │ 16%   │ 7%    │ →
```

### Funnel Analysis

**Dashboard → Analytics → Funnels**

```
User Journey: Install → Session → Ad View → Click

  Install          100,000 users  (100%)
     ↓
  Day 1 Session     42,000 users  (42%)  ← 58% churn
     ↓
  Ad Impression     39,000 users  (93%)  ← 7% no ad shown
     ↓
  Ad Click           702 users    (1.8%) ← 98.2% no click
     ↓
  Conversion          21 users    (3.0%) ← 97% no conversion

Bottlenecks:
1. Day 1 Retention: 42% (industry avg: 40%) ✅
2. Ad Fill: 93% (target: 95%) ⚠️
3. CTR: 1.8% (industry avg: 1.5%) ✅
```

### Segment Analysis

**Dashboard → Analytics → Segments**

```
Revenue by User Segment

High-Value Users (LTV >$1.00):
  Count: 52,340 (10% of users)
  Revenue: $23,456 (68% of total revenue)
  RPU: $0.448
  Avg Sessions: 15.2

Medium-Value Users (LTV $0.10-$1.00):
  Count: 261,700 (50% of users)
  Revenue: $10,234 (30% of total revenue)
  RPU: $0.039
  Avg Sessions: 5.8

Low-Value Users (LTV <$0.10):
  Count: 209,360 (40% of users)
  Revenue: $877 (2% of total revenue)
  RPU: $0.004
  Avg Sessions: 1.2

Strategy: Focus ad optimization on high-value users
```

---

## Custom Events

### Tracking Custom Events

**Track game-specific events for deeper analysis:**

```typescript
// Level complete
ApexMediation.TrackEvent("level_complete", {
    level: 5,
    duration: 120, // seconds
    score: 1500,
    stars: 3
});

// In-app purchase
ApexMediation.TrackEvent("iap_purchase", {
    product_id: "com.game.coins_100",
    price: 0.99,
    currency: "USD",
    coins_purchased: 100
});

// User milestone
ApexMediation.TrackEvent("milestone_reached", {
    milestone: "100_levels_completed",
    days_since_install: 7
});
```

### Event Schema

```typescript
interface CustomEvent {
    name: string;                    // Event name
    properties?: Record<string, any>; // Custom properties
    user_id?: string;                // User identifier
    session_id?: string;             // Session identifier
    timestamp?: number;              // Unix timestamp (ms)
}
```

### Viewing Custom Events

**Dashboard → Analytics → Custom Events**

```
┌──────────────────────────────────────────────────────┐
│  Custom Events (Last 30 Days)                        │
├──────────────────────────────────────────────────────┤
│  level_complete:       1,234,567 events              │
│  iap_purchase:         5,678 events                  │
│  milestone_reached:    23,456 events                 │
│  achievement_unlocked: 45,678 events                 │
└──────────────────────────────────────────────────────┘

Event Details: level_complete
┌──────────┬────────┬─────────────┬──────────┐
│ Level    │ Count  │ Avg Duration│ Avg Score│
├──────────┼────────┼─────────────┼──────────┤
│ 1        │ 98,765 │ 45s         │ 850      │
│ 2        │ 87,654 │ 67s         │ 1,200    │
│ 3        │ 76,543 │ 89s         │ 1,450    │
│ 4        │ 65,432 │ 102s        │ 1,680    │
│ 5        │ 54,321 │ 120s        │ 1,850    │
└──────────┴────────┴─────────────┴──────────┘

Insights:
- 90% drop-off between levels 1→5
- Average completion time increases 18% per level
- Opportunity: Show rewarded ad for "skip level" at level 4+
```

### Correlating Events with Revenue

**Dashboard → Analytics → Event Correlation**

```
Revenue by Event Frequency

level_complete events per user vs RPU:
  0-10 events:   $0.012 RPU  (low engagement)
  11-50 events:  $0.028 RPU  (medium engagement)
  51-100 events: $0.045 RPU  (high engagement) ✅
  100+ events:   $0.067 RPU  (power users) ✅✅

Recommendation: Optimize ad placement for 51+ event users
```

---

## Revenue Analytics

### Revenue by Source

**Dashboard → Analytics → Revenue Sources**

```
Revenue by Ad Network (30 days)

┌─────────────┬───────────┬────────┬──────────┬────────┐
│ Network     │ Revenue   │ %      │ eCPM     │ Fill   │
├─────────────┼───────────┼────────┼──────────┼────────┤
│ Meta        │ $12,345   │ 35.7%  │ $3.20    │ 89%    │
│ AdMob       │ $10,234   │ 29.6%  │ $2.85    │ 95%    │
│ Unity       │ $7,890    │ 22.8%  │ $2.50    │ 98%    │
│ AppLovin    │ $3,456    │ 10.0%  │ $2.30    │ 92%    │
│ Others      │ $642      │ 1.9%   │ $1.80    │ 67%    │
├─────────────┼───────────┼────────┼──────────┼────────┤
│ **Total**   │ $34,567   │ 100%   │ $2.76    │ 93%    │
└─────────────┴───────────┴────────┴──────────┴────────┘

Insights:
- Meta: Highest eCPM but lower fill
- Unity: Lowest eCPM but highest fill
- Optimization: Increase Meta priority in header bidding
```

### Revenue by Geography

```
Revenue by Country (top 5)

┌────────────┬───────────┬──────────┬─────────┐
│ Country    │ Revenue   │ RPU      │ Users   │
├────────────┼───────────┼──────────┼─────────┤
│ US         │ $15,234   │ $0.0523  │ 291,234 │
│ Germany    │ $5,678    │ $0.0389  │ 145,987 │
│ UK         │ $4,567    │ $0.0412  │ 110,876 │
│ Canada     │ $3,456    │ $0.0456  │ 75,789  │
│ France     │ $2,345    │ $0.0298  │ 78,654  │
└────────────┴───────────┴──────────┴─────────┘

Strategy: Tier 1 geos (US, CA, UK, DE) = premium networks
```

### Revenue by Ad Format

```
Revenue by Ad Type (30 days)

Interstitial:   $18,345  (53%)  eCPM: $3.20
Rewarded Video: $12,234  (35%)  eCPM: $5.50
Banner:         $3,988   (12%)  eCPM: $0.80

RPU by Format:
- Apps with rewarded: $0.035 RPU
- Apps without rewarded: $0.021 RPU
- Lift: +67% with rewarded video ✅

Recommendation: Implement rewarded video ads
```

---

## Best Practices

### 1. Always Be Testing

**Run continuous A/B tests:**
- Test 1 variable at a time
- Minimum 14 days per test
- Wait for 95% confidence
- Document learnings

### 2. Track Everything

**Instrument all key events:**
```typescript
// Game events
ApexMediation.TrackEvent("level_complete", {...});
ApexMediation.TrackEvent("level_failed", {...});
ApexMediation.TrackEvent("achievement_unlocked", {...});

// Monetization events
ApexMediation.TrackEvent("iap_purchase", {...});
ApexMediation.TrackEvent("ad_rewarded", {...});
ApexMediation.TrackEvent("subscription_started", {...});

// Engagement events
ApexMediation.TrackEvent("session_start", {...});
ApexMediation.TrackEvent("session_end", {...});
ApexMediation.TrackEvent("feature_used", {...});
```

### 3. Monitor Daily

**Check key metrics daily:**
- Revenue (vs target)
- Fill rate (>95%)
- eCPM (stable or growing)
- Error rate (<1%)

### 4. Act on Insights

**Analytics → Action:**
```
Insight: High-value users (10%) generate 68% of revenue
Action: Create VIP tier with premium ad experience

Insight: Level 4+ has 90% drop-off
Action: Add rewarded "skip level" option

Insight: Meta has highest eCPM but low fill
Action: Add Meta-alternative in waterfall fallback
```

### 5. Compare to Benchmarks

**Industry benchmarks (mobile games):**
```
RPU:        $0.02 - $0.05
eCPM:       $2.00 - $3.50
Fill Rate:  85% - 95%
CTR:        1.0% - 2.0%
D1 Retention: 35% - 45%
```

If below benchmarks, investigate and optimize.

### 6. Segment Users

**Different strategies for different users:**
```
High-Value (LTV >$1):
  - Premium networks only
  - Higher floor prices
  - Fewer ads (better UX)

Medium-Value (LTV $0.10-$1):
  - Balanced mediation
  - Standard floor prices
  - Normal ad frequency

Low-Value (LTV <$0.10):
  - Maximize fill rate
  - Lower floor prices
  - More ads (maximize short-term value)
```

### 7. Test Edge Cases

**Test with small traffic first:**
```
Test plan:
Day 1-3:   5% traffic (early warning)
Day 4-7:   25% traffic (validate)
Day 8-14:  50% traffic (full test)
Day 15+:   100% rollout (if winner)
```

### 8. Document Everything

**Keep test log:**
```
Test: Header Bidding vs Waterfall
Date: Oct 1 - Oct 14, 2025
Traffic: 50% / 50%
Result: +13.4% revenue (header bidding wins)
Rollout: Oct 15, 2025 (100% traffic)
Impact: +$58K annual revenue
Learnings: Header bidding superior in all metrics
```

### 9. Use Custom Dashboards

**Create role-specific dashboards:**

**Executive Dashboard:**
- Total revenue (daily/monthly)
- Revenue growth (%)
- RPU
- Top 3 issues

**Product Dashboard:**
- Retention (D1/D7/D30)
- Session duration
- Feature usage
- Drop-off points

**Monetization Dashboard:**
- eCPM by network
- Fill rate by geo
- A/B test results
- Fraud rate

### 10. Export Data

**Regular data exports for deeper analysis:**
```bash
# Daily revenue export
curl "https://api.apexmediation.ee/v1/analytics/revenue/export?period=1d" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  > revenue_$(date +%Y%m%d).csv

# Weekly A/B test export
curl "https://api.apexmediation.ee/v1/ab-tests/results/export?period=7d" \
  > ab_tests_$(date +%Y%m%d).xlsx
```

---

## API Reference

### Create A/B Test
```bash
POST /v1/ab-tests
```

### Get Test Results
```bash
GET /v1/ab-tests/{test_id}/results
```

### Track Custom Event
```bash
POST /v1/events
```

### Get Analytics
```bash
GET /v1/analytics?metrics=revenue,ecpm&period=30d
```

### Export Data
```bash
GET /v1/analytics/export?format=csv&period=30d
```

---

## Support

**Email:** support@apexmediation.ee
**Dashboard:** https://console.apexmediation.ee/analytics
**Documentation:** https://apexmediation.bel-consulting.ee/docs/analytics

**Response Times:**
- Analytics questions: <24 hours
- Custom dashboard requests: <3 days
- Feature requests: <7 days
