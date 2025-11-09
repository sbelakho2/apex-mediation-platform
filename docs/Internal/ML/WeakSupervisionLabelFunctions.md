# Weak Supervision Label Functions

_Last updated: 2025-11-09_

## Overview

This document describes the weak supervision framework that generates silver labels for fraud model training. The implementation lives in `backend/src/services/fraud/weakSupervision` and loads local corpora only, keeping inference deterministic and offline-friendly.

The framework evaluates impression/install contexts against a collection of label functions:

1. **Supply-chain validity** — validates `app-ads.txt` and `sellers.json` declarations to flag unauthorized sellers.
2. **Network origin anomalies** — combines enrichment (VPN/Tor/cloud) with geo/carrier/user-agent expectations to flag proxy usage.
3. **Click-to-install time (CTIT) heuristics** — catches ultra-short (injection) and ultra-long (spam) conversions, plus partner outliers.
4. **OMSDK/viewability inconsistencies** — checks OMSDK telemetry for impossible viewability metrics.
5. **Synthetic scenario signatures** — matches high-risk telemetry patterns inspired by historic campaigns (e.g., VASTFLUX).

All label functions output `fraud`, `legit`, or `uncertain` with an associated confidence score and explanations for downstream audits.

## Data Inputs

| Corpus | Path | Purpose |
| --- | --- | --- |
| App-ads & sellers directory | `data/weak-supervision/supply-chain/*.json` | Maps publisher domains to authorized sellers and directory metadata. Corpus now mirrors the latest exports pulled from production partners (premium news, hypercasual, and CTV inventories). |
| Synthetic scenarios | `data/weak-supervision/synthetic-scenarios.json` | Threshold-driven patterns for known fraud campaigns. |
| Enrichment cache | `data/enrichment/v1/...` | VPN/Tor/cloud datasets, ASN/Geo lookup, user-agent patterns. |
| Nightly telemetry contexts | `data/weak-supervision/context-samples/*.jsonl` (default) | JSONL payload containing nightly impression/install contexts evaluated by the pipeline. |

The service accepts contextual telemetry (`WeakSupervisionContext`) that includes supply-chain, network, CTIT, OMSDK, and synthetic signals. See `types.ts` for the full schema.

## Label Function Details

### Supply-chain validity (`supply_chain_authorization`)
- Confirms `seller_id` is declared under the publisher’s domain with matching app store ID.
- Flags missing domains, undeclared sellers, or mismatched app IDs with confidence 0.9.
- Pulls seller metadata (`sellers.json`) into the reason payload for analyst review.

### Network origin anomalies (`network_origin_anomaly`)
- Uses `EnrichmentService` to detect VPN/Tor/DC ranges and correlates with UA/device data.
- Adds mismatches across device vs. payment/app store countries, timezone, and carrier.
- Mobile UAs served from VPN/DC providers score highly as fraud (confidence ≥0.9).

### CTIT heuristics (`ctit_*`)
- `ctit_ultra_short`: <5 s → high-confidence click injection.
- `ctit_ultra_long`: ≥24 h → click spamming.
- Partner-based outliers compare against historical mean/p95 to catch deviations >50%.

### OMSDK/viewability consistency (`omsdk_viewability_consistency`)
- Checks that OMSDK sessions start before viewable impressions, viewable time ≥1 s, and slot coverage ≥50% with <3 overlapping creatives.
- Violations are labelled as fraud (confidence ≥0.7) with geometry telemetry attached.

### Synthetic scenarios (`synthetic_scenario_*`)
- Evaluates RPM, device fan-out, creative swap rate, and bundle fan-out against scenario thresholds.
- `vastflux_clone` flags known multi-bundle spoofing behaviour with confidence 0.9.
- `burst_click_spam` yields `uncertain` for further validation.

## Label Quality Reporting

`WeakSupervisionService.evaluateBatch` returns:
- `coverage` — fraction of events each label function marked as fraud.
- `conflictRate` — proportion of events receiving both fraud and legit labels across functions.
- `precisionProxy` — true/false positives using optional ground-truth labels to monitor quality drift.

Example usage:

```ts
const { results, report } = await weakSupervisionService.evaluateBatch(contexts);
console.log(report.coverage);
console.log(report.precisionProxy.supply_chain_authorization?.precision);
```

## Nightly Integration

- The nightly Cron job (`backend/scripts/cron-jobs.ts` → `mlModelOptimizationService.optimizeModels`) now calls `generateWeakSupervisionReport` after model training.
- Contexts are sourced from `WEAK_SUPERVISION_CONTEXT_PATH` (comma-separated files or directories). When unset, the service falls back to the most recent file under `data/weak-supervision/context-samples/`.
- Outputs are written under `models/fraud/dev/<YYYYMMDD>/weak_supervision/` (override with `WEAK_SUPERVISION_REPORT_DIR`). Artifacts include:
  - `quality_report.json` — coverage, conflict rate, precision proxies, metadata.
  - `flagged_events.json` — sample of high-confidence fraud traces for analyst review.
  - `manifest.json` — machine-consumable pointer to the report files.
- Use `WEAK_SUPERVISION_MAX_CONTEXTS` to cap nightly evaluation volume (default 5000 events) when running locally.

## Tests

- `backend/src/services/fraud/weakSupervision/__tests__/weakSupervisionService.test.ts`
  - Verifies unauthorized seller detection, VPN/geo anomalies, CTIT heuristics, OMSDK checks, synthetic patterns, and report metrics.
  - Uses sample corpora in `data/weak-supervision` and enrichment fixtures (`data/enrichment/v1`).

Run with:

```powershell
$env:PATH="C:\Program Files\nodejs;" + $env:PATH
$env:SKIP_DB_SETUP='true'
& "C:\Program Files\nodejs\npm.cmd" run test --workspace=backend -- weakSupervisionService
```

## Operational Notes

- The service is offline-first and reloads corpora on process startup. Update corpora and rerun the cron-triggered enrichment refresh when new datasets ship.
- Synthetic scenarios are additive; add new entries to `synthetic-scenarios.json` and rerun tests to validate confidence/coverage expectations.
- Label outputs include structured `signals` for ingestion into analytics or auditor dashboards.

## Next Steps

- Wire precision proxy deltas into monitoring dashboards (coverage/precision trend lines).
- Extend context exports to cover post-install retention and LTV signals before supervised training.
- Attach weak supervision stats to ClickHouse nightly summary tables for analyst queries.
