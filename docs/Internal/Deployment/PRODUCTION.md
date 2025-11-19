# Production Readiness & "Game Day" Checklist

_Last updated: 2025-11-19_

## Purpose
This document outlines the final granular steps required to move the Ad-Project from **Feature Complete (Release Candidate)** to **Production Live**. It focuses specifically on closing the gap between the current 4-network support and the required 15-network mediation capability, ensuring SDK resilience, and validating the full revenue loop.

## 1. Network Expansion (Critical Path)
**Goal:** Expand mediation from 4 networks (AdMob, AppLovin, Unity, IronSource) to the full 15-network suite.

### Backend Configuration (`backend/src/services/openrtbEngine.ts`)
- [ ] **Define Adapter Configs:** Add entries to the `ADAPTERS` array for the following. Ensure correct endpoints and seat IDs are used.
    - [ ] Vungle (`vungle`)
    - [ ] Chartboost (`chartboost`)
    - [ ] Pangle (`pangle`)
    - [ ] Mintegral (`mintegral`)
    - [ ] AdColony (`adcolony`)
    - [ ] Tapjoy (`tapjoy`)
    - [ ] InMobi (`inmobi`)
    - [ ] Fyber (`fyber`)
    - [ ] Smaato (`smaato`)
    - [ ] Amazon Publisher Services (`amazon`)
    - [ ] Meta Audience Network (`facebook`) - *Verify existing implementation*

### Mobile SDK Adapters (`sdk/adapters/`)
**Goal:** Create standardized adapter packages that bridge the native network SDKs to our Core SDK interface.
- [ ] **Android Adapters (Kotlin)**
    - [ ] Implement `VungleAdapter.kt`
    - [ ] Implement `ChartboostAdapter.kt`
    - [ ] Implement `PangleAdapter.kt`
    - [ ] Implement `MintegralAdapter.kt`
    - [ ] Implement `AdColonyAdapter.kt`
    - [ ] Implement `TapjoyAdapter.kt`
    - [ ] Implement `InMobiAdapter.kt`
    - [ ] Implement `FyberAdapter.kt`
    - [ ] Implement `SmaatoAdapter.kt`
    - [ ] Implement `AmazonAdapter.kt`
- [ ] **iOS Adapters (Swift)**
    - [ ] Implement `VungleAdapter.swift`
    - [ ] Implement `ChartboostAdapter.swift`
    - [ ] Implement `PangleAdapter.swift`
    - [ ] Implement `MintegralAdapter.swift`
    - [ ] Implement `AdColonyAdapter.swift`
    - [ ] Implement `TapjoyAdapter.swift`
    - [ ] Implement `InMobiAdapter.swift`
    - [ ] Implement `FyberAdapter.swift`
    - [ ] Implement `SmaatoAdapter.swift`
    - [ ] Implement `AmazonAdapter.swift`

### Waterfall Logic (`backend/src/services/waterfallService.ts`)
- [ ] **Priority Logic:** Update `executeWithWaterfall` to handle 15 layers of fallback without timing out the client.
- [ ] **Latency Tuning:** Verify `maxRetryDelay` and `backoffMultiplier` are aggressive enough to try at least 5 networks within a 2-second ad load timeout.

## 2. SDK Readiness & Unity Bridge
**Goal:** Ensure the Unity SDK is not just a wrapper but a functional bridge for game developers.

### Unity SDK (`sdk/core/unity/`)
- [ ] **C# Bridge:** Implement `AdProjectBridge.cs` to call Android/iOS native methods via `AndroidJavaObject` and `[DllImport(__Internal)]`.
- [ ] **Editor Scripts:** Ensure `PostProcessBuild` scripts correctly add required dependencies (Gradle/CocoaPods) for all 15 networks to the generated project.
- [ ] **Smoke Test:** Build a "Hello World" Unity game, import the package, and verify logs on a real Android device.

### CTV SDK (`sdk/ctv/`)
- [ ] **Device Type:** Verify `sdk/ctv/android-tv` sends `device_type=3` (Connected TV) in bid requests.
- [ ] **Focus Handling:** Ensure ad views handle D-Pad navigation correctly on Android TV / tvOS.

## 3. Infrastructure & Secrets
**Goal:** Move from "Default Secure" to "Production Secure".

### CI/CD & Deployment
- [ ] **Secret Injection:** Configure GitHub Actions / Fly.io secrets to override the defaults in `docker-compose.yml`.
    - [ ] `JWT_SECRET` (Generate a strong random string)
    - [ ] `COOKIE_SECRET`
    - [ ] `DATABASE_URL` (Production RDS/Postgres)
    - [ ] `CLICKHOUSE_URL` (Production ClickHouse)
    - [ ] `REDIS_URL`
- [ ] **Env Vars:** Ensure `NEXT_PUBLIC_USE_MOCK_API=false` is set in the production build environment for Console and Website.

## 4. End-to-End "Game Day" Validation
**Goal:** Validate the full loop from Impression -> Revenue -> Payout.

### Setup
- [ ] **Clean Slate:** Wipe local DBs (`docker-compose down -v`) and start fresh (`docker-compose up --build`).
- [ ] **Configuration:** Enable all 15 networks in the local backend config (mocking the S2S endpoints if necessary using WireMock).

### Execution Steps
1.  **Onboarding:**
    - [ ] Register a new Publisher account in Console.
    - [ ] Verify email (check logs for 2FA/Magic Link).
    - [ ] Create an App and a Placement.
2.  **Integration:**
    - [ ] Initialize Web SDK with the new Placement ID.
    - [ ] Trigger an Ad Request.
3.  **Mediation:**
    - [ ] Verify Backend logs show S2S requests to configured adapters.
    - [ ] Verify `waterfallService` engages if S2S fails.
4.  **Transparency:**
    - [ ] Go to Console > Transparency > Auctions.
    - [ ] Find the auction ID.
    - [ ] Click "Verify" and ensure the cryptographic signature validates.
5.  **Billing & Revenue:**
    - [ ] Generate 1,000 fake impressions via script (simulating high traffic).
    - [ ] Wait for `UsageMeteringService` aggregation window (or trigger manually).
    - [ ] Go to Console > Billing.
    - [ ] Verify "Current Usage" reflects the impressions.
    - [ ] Verify "Estimated Revenue" matches the tier logic in `revenueShareService.ts`.
6.  **Payout:**
    - [ ] Go to Console > Settings > Payouts.
    - [ ] Add a mock payout method.
    - [ ] Trigger an invoice generation.
    - [ ] Download PDF and verify line items.

## 5. Final Sign-Off
- [ ] **Load Test:** Run `k6 run quality/load-tests/auction-load-test.js` against the local stack to ensure 15-network waterfall doesn't spike CPU.
- [ ] **Security Scan:** Run `npm audit` and check for critical vulnerabilities in dependencies.
- [ ] **Legal:** Verify Cookie Consent banner on Website correctly blocks SDK initialization until accepted.
