Android BYO Mediation SDK Fixes & Enhancements:

P0 (BYO must-fix before a credible MVP)
1) BYO operating mode (feature flags + defaults)

What to change

Add SdkMode = BYO | HYBRID | MANAGED (default BYO).

When BYO:

Disable S2S auction unless all enabled networks are S2S-capable and the publisher provided those S2S creds.

Prefer native vendor SDK adapters (AdMob/AppLovin/ironSource/Unity/Vungle/Chartboost/Pangle/Fyber/Meta/Mintegral/Tapjoy/Amazon) for load/show.

Keep S2S codepaths compiled, just inactive (config kill-switch).

Acceptance

Fresh install with no creds → only “mock test network” visible; S2S path not called.

Enabling a vendor adapter with keys immediately routes loads through that vendor’s SDK; S2S headers aren’t sent.

2) Credentials: zero-trust handling for per-publisher keys

What to change

Do not embed network keys in your SDK; consume them from host app via:

AdapterConfigProvider callback (runtime injection), or

Encrypted local store populated by your console via short-lived token exchange.

Mask/redact in logs; never send keys to your servers in BYO mode.

Support multi-account per app (e.g., per-title credentials differ per network).

Acceptance

Turning on verbose telemetry shows network names but never secrets.

Rotation: swapping keys at runtime (safe restart) doesn’t crash; old sessions close.

3) Adapter parity & conformance (client SDKs are first-class)

What to change

Implement adapters using official vendor SDKs for render & paid events (no WebView/DIY renderer in prod).

Per-adapter timeouts, one retry w/ jitter, circuit breaker, and standardized taxonomy (timeout, no_fill, network_error, status_4xx, status_5xx, below_floor, error).

Parallel load + partial aggregation within a global auction deadline (even in BYO you still “mediate” who wins).

Acceptance

For each adapter: offline conformance tests (success, no_fill, timeout, 4xx no-retry, 5xx retry→success, circuit-open) + sandbox smoke run.

4) Consent/Privacy propagation (BYO correctness = revenue)

What to change

Normalize & forward TCF v2, US GPP, COPPA, LAT/ATT to each adapter (and to S2S only when enabled).

Provide both:

Explicit setter API (setConsent(...)) and

Optional auto-read mode (TCF/GPP keys from SharedPreferences) behind a flag.

Acceptance

Matrix tests (GDPR on/off × ATT × COPPA) prove presence/absence of IDs and consent strings in each adapter call.

5) OMSDK/OMID viewability (required even in BYO)

What to change

Replace No-Op OM controller with real OMID integration around vendor views (display/video sessions, verification scripts).

Feature-flag if needed, but default ON when vendor supports it.

Acceptance

Verification partners see sessions; no crashes when OMID missing; proguard keeps added.

6) Show lifecycle, caching & single-use guarantees

What to change

Cache RenderableAd objects (not plain DTOs) with TTL; enforce single show, double-callback guard, and safe cancel on Activity destroy.

Rewarded: grant once only; Banner: refresh honors foreground/visibility.

Acceptance

Tests: double show() rejected; expired never shows; lifecycle rotation clean (LeakCanary/CI).

P1 (BYO should-fix soon)
7) “Credential Wizard” & validation flows (DX killer)

SDK: optional ValidationMode that pings vendor SDK init with dummy placement to pre-flight credentials (no ad request).

Console (later): guided checklist per network (what IDs are needed; where to paste).

Acceptance

A failed credential never crashes load; SDK surfaces a normalized, actionable error.

8) app-ads.txt / sellers.json inspector

Even in BYO, help the publisher: warn if required app-ads.txt lines for an enabled vendor are missing/mis-typed.

Acceptance

Inspector returns vendor-by-vendor pass/fail + suggested lines; SDK can show a developer-only warning banner.

9) Observability for BYO (privacy-clean)

p50/p95/p99 per adapter, error/fill, timeouts, selection logs.

No revenue import by default (publisher is paid by networks); if they connect a network reporting API, mark those numbers as “self-reported.”

Acceptance

“Mediation Debugger” shows sanitized per-request traces; secrets masked; opt-in revenue connectors separated.

10) Size, threading, transport hardening

Core AAR budget (<500KB); StrictMode gates in debug; TLS pinning to config/auction endpoints (when auction used).

Acceptance

CI fails >500KB; no main-thread I/O (Robolectric StrictMode tests).

P2 (BYO niceties that win deals)

Config-as-Code export/import for placements & waterfalls (JSON with schema + signature).

Cryptographic transparency (tamper-evident selection logs): hash each decision, chain via Merkle root; publish root daily.

Migration Studio (BYO edition): reads Unity/MAX/ironSource placements & builds equivalent config; dry-run to validate unit IDs.

What to de-prioritize now (until Managed Demand later)

Payment rails, ledger, take-rate logic, creative CDN, and exchange/DSP features. Keep the interfaces designed but don’t ship the modules.

S2S auction across third-party demand unless a publisher configures S2S creds for those partners. BYO = client SDKs first.

Designing the seam for Managed Demand later (without breaking BYO)

Add abstractions now so it’s drop-in later:

DemandSource interface with two families:

ExternalNetworkAdapter (BYO—what you have now).

ManagedLineItem (future)—served through your exchange/SSP or direct IO.

SelectionEngine consumes both but respects SdkMode:

In BYO: ignore ManagedLineItem.

In HYBRID/MANAGED: include managed bids, still log full landscape with cryptographic proofs.

Keep SDK public API stable (no API churn): adding managed demand is purely a server/config change + new adapter module; host apps don’t re-integrate.

Acceptance for seam

Build compiles and passes tests with ManagedDemand module omitted.

Enabling the module in a dev build adds a new “demand source” without touching existing adapter code paths.

Concrete code tweaks (surgical)

Mode gate

enum class SdkMode { BYO, HYBRID, MANAGED }

data class SDKConfig(..., val mode: SdkMode = SdkMode.BYO, ...)

private fun shouldUseS2S(): Boolean {
  if (config.mode != SdkMode.BYO) return true
  return configManager.enabledNetworks().all { it.supportsS2S && hasS2SCreds(it) }
}


Credential provider

interface AdapterConfigProvider {
  fun getConfig(network: String): Map<String, Any?> // never persist to your servers in BYO
}
MediationSDK.Builder().adapterConfigProvider(appProvidedProvider)


Secret redaction

Redactor.registerKeyPatterns(
  "api_key", "access_key", "account_id", "placement_id", "app_token"
)


Consent propagation

data class ConsentOptions(...)

adapter.initialize(context, AdapterInitParams(consent = consentOptions))
adapter.loadAd(placement, adType, settings + consentOptions.asAdapterMap())

BYO-mode Acceptance Criteria (ship-gate)

Reliability: Crash-free ≥99.9% attributable to SDK; ANR contribution ≤0.02%.

Formats: Interstitial (load+show+single-use), Rewarded (single grant), Banner (refresh/visibility).

Adapters: ≥8 production adapters via vendor SDKs; each passes conformance + sandbox smoke.

Consent/Privacy: Full matrix propagation; optional auto-read; no secrets/PII in telemetry.

Viewability: OMSDK sessions around displays; verification tags OK.

DX: Credential Wizard, Migration Studio (BYO), app-ads.txt inspector; Mediation Debugger with sanitized traces.

Security/Footprint: TLS pinning (config/auction when used), signature-verified config, core AAR <500KB.

What “great” looks like for BYO

A publisher drops in your SDK, pastes network keys, toggles networks on, and ships in a day.

They get clean, privacy-safe metrics, cryptographically provable selection logs, and no ANR pain.

When you add Managed Demand next year, you flip a config and new demand joins the auction—no SDK churn.




### Unity SDK parity with Android (all above features):

P0 — Must-add for a BYO Unity SDK
1) Package structure & asmdefs

Add:

Runtime/

ApexMediation.cs (public C# facade)

Adapters/ (marker interfaces & constants only; no vendor code here)

Consent/ConsentManager.cs (explicit setters + optional auto-read)

Internal/UnityMainThread.cs (dispatcher), Internal/Logger.cs

Platforms/Android/ (JNI bridge)

Platforms/iOS/ (P/Invoke bridge)

Runtime/ApexMediation.asmdef (no Editor references; allow unsafe: off; platform constraints set)

Editor/ApexMediation.Editor.asmdef (Editor-only)

Why: Proper asmdef isolation ensures small footprint and clean platform splits.

Acceptance: Package imports in Unity 2020.3+; runtime compiles for Android+iOS; Editor compiles in Edit mode without runtime references.

2) Public C# API (BYO-first)

C# facade (thin mirror of your Android/iOS APIs):

Initialize(appId, ApexConfig config)

SetConsent(gdprApplies?, tcf?, gpp?, usPrivacy?, coppa?, attStatus?, limitAdTracking?)

SetNetworkConfig(string network, IDictionary<string, object> creds) (BYO: no secrets sent to your servers)

LoadInterstitial(placement) / ShowInterstitial

LoadRewarded(placement) / ShowRewarded (single grant)

LoadBanner(placement, size) / AttachBanner(GameObject host) / DestroyBanner()

IsAdReady(placement)

Shutdown()

Events: OnAdLoaded, OnAdFailed, OnAdShown, OnAdClicked, OnAdClosed, OnPaidEvent (standardized payload)

Acceptance: Sample scene uses only the C# facade; no platform-specific code in game scripts.

3) Android bridge (JNI) & iOS bridge (P/Invoke)

Android:

AndroidJavaClass("com.apex.mediation.MediationSDK")

Marshal strings, maps, and callbacks; ensure main thread for UI calls.

iOS:

[DllImport("__Internal")] externs to Swift/Obj-C shims (ApexMediationInitialize, ApexMediationLoadInterstitial, …).

Acceptance: Load/show runs on device for both platforms; IL2CPP builds succeed; no missing symbol errors.

4) IL2CPP/AOT-safe callback design

Use a single C# event pump; register native callbacks once; route by requestId.

Avoid generic delegates crossing the boundary. Keep signatures blittable where possible; pass JSON for complex payloads.

Acceptance: No ExecutionEngineException/AOT crashes under IL2CPP; rapid load/show cycles stable.

5) Main-thread dispatcher & lifecycle

UnityMainThread.Dispatch(Action) using Update() or PlayerLoopSystem.

Handle OnApplicationPause/Resume → forward to native SDKs (pause timers, mute audio as required by networks).

Acceptance: No UI calls from background threads; background I/O only; StrictMode issues are Android-side only.

6) Consent & privacy propagation (BYO correctness)

Explicit setters + optional auto-read of IAB strings (PlayerPrefs → Android SharedPrefs keys; iOS NSUserDefaults keys) behind a flag.

If publisher disables auto-read, only use explicit setters.

Acceptance: Matrix tests (GDPR × ATT × COPPA) verify correct presence/absence of IDs & consent strings reaching native SDKs.

7) OMSDK / viewability (required in BYO)

Unity shows platform views differently:

Interstitial/Rewarded: rely on native SDKs; OMID sessions are handled natively (your Android/iOS cores).

Banner: ensure the native view is correctly layered/attached (Android View over UnityPlayerActivity; iOS UIView over UnityAppController).

Provide a BannerHost MonoBehaviour to manage attach/detach & safe area.

Acceptance: Verification scripts run; no z-ordering issues; rotation/resize safe.

8) Sample scenes & test harness

Samples~/** with:

Interstitial demo, Rewarded demo, Banner demo

A “Mediation Debugger” scene that shows last N traces (sanitized) pulled from native telemetry snapshot.

Include mock adapters (no network) for CI.

Acceptance: QA can validate end-to-end without real creds; docs point to sample scenes.

9) BYO credential handling (zero-trust)

Provide an Editor UI to paste per-network creds into Project Settings, saved locally (e.g., encrypted on disk or flagged “do not commit”).

At runtime, inject via SetNetworkConfig or a generated ScriptableObject; never upload keys to your servers in BYO.

Acceptance: Logs show network names only; secrets are masked (****…); builds contain no plaintext secrets (scan in CI).

10) Footprint & platform import settings

Keep Runtime free of vendor SDKs; vendors remain in customer projects.

Provide import rules:

Android: .aar in customer project; set Any Platform with Android only enabled.

iOS: .framework/.a set for iOS only; add -ObjC linker flags guidance if needed.

Acceptance: Your package adds <100KB to app size; vendor SDK inclusion is publisher-controlled.

P1 — Should-add soon (BYO polish)

Editor tools:

“Credential Wizard” per network (what IDs, where to get them, validation ping using vendor SDK init).

“app-ads.txt Inspector” with per-network required lines.

“Migration Studio (Unity)”—import Unity Ads/MAX/ironSource JSON and produce equivalent Apex config (local only).

Mediation Debugger (Unity HUD): toggle overlay with last 50 loads (placement, adapter, outcome, latency), sanitized.

A11y & console UX: clean Editor UI with search, copy-safe redaction, warnings for mis-configs.

P2 — Nice-to-have

Config-as-Code for Unity: export/import placements as JSON; sign/verify locally.

Cryptographic transparency: show proof IDs returned from native (Merkle root per day); deep-link to your status page when you add it.

Automated size/test gates: CI job that builds a test Unity project (Android+iOS) and enforces size/time budgets.

What to avoid now (until Managed Demand)

No payment rails/ledger in Unity package.

No exchange/DSP logic in Unity runtime.

No auto-collect of revenue from networks (unless customer adds their own connectors in your console—still recommended to keep Unity package free of that).

Acceptance checklist (Unity BYO package)

Init & consent: Works on device; consent matrix verified; no secret leakage.

Load/Show: Interstitial, Rewarded, Banner with single-use/TTL guarantees; callbacks main-thread and deterministic; rotation safe.

Adapters: Vendor SDK render paths (no WebView placeholder).

OMID: Sessions present via native; no crashes if OMID missing.

Bridges: JNI & P/Invoke robust; IL2CPP builds pass; AOT safe.

DX: Editor panels for creds, inspector, debugger; Samples functional.

Footprint: Runtime package small (<100KB); vendor SDK inclusion controlled by publisher.

Privacy: Telemetry sanitized; BYO secrets never leave device; no S2S by default.


### iOS BYO Mediation SDK Fixes & Enhancements:

P0 fixes & additions (ship these first)
1) Concurrency & main-thread discipline

Issue: @MainActor on the entire MediationSDK makes all calls hop to main; async awaits will return to main, risking jank.

Action:

Remove class-level @MainActor. Use:

Background actors / Task.detached for config fetch, auction, adapter loads, telemetry flushes.

MainActor.run only for: view presentation, event callbacks to the app, and UI state updates.

Acceptance:

Instruments shows no >16ms blocks on main during load/show.

Unit test that loadAd performs network/disk work off main (assert Thread.isMainThread == false in injected hooks).

2) Deadline-driven adapter orchestration (BYO correctness)

Add:

Per-placement timeout budget (e.g., 600–1200ms) and per-adapter timeouts (e.g., 120–200ms).

Hedged requests (launch a backup at p95) and partial aggregation (don’t stall the whole placement on one slow adapter).

Normalized NoBid taxonomy: no_fill, timeout, network_error, status_4xx, status_5xx, below_floor, error.

CircuitBreaker on each adapter path; protect load calls.

Acceptance:

p99 load never exceeds placement timeout due to one slow adapter.

Offline conformance tests exercise 204 no_fill, 5xx retry→success, bad JSON→error, CB open/half-open transitions.

3) Consent propagation & ATT helper

Add:

Read/write IAB TCF v2 keys (IABTCF_*) and US GPP from UserDefaults behind an opt-in autoReadIAB = true.

Public setConsent(…) remains the source of truth when provided.

Provide a small ATT bridge helper: return ATTrackingManager.trackingAuthorizationStatus (don’t prompt automatically).

Acceptance:

Matrix tests (GDPR×ATT×COPPA×LMT) show expected presence/absence of IDFA and correct strings in outbound metadata.

Telemetry never contains raw identifiers when consent forbids.

4) BYO credential isolation & redaction

Action:

Ensure AdapterRegistry.initializeAdapter(config:) consumes only publisher-provided keys; never send keys to your servers.

Telemetry: hard-mask any field named like key, token, secret, signature, etc. (both keys and values).

Acceptance:

Static scan confirms no credential strings leave the device.

Debug panel shows masked values only.

5) Banner & interstitial presentation safety

Add:

A presentation coordinator that finds the topmost UIViewController safely, handles rotation, modal stacks, and safe-area insets for banners.

Single-grant logic for rewarded; prevent double callbacks.

Acceptance:

Rotation/resizing tests; multiple rapid load/show cycles; no view orphaning or layout leaks.

Rewarded callback fires exactly once.

6) Open Measurement (OM SDK) stance

BYO best-practice: if vendors render their own views, they attach OMID sessions (good). If you ever render server-mediated HTML (OpenRTB markup) inside your own web view, integrate OM SDK and manage sessions.

Acceptance:

If you render your own creatives: OMID integrated & verified with a cert partner.

If all renders are vendor SDKs: document that OMID is vendor-managed.

7) Offline conformance tests (no real network)

Add:

URLProtocol mocks for AuctionClient and adapters; golden fixtures for success/no-fill/4xx/5xx/malformed.

Latency injection and timeout tests.

Acceptance:

CI runs the matrix green; taxonomy mapping conforms across all branches.

8) Size & performance budgets

Budgets:

SDK binary: < 500 KB added to app (excluding vendor SDKs).

p95 load: ≤ 300 ms (cached) / ≤ 800 ms (network).

Acceptance:

CI job that archives a tiny host app, diffs size, and fails on regressions.

XCTest perf targets for p95.

P1 polish (soon after)

Hedged auctions vs S2S: your AuctionClient is good; default client API key empty (server-auth only), enable publisher override when needed.

Ad cache with TTL: add a small in-memory cache per placement with expiry to support isAdReady.

Paid event normalization: surface standardized OnPaidEvent(currency, precision, micros).

Debug Panel: show last N sanitized traces (placement, adapter, outcome, latency).

P2 nice-to-have

Config-as-Code export/import for placements (JSON) signed locally; helps large studios.

“Cryptographic transparency” hooks: include per-auction proof IDs when you enable them server-side (doesn’t change BYO runtime).

Sample apps: minimal SwiftUI demo with interstitial/rewarded/banner, plus test toggles.

Specific code-level nits (quick wins)

Narrow @MainActor: keep it on UI-facing methods only (e.g., show*), not the whole class.

TelemetryCollector: confirm it runs on a background queue; enforce max batch size & interval; add jitter to avoid thundering herds.

AuctionClient: ensure timeoutIntervalForRequest matches placement budget; map 429→status_429, >=500→status_5xx, 204→no_fill (you already do most of this).

ConsentManager: implement autoReadIAB gated reads and explicit setters overriding auto-read.

AdapterRegistry: assert supportsAdType before calling load; wrap calls in CB; normalize errors to taxonomy.

Redaction: centralize in a small TelemetrySanitizer and call it on every event.

BYO contract (publisher-facing)

Publisher brings: network accounts, app/site registration, placements, network SDKs (optional but typical), credentials configured in app (or via your console → device injection only).

You provide: orchestration, reliability (timeouts/hedges/CB), unified callbacks/metrics, consent plumbing, optional S2S control plane (no secrets), and a debugger.

Acceptance checklist (iOS BYO readiness)

Init/consent OK on device; matrix tests pass.

Load/Show for interstitial, rewarded, banner; single-grant; rotation safe.

Deadline & hedging enforced; p99 under budget; CB prevents cascades.

Credentials never leave device; telemetry redacted; logs sanitized.

Offline test suite green; size/perf budgets held.

No OMID needed unless you render your own creatives.