# Adapter Contract Quick Reference

This document distills the cross-platform adapter contract so partner developers can wire their own network SDKs into ApexMediation without spelunking through the codebase. Use it together with `backend/Adapters.md` for the exhaustive spec and with the platform-specific contract files listed below.

- Android runtime types live in `sdk/core/android/src/main/kotlin/contract/AdapterContract.kt`.
- iOS runtime types live in `sdk/core/ios/Sources/Adapter/AdapterContract.swift`.
- Unity mirrors the same API via C# wrappers that bridge into the native adapters.

## 1. Lifecycle Overview

All adapters must follow the same orchestration path:

1. **Initialization** – `initAdapter(config, timeoutMs)` hydrates the vendor SDK using publisher-provided credentials (`AdapterCredentials`) and placement mappings. Do not perform network I/O on the main thread.
2. **Load** – `loadInterstitial|Rewarded|Banner(...)` runs under strict deadlines supplied by the controller (typically 120–200 ms). Respect the provided `RequestMeta` context, especially consent and floor metadata.
3. **Show** – `showInterstitial|Rewarded(...)` must run on the UI thread and emit the normalized callbacks (`onImpression`, `onPaidEvent`, `onClosed`, etc.). Rewarded placements must call `onRewardVerified` exactly once.
4. **Cleanup** – `invalidate(handle)` frees any vendor resources when an ad expires, is consumed, or when `isAdReady` returns false.

Single-use handles are required: once a creative has been consumed or expired (`expiresAt` ≤ now), the adapter must reject `show` with `NO_AD_READY` and ask the controller to load again.

## 2. Data Contracts

| Type | Purpose | Key Fields |
| --- | --- | --- |
| `AdapterConfig` / `PartnerAdapterConfig` | Canonical init payload | `partner`, `credentials`, `placements`, `privacy`, `options`
| `AdapterCredentials` | Publisher-supplied vendor secrets (BYO) | `key`, `secret?`, `appId?`, `accountIds?` (per-region or per-format)
| `RequestMeta` | Request-scoped context | `requestId`, `device`, `user`, `net`, `context`, `auction`
| `LoadResult` | Successful load outcome | `handle`, `ttlMs`, optional `priceMicros` + currency, `partnerMeta`
| `AdHandle` | Token passed into show APIs | `id`, `adType`, `partnerPlacementId`, `createdAtMs`
| `AdapterError` | Normalized failure | `code` (`NO_FILL`, `TIMEOUT`, `NETWORK_ERROR`, `BELOW_FLOOR`, `ERROR`, `CIRCUIT_OPEN`, `CONFIG`, `NO_AD_READY`), `detail`, `vendorCode?`, `recoverable`
| `PaidEvent` | Revenue callbacks | `valueMicros`, `currency`, `precision`, `partner`, optional creative/line item IDs

All currency values are **micros** (1 USD = 1 000 000 micros). All times are **milliseconds** since epoch.

## 3. Consent, Privacy, and Credentials

- The host SDK injects `ConsentState` into every adapter config and request. Adapters must forward those flags to vendor privacy APIs (e.g., UMP, ATT, GPP) and avoid accessing IDs when disallowed.
- `AdapterCredentials` are provided at runtime via `AdapterConfigProvider`. Never cache, log, or transmit the raw keys.
- When a placement map is missing, return a `CONFIG` error immediately so the controller can surface a deterministic validation failure.

## 4. Error Mapping Rules

Map every vendor outcome into the canonical taxonomy:

- `NO_FILL` – Vendor returned 204/"no ad" or placement disabled.
- `TIMEOUT` – Request exceeded the timeout supplied by the controller.
- `NETWORK_ERROR` – Transport failures (DNS/TCP/TLS) or 5xx once retries are exhausted.
- `BELOW_FLOOR` – Vendor price (if available) is under the requested floor.
- `ERROR` – Malformed payloads, unsupported formats, internal exceptions.
- `CIRCUIT_OPEN` – Runtime rejected the call because the breaker is open.
- `CONFIG` – Missing/invalid credentials, placement IDs, or incompatible settings.
- `NO_AD_READY` – Attempted to show an expired/consumed handle.

Include the vendor’s native error code in `vendorCode` for easier diagnosis.

## 5. Validation & Stress Expectations

- `validateConfig` (where supported) should make the lightest possible request to confirm credentials, never issuing a paid ad request.
- CI exercises the adapter contract via mocked adapters that simulate success, timeouts, retries, and circuit-breaker transitions. Keep your adapter deterministic so it can participate in those tests.
- When adding a new adapter, update both contract files and provide fixtures for the stress harness so load/deadline scenarios stay reproducible.

## 6. Sample App Requirements

Reference sample apps (Android Studio + Xcode) demonstrate:

1. Initialization with remote config signature verification and BYO credentials.
2. Explicit consent collection and propagation.
3. A load/show lifecycle that surfaces adapter callbacks and telemetry.
4. Debugger output with sanitized payload hashes only.

Adapters should behave identically when driven from the sample apps or from a production host.

## 7. Getting Help

- For backend orchestration details, see `backend/Adapters.md`.
- For telemetry schemas, see `sdk/core/*/telemetry/` folders.
- For questions about new partners or edge cases, file an issue referencing the adapter contract version and attach sanitized logs.
