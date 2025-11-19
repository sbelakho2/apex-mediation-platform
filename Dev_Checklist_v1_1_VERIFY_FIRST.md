# ApexMediation — VERIFY-FIRST Development & Delivery Checklist (v1.1)

Bel Consulting OÜ (daughter of Starz Energies, US)

BYO-credentials mediation platform with Cryptographic Transparency and Migration Studio

**Note:** Every checklist row follows a VERIFY-FIRST flow. Confirm the feature already exists and meets acceptance before any build work.


**Non-negotiables (re-affirmed):**

- BYO model — Networks pay publishers; Apex bills publishers. Apex never touches network payouts.
- No network credentials in SDKs/adapters — long-lived keys live in control plane; clients get only placement IDs and short-lived tokens when absolutely required.
- OTA-safe configs — staged rollout + automatic rollback; kill-switches per adapter/placement.
- ANR-minimal SDKs — strict main-thread guards, bounded executors, deadlines, hedging, circuit breakers.
- Cryptographic Transparency — signed, append-only decision receipts + daily roots; public verification endpoints.

## 0. Governance & Program Setup

| Checklist item | Verify Present ☐ | Meets Acceptance ☐ | If Missing: Action | Owner | Status | Evidence / Link |
| --- | --- | --- | --- | --- | --- | --- |
| RACI defined for SDKs, Adapters, Auction, Observability, Reporting, Billing, Privacy, Security, SRE | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |
| Repository structure + CODEOWNERS; branch protection + required checks | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |
| Semantic versioning per surface (SDKs, APIs, Dashboard) | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |
| Issue templates for Features, Bugs, Runbooks, RCAs | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |
| Architecture Decision Records (ADR) for crypto log, BYO scope, billing model | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |
| Public status page and incident taxonomy (SEV1–SEV4) | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |
| Escalation/on-call rotation and paging runbook | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |
| Acceptance gates (alpha, beta, GA) per surface | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |
| Data retention & deletion SLAs by dataset type | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |
| Security reviews for cryptographic keys, billing, PII handling | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |

## 1. Business Model & Billing (BYO)

| Checklist item | Verify Present ☐ | Meets Acceptance ☐ | If Missing: Action | Owner | Status | Evidence / Link |
| --- | --- | --- | --- | --- | --- | --- |
| Fee models implemented: SaaS, usage (requests/active placements), optional % of Net | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |
| FX normalization source wired (e.g., ECB) for invoicing | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |
| Read-only report keys/CSV ingestion per network to compute Net Ad Revenue | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |
| Daily fee accruals widget in console | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |
| Invoice generation + auto-debit (card/SEPA/ACH) + dunning rules | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |
| Grace period and soft-throttle → hard suspend policies | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |
| Month-end close (T+7/T+15) to handle network revisions | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |
| Audit trail for billing computations (inputs, FX, adjustments) | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |
| Billing API exposed: accruals, invoices, payment status, adjustments | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |
| Legal templates finalized (MSA, Order Form, DPA, Transparency Addendum) | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |

## 2. Migration Studio

| Checklist item | Verify Present ☐ | Meets Acceptance ☐ | If Missing: Action | Owner | Status | Evidence / Link |
| --- | --- | --- | --- | --- | --- | --- |
| Importers for Unity/MAX/LevelPlay placements/floors/caps via CSV/JSON | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |
| Mapping UI: source ad-units → Apex placements with conflict detection | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |
| Parity simulator (replay a day of logs) for eCPM/fill/latency without serving | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |
| Shadow-mode cutover (no serving) + comparison report | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |
| One-click rollout with staged ramp + auto-rollback on SLO breach | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |
| Rollback to last-known-good config per app/placement | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |
| app-ads.txt line generator + remote verification | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |
| iOS SKAN/AAK Info.plist diff generator + runtime validation | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |
| Pre-flight checklist export (PDF/CSV) | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |
| Telemetry tags for ‘migration window’ in dashboards | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |

## 3. Cryptographic Transparency

| Checklist item | Verify Present ☐ | Meets Acceptance ☐ | If Missing: Action | Owner | Status | Evidence / Link |
| --- | --- | --- | --- | --- | --- | --- |
| Signed receipt schema (req_id, ts, placement, floor, bids/winner, prev_hash, hash, sig) | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |
| Append-only log with prev_hash → this_hash chain | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |
| Daily Merkle root computation and storage | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |
| Verification endpoints: /v1/proofs/{req_id}, /v1/proofs/digest, /.well-known/keys.json | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |
| Ed25519 key management with quarterly rotation + signed key manifest | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |
| Async signer off critical path with back-pressure monitoring | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |
| Receipt ≤ 0.9 KB; hash large fields; PII redaction | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |
| Daily anchor publication + retention policy | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |
| Optional client verifier lib (deterministic checks) | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |
| RCA playbook for degraded proof generation/anchoring | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |

## 4. Auction & Optimization

| Checklist item | Verify Present ☐ | Meets Acceptance ☐ | If Missing: Action | Owner | Status | Evidence / Link |
| --- | --- | --- | --- | --- | --- | --- |
| Hybrid flow (S2S bidders + client header-bids + waterfall fallback) with deadlines | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |
| Dynamic floors via bandits per geo×format×placement with fill guardrails | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |
| Pacing/capping per placement with planned override windows | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |
| A/B/n experimentation with Thompson sampling + safe stop criteria | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |
| Outcome taxonomy: WIN, NO_FILL, BELOW_FLOOR, TIMEOUT, NETWORK_ERROR, ERROR, CIRCUIT_OPEN | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |
| p95 load ≤ 300 ms (cache) / ≤ 800 ms (network) | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |
| Bid landscape logging (hashed as needed) with reasons and latency | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |
| Adapter timeouts composed under master auction deadline | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |
| Hedged requests at p95; earliest winner wins; cancel remainder | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |
| Metrics API + time-series aggregator for auction KPIs | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |

## 5. Adapters — Generic Contract (BYO-safe)

| Checklist item | Verify Present ☐ | Meets Acceptance ☐ | If Missing: Action | Owner | Status | Evidence / Link |
| --- | --- | --- | --- | --- | --- | --- |
| No long-lived credentials in adapters; use placement IDs; short-lived tokens only if required | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |
| Standard interface: init, load/show interstitial & rewarded, readiness/expiry, invalidate | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |
| Unified resiliency: 1 retry + 10–100 ms jitter; circuit breaker (3 fails/30s); p95 hedging | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |
| Standard error mapping → outcomes (NO_FILL, TIMEOUT, etc.) | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |
| Strict deadline obedience; allow partial aggregation on timeout | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |
| Quarantine misbehaving adapters for session; emit health signals | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |
| Conformance tests: 200 bid; 204 no_fill; 5xx retry→success; 4xx no retry; malformed JSON | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |
| Offline fixtures for req/resp schema; golden tests committed | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |
| Adapter metrics: p50/p95/p99 latency, timeout, fill, error rates | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |
| Kill-switches per adapter/placement/creative via OTA config | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |

## 6. SDKs — Cross-cutting

| Checklist item | Verify Present ☐ | Meets Acceptance ☐ | If Missing: Action | Owner | Status | Evidence / Link |
| --- | --- | --- | --- | --- | --- | --- |
| OTA config agent with 1%→5%→25%→100% staged rollout + auto-rollback on SLO breach | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |
| Consent propagation: TCF v2.2, US GPP, COPPA, iOS ATT; IDFA never accessed when ATT denied | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |
| UI thread only for view attach; all I/O off main thread | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |
| Deadline management with cancellation and cleanup; no dangling callbacks | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |
| Hedged loads and circuit breakers for local instances | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |
| Predictive caching with TTLs; expose isAdReady() and expiry semantics | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |
| Mediation Debugger: last-N sanitized events; copy-safe share link | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |
| Paid events normalized to valueMicros/currency/precision/partner/unitId (once per impression) | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |
| Core SDK < 500 KB where feasible; adapters shipped separately | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |
| Diagnostic warnings for missing SKAN/AAK IDs and app-ads.txt misconfig | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |

## 7. SDK — Android

| Checklist item | Verify Present ☐ | Meets Acceptance ☐ | If Missing: Action | Owner | Status | Evidence / Link |
| --- | --- | --- | --- | --- | --- | --- |
| StrictMode enabled in debug; fail on main-thread I/O | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |
| Bounded executors; avoid context leaks; lifecycle-aware callbacks | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |
| OkHttp with timeouts/cancellation; MockWebServer tests for HTTP paths | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |
| Safe show() with weak refs and main-thread marshaling | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |
| Interstitial/Rewarded controllers with double-callback protection and TTL | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |
| ConsentManager normalization/redaction + unit tests | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |
| ProGuard/R8 rules; size budget verified in CI | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |
| Graceful FG/BG transitions (pause/resume ads) | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |
| ANR contribution measured & exported via SDK health telemetry | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |
| Sample app with Debug Panel for QA | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |

## 8. SDK — iOS

| Checklist item | Verify Present ☐ | Meets Acceptance ☐ | If Missing: Action | Owner | Status | Evidence / Link |
| --- | --- | --- | --- | --- | --- | --- |
| Respect ATT; never access IDFA if denied | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |
| AAK/SKAN bridges; runtime validation of SKAN IDs present | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |
| URLSession timeouts & cancellation; UI confinement on main thread | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |
| Interstitial/Rewarded lifecycle with ready/expiry semantics and safe deallocation | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |
| Background task handling for long operations (where appropriate) | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |
| Thread-safe caches; weak delegates to avoid retain cycles | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |
| Unit tests for network paths incl. 204/4xx/5xx/malformed JSON | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |
| SDK size/startup impact measured; budgets enforced | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |
| Sample iOS app with Debug Panel and SKAN checklist | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |
| XCFramework packaging; SPM/CocoaPods distribution | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |

## 9. SDK — Unity

| Checklist item | Verify Present ☐ | Meets Acceptance ☐ | If Missing: Action | Owner | Status | Evidence / Link |
| --- | --- | --- | --- | --- | --- | --- |
| C# façade delegates to native Android/iOS SDKs with API parity | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |
| Thread-safe marshalling of consent/config/callbacks | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |
| Editor-time validation for missing platform SDKs; friendly errors | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |
| Unity sample scene for interstitial/rewarded with debug overlay | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |
| IL2CPP/Mono compatibility; linker settings verified | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |
| Memory checks; no leaks on scene reloads | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |
| UPM package & versioning; CI builds Unity package | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |
| Event normalization consistent with native SDKs | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |
| Docs parity with native quickstarts | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |
| Crash/exception reporting integrated in sample | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |

## 10. SDK — Web & CTV

| Checklist item | Verify Present ☐ | Meets Acceptance ☐ | If Missing: Action | Owner | Status | Evidence / Link |
| --- | --- | --- | --- | --- | --- | --- |
| AbortController deadlines; cleanup inflight promises on route change | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |
| Sandboxed creative bridge; postMessage origin checks | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |
| CTV VAST renderer with quartile beacons & failover | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |
| Viewability observers feeding OMSDK (where applicable) | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |
| Cross-browser/CTV compatibility matrix documented | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |
| GDPR banner interop; consent propagation to ad calls | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |
| Lightweight bundle; tree-shaking; non-blocking resources | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |
| Sample web & CTV apps with instrumented flows | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |
| Error taxonomy aligned across SDKs | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |
| Fallback rendering paths documented & tested | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |

## 11. Observability & Debugger

| Checklist item | Verify Present ☐ | Meets Acceptance ☐ | If Missing: Action | Owner | Status | Evidence / Link |
| --- | --- | --- | --- | --- | --- | --- |
| Adapter metrics exporter (p50/p95/p99 latency, error/fill) | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |
| Time-series aggregator (5-min buckets, 7 days) with SLO badges | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |
| Tracing scaffold across auction + adapters; OpenTelemetry plan | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |
| Mediation Debugger ring buffer with PII redaction & hashing | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |
| APIs: /v1/metrics/adapters, /timeseries, /slo, /v1/debug/mediation | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |
| Observability Overview dashboard (trends + alerts) | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |
| Runbooks for SLO breaches, adapter timeouts, rising errors | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |
| RCA template referencing transparency receipts | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |
| Screenshots/recordings for GA sign-off stored in repo | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |
| CORS/auth configured for dashboard → APIs | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |

## 12. Reporting & Reconciliation

| Checklist item | Verify Present ☐ | Meets Acceptance ☐ | If Missing: Action | Owner | Status | Evidence / Link |
| --- | --- | --- | --- | --- | --- | --- |
| Nightly report ingestion via API/CSV for major networks | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |
| Map ad-unit IDs → PlacementBindings; handle renames/merges | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |
| FX normalization by statement date; store raw + normalized values | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |
| Adjustments for IVT refunds/chargebacks with reason codes | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |
| Curated daily aggregates + log-level streams via API | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |
| Discrepancy center (SDK paid events vs. network reports) | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |
| Publisher statements (CSV/PDF) with placement detail | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |
| Backfill idempotency for late statements | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |
| Configurable data retention per publisher/contract | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |
| RBAC for finance vs developer roles | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |

## 13. Privacy & Compliance

| Checklist item | Verify Present ☐ | Meets Acceptance ☐ | If Missing: Action | Owner | Status | Evidence / Link |
| --- | --- | --- | --- | --- | --- | --- |
| Consent matrix tests for TCF v2.2/US GPP/COPPA across SDKs | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |
| ATT prompt helper & timing guidance; sample code | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |
| OMSDK integration + verification partner certification plan | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |
| PII minimization: IP /24 truncation, UA normalization, hashed IDs | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |
| DPIA templates completed; processing records maintained | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |
| Data retention policies enforced by dataset category | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |
| Processor/Sub-processor disclosures; vendor list maintained | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |
| Secure deletion playbook & tooling verified | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |
| Regional storage/export considerations documented | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |
| SOC 2 Type I prep checklist completed | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |

## 14. Security (Secrets & Keys)

| Checklist item | Verify Present ☐ | Meets Acceptance ☐ | If Missing: Action | Owner | Status | Evidence / Link |
| --- | --- | --- | --- | --- | --- | --- |
| KMS/HSM for secrets at rest; least-privilege IAM | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |
| Rotate API/report keys without downtime (dual-slot) | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |
| Secret scanning in CI; block merges on findings | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |
| Short-lived tokens for any client header-bid paths; never ship long-lived keys | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |
| TLS 1.2+; HSTS; secure cookies; SameSite settings | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |
| SAST/DAST in CI; third-party pen test before GA | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |
| Key manifest signing; quarterly rotation documented | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |
| Log redaction of secrets/consent/IDs | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |
| Quarterly access reviews for prod systems | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |
| IR plan for key compromise and PII exposure | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |

## 15. Infrastructure & SRE

| Checklist item | Verify Present ☐ | Meets Acceptance ☐ | If Missing: Action | Owner | Status | Evidence / Link |
| --- | --- | --- | --- | --- | --- | --- |
| Canary/blue-green deploys for auction and config services | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |
| Autoscaling with strict per-request timeouts and budgets | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |
| p99 latency SLOs via synthetic probes + RUM | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |
| Back-pressure and circuit breakers between services | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |
| Disaster recovery plan and drills (snapshot restores) | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |
| Cost budgets/alerts; infra <$3k/mo at MVP scale | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |
| Error budgets & release gating tied to SLO burn | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |
| Regional failover (active-passive acceptable) | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |
| Versioned config/secret management; immutable images | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |
| Runbooks for capacity events, brownouts, throttling | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |

## 16. Data & ML (Fraud, Shadow-Mode)

| Checklist item | Verify Present ☐ | Meets Acceptance ☐ | If Missing: Action | Owner | Status | Evidence / Link |
| --- | --- | --- | --- | --- | --- | --- |
| Versioned feature/label schemas; Parquet with metadata | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |
| ClickHouse → Parquet ETL (30-day rolling) with dedupe | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |
| Enrichment snapshots (ASN/Geo/DC/VPN) cached locally | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |
| Weak-supervision label functions with quality report | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |
| Serve-time feature parity enforced | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |
| Baselines: Logistic/GBM + calibration; time-sliced CV | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |
| Shadow-mode only until metrics clear 4 consecutive windows | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |
| Drift monitoring (PSI/JS) + threshold proposals via PR | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |
| Model registry with artifacts/metrics/feature manifest/hash | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |
| Publisher/app opt-out path for ML gating | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |

## 17. Acceptance Gates (Ship-Ready)

| Checklist item | Verify Present ☐ | Meets Acceptance ☐ | If Missing: Action | Owner | Status | Evidence / Link |
| --- | --- | --- | --- | --- | --- | --- |
| Crash-free ≥ 99.9%; ANR contrib ≤ 0.02% across ≥100k sessions | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |
| p95 load ≤ 300 ms (cache) / ≤ 800 ms (network) on sample apps | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |
| All targeted adapters pass conformance suite | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |
| /v1/proofs returns valid receipts; daily root published & verified | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |
| Nightly ingestors succeed; curated totals reconcile within tolerance | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |
| Accrual widgets match invoices; auto-debit tested E2E | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |
| Migration: import → shadow → rollout → rollback verified | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |
| Consent signals verified in CI; ATT respected; OMSDK live | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |
| Pen test findings triaged; secrets scanning clean; rotation done | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |
| Docs/runbooks/SLOs complete; GA launch review signed | ☐ | ☐ | Implement/refactor to spec; open PR with tests & runbook; link evidence |  |  |  |

### Usage
For each row, first check **“Verify Present”**. If it exists, validate against acceptance and check **“Meets Acceptance”**. Only if missing/non-compliant, use the **“If Missing: Action”** lane, open a PR, link evidence, and track to done. Remember: adapters/SDKs must not embed network credentials; BYO model is mandatory.
