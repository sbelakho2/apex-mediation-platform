0) Scope (what “done” means)

Adapters for: Moloco, ironSource (LevelPlay as demand), Vungle/Liftoff Monetize, Tapjoy, Smaato, Pangle, Mintegral, Fyber/FairBid, Meta Audience Network, Chartboost, AppLovin/MAX (as demand), Amazon Ads/APS/DTB, AdMob, AdColony.

Formats GA: Interstitial, Rewarded.
Formats Beta/Optional: Banner/MREC, App-Open.
CTV: Fullscreen video via native SDK when available; otherwise VAST fallback.

1) Common Adapter Contract (all networks)
1.1 Core interfaces (language-agnostic signatures)
interface AdNetworkAdapter {
  init(config: AdapterConfig, timeoutMs: int) -> InitResult
  loadInterstitial(placementId: string, meta: RequestMeta, timeoutMs: int) -> LoadResult
  showInterstitial(handle: AdHandle, viewContext: UIContext, cb: ShowCallbacks)

  loadRewarded(placementId: string, meta: RequestMeta, timeoutMs: int) -> LoadResult
  showRewarded(handle: AdHandle, viewContext: UIContext, cb: RewardedCallbacks)

  // Optional (Beta)
  loadBanner(placementId: string, size: AdSize, meta: RequestMeta, timeoutMs: int) -> LoadResult
  attachBanner(handle: AdHandle, bannerHost: UIViewHost, cb: BannerCallbacks)

  isAdReady(handle: AdHandle) -> bool
  expiresAt(handle: AdHandle) -> epoch_ms
  invalidate(handle: AdHandle)
}

Data contracts
AdapterConfig {
  partner: "moloco" | "ironsource" | ... ,
  credentials: { key: string, secret?: string, appId?: string, accountIds?: object },
  placements: { [placementAlias: string]: partnerPlacementId },
  privacy: ConsentStateDefaults,
  region?: "US" | "EU" | "APAC" | "CN" | "GLOBAL",
  options?: { startMuted?: bool, testMode?: bool, bidFloorMicros?: int64 }
}

RequestMeta {
  requestId: string,
  device: { os: string, osVersion: string, model: string },
  user: { ageRestricted: bool, consent: ConsentState },
  net: { ipPrefixed: string, uaNormalized: string, connType: "wifi"|"cell"|"other" },
  context: { orientation: "p"|"l", sessionDepth: int },
  auction: { floorsMicros?: int64, sChain?: string, sellersJsonOk?: bool }
}

LoadResult {
  handle: AdHandle,
  ttlMs: int,
  priceMicros?: int64,
  currency?: string,
  partnerMeta?: object
}

ShowCallbacks / RewardedCallbacks / BannerCallbacks {
  onImpression(...), onPaidEvent(valueMicros:int64, currency:string, precision:"publisher"|"estimated"),
  onClick(...), onClosed(reason:"completed"|"skipped"|"dismissed"), onError(code: ErrorCode, detail: string),
  // Rewarded only:
  onRewardVerified(rewardType: string, rewardAmount: number)
}

2) Runtime rules (uniform across adapters)
2.1 Threading & latency budgets

No network/disk on UI thread.

Timeouts: init ≤ 200 ms, load ≤ 120 ms (configurable), render attach ≤ 80 ms.

Use bounded background execution; cooperative cancellation on auction deadline.

2.2 Resiliency policy

Retry: one automatic retry on transient conditions (e.g., network/5xx/Retry-After), add 10–100 ms jitter.

Circuit breaker: open after 3 consecutive failures within 30 s per adapter×placement; half-open after 15 s.

Hedging: start a second load at rolling p95 latency; accept first success.

Partial aggregation: never block the auction; always honor global deadline.

2.3 Cache & lifetime

Each LoadResult carries ttlMs.

Single-use handles for interstitial/rewarded.

isAdReady must confirm freshness and creative readiness; invalidate must free resources deterministically.

3) Error & outcome taxonomy (normalized)

Adapter must map all vendor outcomes to:

NO_FILL           // 204 or vendor "no ad"
TIMEOUT           // request exceeded caller's timeout
NETWORK_ERROR     // DNS/TCP/TLS/5xx when no retries left
BELOW_FLOOR       // price < floor (if price returned)
ERROR             // invalid config, malformed payload, unsupported format
CIRCUIT_OPEN      // fast-fail due to breaker
CONFIG            // missing/invalid credentials/placement mapping
NO_AD_READY       // stale/expired/consumed creative


Provide mapInitError, mapLoadError, mapShowError that convert vendor codes/messages to the above. Include reason and vendorCode in detail.

4) Consent, privacy & identifiers
4.1 ConsentState structure
ConsentState {
  iab_tcf_v2: string?,     // as provided by host
  iab_usgpp: string?,      // as provided by host
  coppa: bool,
  attStatus: "authorized"|"denied"|"not_determined"|"restricted", // iOS only
  limitAdTracking: bool
}

Requirements

Read ConsentState from the host SDK at init and before each request; forward values to the vendor privacy APIs.

Respect ATT (do not access IDFA if denied).

Respect user opt-outs and child-directed flags.

4.2 Supply-chain requirements

Before serving, check that app-ads.txt/sellers.json/schain are valid when the vendor requires; if not, emit a diagnostic warning event (do not block delivery by default).

5) Paid event & revenue normalization

Consume each vendor’s “paid event” (or equivalent) callback; if missing, derive from bid metadata when permitted.

Normalize as:

PaidEvent {
  valueMicros: int64,       // always micros
  currency: ISO-4217 string,
  precision: "publisher" | "estimated",
  partner: string,          // adapter name
  partnerUnitId: string?,   // vendor ad unit/placement
  lineItemId?: string,
  creativeId?: string
}


Emit one PaidEvent per impression at onImpression time or vendor’s specified callback.

6) Observability & debugger
6.1 Metrics (per adapter and per placement)

counters: requests, success, no_bid, by_reason[NO_FILL|TIMEOUT|...], cb_open, hedge_used

histograms: latency_load_ms (p50/p95/p99), latency_show_start_ms

gauges: inflight_requests, cached_ready

6.2 Tracing

spans: adapter.init, adapter.load, adapter.show

attributes: partner, placement, attempt, hedged, outcome, error_reason, vendor_code

6.3 Mediation debugger events (sanitized)
DebuggerEvent {
  ts: epoch_ms, requestId: string, partner: string, placement: string,
  phase: "init"|"load"|"show",
  outcome: "success"|"no_bid"|"error"|"timeout"|"circuit_open",
  reason?: ErrorCode, vendorCode?: string,
  redactedPayloadHash?: string // never raw payloads
}

7) Platform-specific adapter rules
7.1 Android

UI calls limited to view attach/present only.

Enforce main-thread guards in debug; fail fast on UI-thread I/O.

Do not hold Activity/Context strongly beyond show lifecycle; use weak references.

7.2 iOS

Access ATT status via host; do not prompt from adapter.

Ensure SKAdNetwork/AdAttributionKit identifiers for the vendor are present in the host app’s Info.plist; adapter should assert presence at first show and emit a diagnostic if missing.

7.3 Unity

C# façade calls into native adapters; maintain parity of method names and callback semantics.

Unity adapter must not implement vendor logic directly—delegate to platform adapters and unify events.

7.4 Web

Use non-blocking request paths and AbortController for deadlines.

Sandboxed creatives must not access top-level global state; events propagate via the host SDK bridge.

If vendor has no web client path, adapter returns UNSUPPORTED and the controller must route to S2S/VAST.

7.5 CTV

If vendor offers native CTV path: use it; otherwise return UNSUPPORTED and route to VAST fallback.

Map quartile beacons and completion to standard events; pass device-appropriate privacy flags.

8) Network-specific functional requirements

For each partner below: credentials/config fields the adapter must accept, privacy flags to forward, format expectations, and notable behaviors to implement. (Names are illustrative; match vendor keys exactly in your mapping layer.)

Moloco

Credentials: seatId, apiKey, placementIds{}.

Privacy: forward GDPR/US privacy flags; respect COPPA toggles.

Notes: REST S2S bidder; include request fingerprint (device, ua, ip) per Moloco spec and honor bid token expirations.

ironSource (LevelPlay as demand)

Credentials: appKey, placementIds{}.

Privacy: forward consent flags; COPPA.

Notes: ensure demand-only mode; prevent recursive mediation loops.

Vungle / Liftoff Monetize

Credentials: appId, placementIds{}.

Privacy: set vendor privacy flags from ConsentState.

Notes: honor vendor retry/backoff hints (e.g., Retry-After) when surfaced.

Tapjoy

Credentials: sdkKey, placementIds{}.

Privacy: forward consent; COPPA.

Rewarded: wire currency/reward callbacks to onRewardVerified.

Smaato

Credentials: publisherId, adSpaceIds{}.

Privacy: forward consent; COPPA.

CTV/Web: if unsupported natively, adapter returns UNSUPPORTED → controller uses VAST.

Pangle (ByteDance)

Credentials: appId, placementCodes{}; use region from AdapterConfig.

Privacy: forward consent; COPPA.

Notes: region gating affects delivery; respect region toggle strictly.

Mintegral

Credentials: appId, appKey, unitIds{}.

Privacy: forward consent; COPPA.

Notes: expect strict parameter validation; map vendor codes carefully.

Fyber / FairBid

Credentials: appId, token, placementIds{}.

Privacy: forward consent; COPPA.

Notes: avoid double mediation; demand-only usage.

Meta Audience Network

Credentials: placementIds{}.

Privacy: ATT is required; forward consent; COPPA.

Notes: enforce policy (no test mode in production); certain formats/regions unavailable—adapter must return NO_FILL consistently without retries on unsupported combos.

Chartboost

Credentials: appId, appSignature, locations{}.

Privacy: consent/COPPA.

Notes: ensure paid event mapping; watch for SDK lifecycle ordering.

AppLovin (MAX as demand)

Credentials: sdkKey, zoneIds{} or adUnitIds{}.

Privacy: consent/COPPA.

Notes: when used as demand, must not activate mediation logic.

Amazon Ads / APS / DTB

Credentials: appKey, slotIds{} (platform-specific).

Privacy: consent; ensure supply-chain requirements satisfied.

CTV: native Fire TV path preferred.

AdMob (Google)

Credentials: appId, adUnitIds{}; include bidding token path when used.

Privacy: forward UMP/TCF/US; COPPA; SKAN.

Notes: unsupported format/geo must quickly return NO_FILL; ensure onPaidEvent mapping.

AdColony

Credentials: appId, zoneIds{}.

Privacy: consent/COPPA.

Notes: handle video lifecycle events robustly; map completion vs. close precisely.

9) Controller interaction & decisioning

Adapter never makes auction decisions; it only loads/serves.

Controller provides: deadlineMs, floorMicros, pacing/cap state, placement config.

Adapter must: obey deadlineMs, return BELOW_FLOOR when partner price < floor, and not mutate global state.

10) Diagnostics & redaction rules

Never log tokens, raw bid payloads, user identifiers, or full IP/UA.

Include hashes (e.g., SHA-256 truncated) for correlation only.

All debugger events must pass a redaction filter; raw payloads may be replaced with redactedPayloadHash.

11) Conformance & acceptance (gate to enable partner)

Offline (fixtures):

200 bid → success with priceMicros

204 → NO_FILL

5xx → retry once → success or terminal

4xx non-transient → no retry

Malformed payload → ERROR

Retry-After respected when present

Circuit breaker transitions: closed → open → half-open → closed

Deadline honored with slow response; hedge recorded

On-device:

Interstitial and Rewarded flows complete; onPaidEvent emitted

Consent round-trip verified; ATT state obeyed

iOS: SKAN/AAK IDs presence check emits diagnostics if missing

Observability:

Metrics counters/histograms populated

Tracing spans present with attributes

Debugger shows sanitized last-N events

12) Performance & memory budgets

Adapter code path adds no more than 1 small allocation burst per request (~tens of KB).

Init budget: < 150 ms typical device.

Load p95: ≤ 300 ms (cache), ≤ 800 ms (network path via controller).

No lingering references to UI contexts after onClosed/invalidate.