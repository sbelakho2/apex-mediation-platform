# BYO SDK Production Checklist

> **Source of Truth** — This checklist defines everything required to certify the Android, iOS, and Unity SDKs for Bring-Your-Own (BYO) production readiness. Deprecate scattered notes in `SDK_FIXES.md` and keep status here.

## 1. Certification Goals

| Priority | Theme | Objective |
| --- | --- | --- |
| P0 | Reliability & Privacy | Crash-free ≥99.9%, ANR ≤0.02%, consent/ID handling correct across GDPR/TCF/US-GPP/COPPA/ATT/LAT. |
| P0 | Adapter Coverage | ≥8 vendor SDK adapters with parity on lifecycle + error taxonomy. |
| P0 | Observability | Deterministic telemetry, sanitized Mediation Debugger traces, cryptographic transparency receipts. |
| P0 | Security | TLS pinning to config/auction hosts, Ed25519 config signatures, runtime credential redaction & zero-trust surfaces. |
| P0 | Footprint | Android core AAR <500 KB, Unity package <100 KB, iOS xcframework stays <10 MB zipped. |
| P1 | Developer Experience | Credential wizard/validation, app-ads.txt inspector, migration tooling, sample apps kept in sync. |
| P2 | Enterprise & Future Mode | Config-as-Code export/import, cryptographic proof surfacing, Managed Demand seam ready but dormant. |

## 2. BYO Runtime Requirements (Android & iOS)

### 2.1 Mode Gating & Auction Controls (P0)
- Introduce `SdkMode = BYO | HYBRID | MANAGED` (default **BYO**).
- Keep S2S auction code compiled but inactive unless **(a)** mode ≠ BYO or **(b)** every enabled network declares `supportsS2S` **and** credentials exist.
- Android remote config now exposes `AdapterConfig.supportsS2S` and `AdapterConfig.requiredCredentialKeys[]`; the SDK only enables auctions when all enabled networks opt-in and the registered `AdapterConfigProvider` returns every required secret.
- Fresh install with no creds must only show the mock test network; telemetry confirms no S2S auctions fired.

### 2.2 Credential Handling (P0)
- All vendor keys flow through an `AdapterConfigProvider` callback or encrypted local store seeded by the console.
- Secrets never logged or uploaded. Redactor masks keys that match patterns (`api_key`, `account_id`, etc.).
- Support multi-account per app; runtime hot-swaps credentials without stale handles or crashes.

### 2.3 Adapter Parity & Conformance (P0)
- Vendor SDK adapters only (no WebView renderers).
- Each adapter implements: per-adapter timeout, single retry w/ jitter, circuit breaker integration, normalized error taxonomy (`timeout`, `no_fill`, `network_error`, `status_4xx`, `status_5xx`, `below_floor`, `error`).
- Parallel load + partial aggregation with a global auction deadline, even when BYO is client-side only.
- Provide offline conformance tests (success, no_fill, timeout, retry flow, breaker open) plus sandbox smoke suites.

### 2.4 Consent & Privacy Propagation (P0)
- SDK exposes `setConsent(...)` and optional auto-read of TCF v2 / US GPP keys.
- Inject normalized consent payload into every adapter init/load call and S2S payload when enabled.
- Matrix QA (GDPR×ATT×COPPA) proves IDs suppressed when required and strings present when allowed.

### 2.5 OMSDK / OMID (P0)
- Replace no-op OM controller with actual OMID sessions around vendor views. Feature-flag acceptable but default **ON** when adapter supports it.
- Verification partners must see sessions without crashes when OMID unavailable.

### 2.6 Show Lifecycle, Caching, Single-Use (P0)
- Cache renderable ads with TTL metadata; enforce single-use handles and double-callback guards.
- Rewarded: grant once. Banner: refresh honors visibility + foreground. Cancel gracefully on Activity/ViewController destroy.
- Tests cover double `show()` rejection, TTL expiry, lifecycle rotation, LeakCanary/allocations clean.

### 2.7 Observability & Tooling (P1)
- Mediation Debugger shows sanitized traces (adapter, outcome, latency) with consent flags redacted.
- Credential wizard validates keys via vendor SDK init (no paid requests) and surfaces normalized errors.
- app-ads.txt / sellers.json inspector warns when required lines missing for enabled networks.
- “BYO Migration Studio” maps Unity/MAX/ironSource placements to Apex config; dry-run validation ensures unit IDs exist.

### 2.8 Security, Size, Transport (P1)
- TLS pinning for config + auction hosts when auction path active.
- Signature-verified configs and transparency receipts hashed per decision (Merkle root published daily).
- CI gate fails when Android >500 KB, Unity >100 KB, or iOS > target threshold; StrictMode / background-thread enforcement stays on in debug builds.

### 2.9 Deferred / P2 Enhancements
- Config-as-Code export/import for placements & waterfalls (signed JSON schema).
- Cryptographic transparency ledger surfacing in console + SDK (hash chain, Merkle proofs).
- Managed Demand seam: `DemandSource` interface w/ `ExternalNetworkAdapter` vs `ManagedLineItem` paths; runtime ignores managed demand in BYO but compiles cleanly when module disabled.

## 3. Unity SDK Requirements

### 3.1 Package Structure & asmdefs (P0)
- Runtime/ vs Editor/ asmdefs with platform constraints; no vendor SDKs bundled.
- `Runtime/ApexMediation.cs` facade + `Adapters/` marker interfaces + `Internal/UnityMainThread.cs` dispatcher.

### 3.2 Public API (P0)
Expose BYO-first surface:
```csharp
ApexMediation.Initialize(appId, ApexConfig config);
ApexMediation.SetConsent(...);
ApexMediation.SetNetworkConfig(string network, IDictionary<string, object> creds);
ApexMediation.LoadInterstitial(...), ShowInterstitial(...), etc.
ApexMediation.IsAdReady(placement);
ApexMediation.Shutdown();
```

### 3.3 Bridge Layers (P0)
- Android JNI bridge targets `com.apex.mediation.MediationSDK` with marshaled maps + callbacks.
- iOS P/Invoke bridge targets Swift shims. Both ensure IL2CPP-safe signatures.

### 3.4 Callback Pump & Main Thread (P0)
- Single native callback registration; route via managed dispatcher keyed by requestId.
- `UnityMainThread.Dispatch(Action)` ensures UI work on main thread; handles pause/resume events.

### 3.5 Consent & Privacy (P0)
- Mirrors native consent APIs including optional auto-read from PlayerPrefs/NSUserDefaults when enabled.
- Matrix QA verifies payloads forwarded to Android/iOS cores.

### 3.6 OMSDK / Viewability (P0)
- Native views layered correctly for banners/interstitial overlays (Android View over `UnityPlayerActivity`, iOS UIView via `UnityAppController`).
- Banner host MonoBehaviour manages attach/detach, safe areas, rotation.

### 3.7 Samples & Test Harness (P0)
- `Samples~/` scenes for interstitial, rewarded, banner, debugger overlay.
- Mock adapters for CI, docs referencing scenes for QA.

### 3.8 Credential Handling (P0)
- Editor UI / Project Settings for per-network creds stored locally (no commit). Runtime injection via `SetNetworkConfig` or generated ScriptableObject.
- Logs mask secrets; CI scan ensures artifacts contain no plaintext keys.

### 3.9 Footprint & Platform Imports (P1)
- Import rules keep Android `.aar` + iOS frameworks optional; maintain <100 KB package budget.
- CI job `sdk/core/unity/scripts/check_package_constraints.sh` enforces footprint + runs `dotnet test` for runtime glue.

### 3.10 P1/P2 Extras
- Credential wizard & inspector UI, Migration Studio (Unity edition), Mediation Debugger HUD, Config-as-Code export/import, transparency proofs, automated size/test gates in CI.

## 4. Acceptance Gates & Testing

| Area | Validation |
| --- | --- |
| Runtime correctness | Android `./gradlew testDebugUnitTest`, iOS `swift test` (+ `SWIFT_STRICT_CONCURRENCY=complete`), Unity `./scripts/check_package_constraints.sh`. |
| Adapter conformance | Per-adapter sandbox suite + mocked conformance harness covering success/no-fill/timeouts/retries/circuit. |
| Consent matrix | Automated tests toggling GDPR/ATT/COPPA + manual device runs verifying vendor SDK inspectors/logs. |
| Observability | Mediation Debugger trace snapshot includes sanitized fields only; telemetry percentile dashboards reflect BYO-only mode. |
| Security | TLS pinning smoke test, signature verification unit tests, transparency receipt Merkle root diff watchers. |
| Footprint | CI artifacts enforce budgets (<500 KB Android AAR, <100 KB Unity package, target iOS size). |

## 5. Communication & Change Control

1. Update this checklist whenever scope or acceptance criteria changes.
2. Reference it from `SDK_FIXES.md`, platform READMEs, and release plans.
3. Record milestones (e.g., "P0-01 Creds: Android complete in v1.9.0") so audits can trace history.

---
_Last updated: 2025-11-23_
