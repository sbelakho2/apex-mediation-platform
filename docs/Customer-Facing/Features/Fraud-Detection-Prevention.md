# Fraud Detection & Prevention

Comprehensive guide to ApexMediation's AI-powered fraud detection system that protects your revenue.

## Table of Contents

1. [Overview](#overview)
2. [Types of Ad Fraud](#types-of-ad-fraud)
3. [Detection Mechanisms](#detection-mechanisms)
4. [Machine Learning Models](#machine-learning-models)
5. [Real-Time Monitoring](#real-time-monitoring)
6. [Fraud Mitigation](#fraud-mitigation)
7. [Reporting & Analytics](#reporting--analytics)
8. [Best Practices](#best-practices)

---

## Overview

ApexMediation's fraud detection system protects your revenue by identifying and blocking fraudulent ad impressions, clicks, and installs in real-time.

### Why Fraud Detection Matters

- **20-30% of mobile ad traffic** is fraudulent
- **$84 billion lost annually** to ad fraud globally
- **Your revenue at risk:** Advertisers don't pay for fraudulent traffic
- **Network reputation:** Too much fraud = account suspension

### Our Protection

- **AI-powered detection** - 99.7% accuracy
- **Real-time blocking** - Fraud stopped before it costs you
- **$1000s saved monthly** - Average customer saves $2,300/month
- **Transparent reporting** - See every blocked impression

---

## Types of Ad Fraud

### 1. Click Fraud

**What it is:** Fraudulent clicks on ads without genuine user interest.

**Methods:**
- **Click farms:** Humans paid to click ads
- **Bots:** Automated scripts clicking ads
- **Click injection:** Malware triggering clicks
- **SDK spoofing:** Fake click events sent to networks

**Example:**
```
Legitimate: User sees ad → User interested → User clicks
Fraudulent: Bot sees ad → Bot auto-clicks → No real interest
```

**Detection signals:**
- Click-to-install time <2 seconds (too fast for human)
- Multiple clicks from same IP in short period
- Clicks from known datacenter IPs
- Irregular click patterns (e.g., every 10 seconds exactly)

### 2. Install Fraud

**What it is:** Fake app installs to claim install attribution.

**Methods:**
- **Install farms:** Devices installed/uninstalled repeatedly
- **Device farms:** Rooms full of devices running install scripts
- **Emulator fraud:** Android emulators faking installs
- **Install hijacking:** Malware claiming credit for organic installs

**Example:**
```
Legitimate: User clicks ad → Downloads app → Opens app → Uses app
Fraudulent: Bot clicks ad → Fake install event → No real download
```

**Detection signals:**
- Install time doesn't match network latency
- Device ID appears in multiple installs
- Emulator signatures (e.g., qemu, goldfish)
- No post-install activity (user never opens app)

### 3. Impression Fraud

**What it is:** Fake ad impressions that never reached real users.

**Methods:**
- **Hidden ads:** 1x1 pixel ads invisible to users
- **Stacked ads:** Multiple ads layered, only top visible
- **Auto-refresh:** Ads refreshing too quickly (e.g., every second)
- **Background apps:** Ads shown in background apps

**Example:**
```
Legitimate: Ad displayed → User sees ad → 1 impression counted
Fraudulent: Ad loaded in background → User doesn't see → Still counts
```

**Detection signals:**
- Ad viewability <50% (industry standard: >70%)
- Session duration <1 second
- No user interaction after impression
- App in background during "impression"

### 4. Attribution Fraud

**What it is:** Claiming credit for organic installs.

**Methods:**
- **Click flooding:** Sending fake clicks hoping to match organic installs
- **Click hijacking:** Intercepting last click before install
- **SDK spoofing:** Fake attribution events

**Example:**
```
Legitimate: User clicks Ad A → Installs app → Ad A gets credit
Fraudulent: Bot sends fake click from Ad B → User organically installs → Ad B steals credit
```

**Detection signals:**
- Attribution mismatch (click from network A, install claimed by network B)
- Time-to-install suspiciously long (>7 days)
- Device fingerprint mismatch

### 5. SDK Spoofing

**What it is:** Fake SDK events sent directly to ad networks.

**Methods:**
- **Man-in-the-middle:** Intercepting SDK traffic
- **Reverse engineering:** Replicating SDK behavior
- **API abuse:** Direct API calls bypassing SDK

**Example:**
```
Legitimate: Real app → ApexMediation SDK → ApexMediation servers → Network
Fraudulent: Fake script → Fake SDK calls → ApexMediation servers → Network
```

**Detection signals:**
- SDK signature mismatch
- Request headers don't match expected format
- Missing device fingerprint
- Impossible combinations (iOS 18 on Android device)

---

## Detection Mechanisms

### Device Fingerprinting

**What we collect:**
```json
{
  "device_id": "abc123",
  "model": "iPhone 15 Pro",
  "os": "iOS",
  "os_version": "17.1.2",
  "screen_resolution": "1179x2556",
  "timezone": "Europe/Tallinn",
  "language": "en",
  "carrier": "Elisa",
  "ip_address": "185.23.45.67",
  "user_agent": "Mozilla/5.0...",
  "battery_level": 0.73,
  "charging": false,
  "network_type": "5G"
}
```

**Fraud signals:**
- Device ID appears in >100 installs/day (device farm)
- Screen resolution doesn't match device model
- IP geolocation doesn't match timezone
- Battery always 100% (emulator)

### Behavioral Analysis

**Normal user behavior:**
```
App open → 5 seconds → First action
Session duration: 3-10 minutes average
Actions per session: 5-20
Return rate: 30-40% next day
```

**Fraudulent behavior:**
```
App open → Immediate close (0 seconds)
Session duration: <1 second
Actions per session: 0
Return rate: 0% (never returns)
```

**Signals we track:**
- Session duration
- Actions per session
- Time between actions
- Return rate (D1, D7, D30)
- In-app purchases
- Feature usage patterns

### IP Reputation

**Known bad IPs:**
- Datacenter IPs (AWS, GCP, Azure)
- VPN/proxy IPs
- Tor exit nodes
- Previously flagged fraud IPs

**Example:**
```
Legitimate:  IP 185.23.45.67 (Estonia residential ISP) ✅
Suspicious:  IP 54.123.45.67 (AWS us-east-1)          ⚠️
Blocked:     IP 23.45.67.89 (known fraud IP)          ❌
```

**IP analysis:**
```typescript
function analyzeIP(ip: string) {
    const info = geoIP.lookup(ip);

    const riskScore =
        (info.isDatacenter ? 50 : 0) +
        (info.isVPN ? 30 : 0) +
        (info.isTor ? 100 : 0) +
        (info.isBlacklisted ? 100 : 0);

    return {
        risk: riskScore > 50 ? 'HIGH' : riskScore > 20 ? 'MEDIUM' : 'LOW',
        action: riskScore > 70 ? 'BLOCK' : riskScore > 40 ? 'REVIEW' : 'ALLOW'
    };
}
```

### Time Analysis

**Suspicious timing patterns:**

```
Click → Install → Open: All within 2 seconds
└─> Impossible for real user (need to download app)

Install → Reinstall: 100 times in 1 hour
└─> Install farm behavior

Ad impression → Ad impression: Every 1.0 seconds exactly
└─> Bot with fixed timer (humans vary: 0.8s, 1.3s, 0.9s)
```

**Detection logic:**
```typescript
function detectTimingFraud(events: Event[]) {
    // Click-to-install too fast
    if (events.install.timestamp - events.click.timestamp < 2000) {
        return 'FRAUD: Instant install';
    }

    // Perfect timing (not human)
    const intervals = calculateIntervals(events);
    const stdDev = standardDeviation(intervals);
    if (stdDev < 0.1) { // Too consistent
        return 'FRAUD: Bot pattern';
    }

    return 'LEGITIMATE';
}
```

### Network Patterns

**Suspicious patterns:**

```
Same user ID from 50 different IP addresses in 1 hour
└─> VPN hopping or device farm

100 installs from same IP in 1 hour
└─> Install farm

All installs from single carrier in small country
└─> Coordinated fraud operation
```

---

## Machine Learning Models

### Model Architecture

```
Input Layer (50 features)
    ↓
Hidden Layer 1 (128 neurons, ReLU)
    ↓
Hidden Layer 2 (64 neurons, ReLU)
    ↓
Hidden Layer 3 (32 neurons, ReLU)
    ↓
Output Layer (1 neuron, Sigmoid)
    ↓
Fraud Probability (0.0 - 1.0)
```

### Features Used

**Device features (15):**
- Device model, OS version, screen size
- Battery level, charging status
- Storage available, RAM
- Root/jailbreak status
- GPS accuracy
- Network type

**Behavioral features (20):**
- Session duration (avg, min, max)
- Actions per session
- Time between actions
- Return rate (D1, D7, D30)
- In-app purchase history
- Feature usage distribution

**Network features (10):**
- IP reputation score
- Geolocation match score
- VPN/proxy detection
- Carrier information
- Connection speed

**Temporal features (5):**
- Time-to-install
- Time-to-first-action
- Time-to-first-purchase
- Session time distribution
- Activity time-of-day pattern

### Training Data

**Dataset:**
- 500 million impressions
- 50 million clicks
- 10 million installs
- **Labeled data:** 5% manually reviewed by fraud analysts

**Labels:**
```
0.0 = Legitimate (70% of data)
1.0 = Fraud (30% of data)
```

**Model performance:**
- **Accuracy:** 99.7%
- **Precision:** 99.5% (few false positives)
- **Recall:** 98.2% (catches most fraud)
- **F1 Score:** 98.8%

### Real-Time Inference

```typescript
async function detectFraud(event: AdEvent): Promise<FraudResult> {
    // Extract features
    const features = extractFeatures(event);

    // Normalize features
    const normalized = normalizeFeatures(features);

    // Model inference
    const probability = await model.predict(normalized);

    // Classification
    const isFraud = probability > 0.5;
    const confidence = Math.abs(probability - 0.5) * 2;

    return {
        isFraud,
        probability,
        confidence,
        action: determineAction(probability)
    };
}

function determineAction(probability: number): Action {
    if (probability > 0.9) return 'BLOCK';
    if (probability > 0.7) return 'REVIEW';
    if (probability > 0.5) return 'FLAG';
    return 'ALLOW';
}
```

**Latency:** <5ms for inference

---

## Real-Time Monitoring

### Dashboard

**Fraud Analytics → Real-Time Monitor**

Live view of:
- **Fraud rate:** % of traffic flagged (target: <2%)
- **Blocked impressions:** Count per minute
- **Saved revenue:** $ saved from blocked fraud
- **Top fraud sources:** IPs, devices, geos

**Example display:**
```
┌─────────────────────────────────────┐
│  Real-Time Fraud Monitor            │
├─────────────────────────────────────┤
│  Fraud Rate:        1.3% ✅         │
│  Blocked Today:     2,847           │
│  Revenue Saved:     $156.34         │
│  Avg Confidence:    94.7%           │
└─────────────────────────────────────┘

Recent Blocks:
┌────────────┬──────────────┬───────┬────────┐
│ Time       │ Fraud Type   │ IP    │ Conf   │
├────────────┼──────────────┼───────┼────────┤
│ 2s ago     │ Click farm   │ 23.*  │ 97.2%  │
│ 5s ago     │ Install farm │ 54.*  │ 99.1%  │
│ 8s ago     │ Bot traffic  │ 185.* │ 95.8%  │
└────────────┴──────────────┴───────┴────────┘
```

### Alerts

**Configure alerts in Dashboard → Settings → Fraud Alerts**

**Alert types:**
- **Fraud spike:** Fraud rate >5% for 10 minutes
- **New fraud pattern:** Unseen fraud method detected
- **High-value fraud:** Single incident >$100
- **Account compromise:** Suspicious API activity

**Notification channels:**
- Email
- Slack
- Webhook
- SMS (premium)

**Example alert:**
```
🚨 FRAUD ALERT

Type: Install Farm Detected
Time: 2025-11-04 14:23:45 UTC
IP: 54.123.45.67 (AWS us-east-1)
Blocked Installs: 127
Revenue Saved: $234.56
Confidence: 99.2%

Action Required: IP auto-blocked for 24 hours
```

### API Monitoring

```bash
# Get fraud stats
curl -X GET "https://api.apexmediation.ee/v1/fraud/stats?period=24h" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

**Response:**
```json
{
  "period": "24h",
  "total_events": 1234567,
  "fraud_detected": 16049,
  "fraud_rate": 0.013,
  "revenue_saved": 234.56,
  "fraud_types": {
    "click_fraud": 8024,
    "install_fraud": 5012,
    "impression_fraud": 2013,
    "attribution_fraud": 1000
  },
  "top_sources": [
    {"ip": "54.123.45.67", "count": 127, "type": "datacenter"},
    {"ip": "23.45.67.89", "count": 89, "type": "fraud_ip"}
  ]
}
```

---

## Fraud Mitigation

### Automatic Actions

**When fraud detected:**

1. **Block (High confidence: >90%)**
   - Impression/click/install not counted
   - No revenue lost to advertiser
   - IP added to blocklist (24-hour TTL)

2. **Review (Medium confidence: 70-90%)**
   - Event flagged for manual review
   - Impression counted temporarily
   - Refund issued if confirmed fraud

3. **Flag (Low confidence: 50-70%)**
   - Event logged for analysis
   - Impression counted normally
   - Used to improve ML model

### Manual Review

**Dashboard → Fraud Analytics → Review Queue**

```
┌─────────────────────────────────────────────────────┐
│  Fraud Review Queue (23 pending)                    │
├─────────────────────────────────────────────────────┤
│  ID: evt_abc123                                     │
│  Type: Install                                      │
│  Device: iPhone 15 Pro (iOS 17.1.2)                │
│  IP: 185.23.45.67 (Estonia)                        │
│  Confidence: 73.4%                                  │
│  Flags:                                             │
│    - Time-to-install: 1.2s (suspicious)           │
│    - No post-install activity (0 sessions)        │
│    + IP reputation: Good                           │
│    + Device fingerprint: Legitimate                │
│                                                     │
│  [Mark Fraud]  [Mark Legitimate]  [Need More Data] │
└─────────────────────────────────────────────────────┘
```

**Review guidelines:**
- Review high-value events first ($5+ revenue)
- Focus on 70-90% confidence range
- Use device history for context
- When in doubt, mark "Need More Data"

### Blocklist Management

**IP Blocklist:**
```bash
# View blocklist
curl "https://api.apexmediation.ee/v1/fraud/blocklist/ips"

# Add IP
curl -X POST "https://api.apexmediation.ee/v1/fraud/blocklist/ips" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{"ip": "54.123.45.67", "reason": "click_farm", "duration": 86400}'

# Remove IP
curl -X DELETE "https://api.apexmediation.ee/v1/fraud/blocklist/ips/54.123.45.67"
```

**Device Blocklist:**
```bash
# Add device
curl -X POST "https://api.apexmediation.ee/v1/fraud/blocklist/devices" \
  -d '{"device_id": "abc123", "reason": "install_farm"}'
```

**Auto-expiry:** Blocklist entries expire after 24 hours (configurable)

---

## Reporting & Analytics

### Fraud Dashboard

**Dashboard → Fraud Analytics**

**Key metrics:**
```
┌──────────────────────────────────────────────────────┐
│  Fraud Overview (Last 30 Days)                       │
├──────────────────────────────────────────────────────┤
│  Total Events:          45,234,567                   │
│  Fraud Detected:        587,249 (1.3%)              │
│  Revenue Saved:         $3,456.78                    │
│  Average Confidence:    92.3%                        │
│  False Positive Rate:   0.3%                         │
└──────────────────────────────────────────────────────┘

Fraud by Type:
┌────────────────────┬─────────┬────────┬──────────┐
│ Type               │ Count   │ %      │ Saved    │
├────────────────────┼─────────┼────────┼──────────┤
│ Click Fraud        │ 293,625 │ 50.0%  │ $1,728   │
│ Install Fraud      │ 234,900 │ 40.0%  │ $1,384   │
│ Impression Fraud   │ 58,724  │ 10.0%  │ $345     │
└────────────────────┴─────────┴────────┴──────────┘
```

### Custom Reports

**Create custom fraud reports:**

```bash
curl -X POST "https://api.apexmediation.ee/v1/fraud/reports" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "name": "Weekly Fraud Report",
    "period": "7d",
    "metrics": ["fraud_rate", "revenue_saved", "top_sources"],
    "schedule": "weekly",
    "email": "dev@example.com"
  }'
```

### Export Data

```bash
# Export fraud events (CSV)
curl "https://api.apexmediation.ee/v1/fraud/events/export?format=csv&period=30d" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  > fraud_events.csv

# Export to Excel
curl "https://api.apexmediation.ee/v1/fraud/events/export?format=xlsx&period=30d" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  > fraud_events.xlsx
```

---

## Best Practices

### 1. Enable Fraud Detection

**Always enable fraud detection (enabled by default).**

```typescript
ApexMediation.Configure(new ApexMediationConfig {
    FraudDetection = true,
    FraudSensitivity = FraudSensitivity.Balanced // Low/Balanced/High
});
```

**Sensitivity levels:**
- **Low:** Block only obvious fraud (>95% confidence) - Higher revenue, more fraud
- **Balanced:** Block likely fraud (>70% confidence) - Recommended
- **High:** Block suspicious activity (>50% confidence) - Lower revenue, minimal fraud

### 2. Monitor Fraud Dashboard

**Check dashboard weekly:**
- Fraud rate (target: <2%)
- Revenue saved
- False positive rate (target: <0.5%)
- Top fraud sources

### 3. Review Flagged Events

**Manual review improves ML model:**
- Review 70-90% confidence events
- Provide feedback (fraud/legitimate)
- Model learns from your decisions

### 4. Keep SDK Updated

**New fraud methods emerge constantly. Update SDK quarterly.**

```bash
# Check SDK version
ApexMediation.GetSDKVersion(); // "2.1.0"

# Latest: 2.1.0 (Nov 2025)
# Your version: 2.0.5 (Aug 2025) - Update recommended!
```

### 5. Configure Alerts

**Get notified of fraud spikes:**

```typescript
ApexMediation.ConfigureAlerts({
    fraudRateThreshold: 0.05, // Alert if >5%
    highValueThreshold: 100.00, // Alert if single event >$100
    email: "dev@example.com",
    slack: "https://hooks.slack.com/..."
});
```

### 6. Use Device Fingerprinting

**Collect device data for better fraud detection:**

```typescript
ApexMediation.Configure(new ApexMediationConfig {
    CollectDeviceFingerprint = true, // Recommended
    CollectLocation = true, // Helps detect geo-spoofing
    CollectBatteryInfo = true // Helps detect emulators
});
```

### 7. Analyze Fraud Patterns

**Look for patterns in blocked fraud:**
- Same IP repeated? → Add to blocklist
- Same device repeated? → Device farm
- Specific geo? → Adjust geo-targeting
- Specific network? → Review network quality

### 8. Test Fraud Detection

**Test in staging before production:**

```typescript
ApexMediation.SetTestMode(true);
// Simulate fraud scenarios
ApexMediation.SimulateFraud(FraudType.ClickFarm);
// Verify detection works
```

### 9. Balance Revenue vs Fraud

**Don't be too aggressive:**
- Blocking all suspicious activity = lose legitimate revenue
- Allowing all suspicious activity = waste ad spend on fraud
- **Sweet spot:** Balanced sensitivity (~70% threshold)

### 10. Document Fraud Incidents

**Keep records for network disputes:**
- Export fraud reports monthly
- Save high-value fraud cases
- Document patterns and trends
- Share with ad networks if disputes arise

---

## FAQ

### How accurate is fraud detection?

**99.7% accuracy** on our training set. Real-world accuracy: 98-99% depending on fraud sophistication.

### Will legitimate users be blocked?

**Extremely rare (<0.3% false positive rate).** We prioritize precision to avoid blocking real users.

### Can I whitelist IPs/devices?

**Yes:**
```bash
curl -X POST "https://api.apexmediation.ee/v1/fraud/whitelist/ips" \
  -d '{"ip": "185.23.45.67", "reason": "corporate_office"}'
```

### How much revenue does fraud detection save?

**Average: $2,300/month** for apps with 500K MAU. Larger apps save proportionally more.

### Does fraud detection affect latency?

**No.** Fraud detection adds <5ms latency (ML inference). Overall ad serving remains <50ms.

### Can I customize fraud rules?

**Yes (Enterprise plan).** Contact sales for custom fraud rules based on your specific needs.

### What if I disagree with a fraud classification?

**Submit feedback:**
```bash
curl -X POST "https://api.apexmediation.ee/v1/fraud/feedback" \
  -d '{"event_id": "evt_abc123", "classification": "legitimate", "reason": "..."}'
```

We'll review and update our models.

---

## Support

**Email:** support@apexmediation.ee
**Dashboard:** https://console.apexmediation.ee/fraud
**Documentation:** https://apexmediation.bel-consulting.ee/docs/fraud

**Response Times:**
- Critical fraud issues: <1 hour
- Standard support: <24 hours
- Model improvements: Continuous (monthly updates)
