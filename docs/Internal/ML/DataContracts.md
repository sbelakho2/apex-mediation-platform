# ML Fraud Data Contracts

Last updated: 2025-11-08
Owner: ML / Platform Engineering

This document defines the authoritative schemas, privacy guarantees, and versioning rules for the ML fraud detection pipeline. Contracts cover both offline training datasets and online scoring payloads so that models remain reproducible, privacy-safe, and interoperable with downstream analytics.

## 1. Schema Versioning
- Use semantic versioning (`MAJOR.MINOR.PATCH`). The current schema version is **1.0.0**.
- Breaking changes (column type/name/semantics changes) increment MAJOR; additive nullable columns increment MINOR; documentation-only changes increment PATCH.
- Every dataset export writes a `metadata.json` alongside parquet files with keys:
	- `schema_version`
	- `generated_at` (UTC timestamp)
	- `source_window.start` / `.end`
	- `row_count`
	- `hash_salt_id`
	- `pii_dropped`, `pii_retained_hash`, `pii_retained_truncated`
	- `enrichment_snapshots` (map of feed → snapshot date)
- Pipeline code validates that parquet key-value metadata also embed `schema_version` to guard against mismatches.
- `ML/scripts/etl_postgres.py` enforces the salt requirement via `--hash-salt` / `ML_HASH_SALT`, hashes identifiers client-side, and writes the metadata payload per run.

Example metadata payload:
```json
{
	"schema_version": "1.0.0",
	"generated_at": "2025-11-08T18:42:00Z",
	"source_window": {
		"start": "2025-10-09",
		"end": "2025-11-08"
	},
	"row_count": 1842345,
	"hash_salt_id": "d7644c4a",
	"pii_dropped": ["user_id", "device_id", "ip"],
	"pii_retained_hash": ["device_id_hash"],
	"pii_retained_truncated": ["ip_trunc"],
	"enrichment_snapshots": {
		"abuse_ipdb_csv": "2025-11-06",
		"tor_exit_list": "2025-11-07",
		"vpn_list": "2025-11-07"
	}
}
```

## 2. Training Dataset Schema
Training exports live under `data/training/YYYY-MM-DD/` and are partitioned by `event_date`. Each partition contains `fraud_training.parquet` with the following columns:

| Column | Type | Description | Privacy handling |
|--------|------|-------------|------------------|
| `request_id` | string | Unique ad auction identifier. | SHA-256(salt + raw_id) truncated to 16 hex chars. |
| `event_time` | timestamp (UTC) | Timestamp of the impression/click/install event. | Truncated to minute precision. |
| `event_date` | date | Derived from `event_time`. | Non-PII. |
| `placement_id` | string | Console placement key. | As-is. |
| `network_name` | string | Adapter supplying the bid. | As-is. |
| `publisher_id` | string | App/publisher identifier. | As-is. |
| `country_code` | string(2) | ISO-3166 alpha-2 from geo enrichment. | As-is. |
| `device_platform` | string | `android` / `ios` / `other`. | As-is. |
| `device_os_version` | string | Normalized major.minor from UA. | As-is. |
| `device_type` | string | phone/tablet/other classification. | As-is. |
| `device_id_hash` | string | Stable hashed identifier. | SHA-256(salt + raw_id) truncated to 16 hex chars. |
| `ip_trunc` | string | IPv4 /24 or IPv6 /48 truncation. | Derived; raw IP dropped. |
| `asn` | int | Autonomous System Number. | As-is. |
| `connection_type` | string | wifi/cellular/other. | As-is. |
| `user_agent_family` | string | Major browser/app family. | As-is. |
| `user_agent_version` | string | Major.minor. | As-is. |
| `consent_gdpr_applies` | uint8 | 1/0/NULL. | As-is. |
| `consent_ccpa_opt_out` | uint8 | 1/0/NULL. | As-is. |
| `att_status` | string | ATT status for iOS. | As-is. |
| `ctit_seconds` | float | Click-to-install time in seconds. | As-is. |
| `auction_timeout_ms` | int | Effective timeout for auction. | As-is. |
| `floor_price` | float | Floor CPM USD. | As-is. |
| `auction_bid_count` | int | Number of responses before timeout. | As-is. |
| `auction_win_ecpm` | float | Winning bid eCPM. | As-is. |
| `adapter_error_rate_1h` | float | Rolling error rate (last hour). | Derived. |
| `adapter_latency_p95_1h` | float | Rolling P95 latency (ms). | Derived. |
| `publisher_ctr_1d` | float | Rolling CTR (24h). | Derived. |
| `ip_impression_rate_1h` | float | Impressions per IP (last hour). | Derived. |
| `ip_install_rate_1d` | float | Installs per IP (24h). | Derived. |
| `placement_revenue_share` | float | Revenue share ratio if available. | Derived. |
| `omsdk_viewable_ratio` | float | Viewable duration / total duration. | Derived. |
| `omsdk_click_inconsistency` | uint8 | 1 if clicks without viewability signal. | Derived. |
| `flag_unauthorized_seller` | uint8 | Weak label flag (app-ads.txt mismatch). | Derived. |
| `flag_network_origin_anomaly` | uint8 | Weak label flag (VPN/DC + mobile UA). | Derived. |
| `flag_ctit_short` | uint8 | Weak label flag (CTIT < 2s). | Derived. |
| `flag_ctit_long` | uint8 | Weak label flag (CTIT > 43200s). | Derived. |
| `flag_omsdk_inconsistency` | uint8 | Weak label flag (viewability mismatch). | Derived. |
| `flag_synthetic_pattern` | uint8 | Weak label flag (VASTFLUX-type anomaly). | Derived. |
| `label_weak` | uint8 | Consensus weak label. | Derived from flags. |
| `label_final` | uint8 | Optional human-reviewed label. | Collected offline; non-PII. |

### PII Handling Summary
- Remove all raw identifiers (`user_id`, `device_id`, `ip`, `advertising_id`).
- Hash identifiers that need stability with SHA-256 and truncate to 16 hex characters; rotate salts daily and log the `hash_salt_id` in metadata.
- Truncate IPs to /24 or /48 and drop user-level payloads (URLs, headers).
- Only store parsed UA components and aggregated consent flags.

## 3. Scoring (Shadow Mode) Schema
Shadow scoring outputs (`analytics/shadow_scores/YYYY-MM-DD.parquet`) include:

| Column | Type | Description |
|--------|------|-------------|
| `request_id` | string | Hashed request identifier; matches training format. |
| `event_time` | timestamp | Timestamp of scored event. |
| `placement_id` | string | Placement key. |
| `network_name` | string | Adapter. |
| `publisher_id` | string | Publisher/app ID. |
| `model_version` | string | Packaged model semantic version. |
| `score` | float | Calibrated fraud probability [0,1]. |
| `raw_score` | float | Raw model output. |
| `weak_label` | uint8 | Weak label snapshot at scoring time. |
| `consent_gdpr_applies` | uint8 | 1/0/NULL. |
| `consent_ccpa_opt_out` | uint8 | 1/0/NULL. |
| `att_status` | string | ATT status if present. |
| `ip_trunc` | string | Truncated IP for drift monitoring only. |
| `asn` | int | ASN. |
| `shadow_run_id` | string | UUID for scoring batch. |
| `scored_at` | timestamp | When inference executed. |

Accompanying `shadow_metadata.json` files must include drift metrics (PSI/JS divergence), histogram bins, and gating thresholds. Before sharing externally, drop quasi-identifiers (e.g., `ip_trunc`) or aggregate to preserve privacy.

## 4. Label Artifact Schema
Label artifacts (`data/labels/*.parquet`) store consolidated weak and human labels:

| Column | Type | Description |
|--------|------|-------------|
| `request_id` | string | Hashed identifier. |
| `label_source` | string | `weak`, `analyst`, or `partner`. |
| `label` | uint8 | 1 = fraud, 0 = clean. |
| `confidence` | float | Confidence [0,1]. |
| `notes` | string | Optional analyst notes (redacted). |
| `created_at` | timestamp | When label recorded. |

## 5. Directory Layout
- `data/training/YYYY-MM-DD/` — Daily partitions with schema metadata.
- `data/enrichment/<source>/<version>/` — Source snapshots (IP ranges, ASN, VPN, UA parser).
- `data/labels/` — Consolidated weak and human labels.
- `analytics/shadow_scores/` — Shadow scoring outputs.
- `models/fraud/<model_version>/` — Packaged model, metrics, manifests.

## 6. Retention & Governance
- Training partitions: retain 90 days hot; archive to encrypted cold storage after 90 days.
- Shadow scoring exports: retain 30 days; aggregate drift metrics kept indefinitely (PII-free).
- Enrichment snapshots: store manifest with SHA-256 hash and acquisition timestamp; refresh weekly or as upstream dictates.
- Quarterly audit verifies salt rotation, schema parity with downstream systems, and documentation freshness.

## 7. Quality Gates & Tests
- Automated schema checks under `ML/scripts/tests/` validate column existence, data types, nullability, and allowed value ranges.
- Train/serve parity tests ensure features present in scoring payloads match those used offline.
- Row-level invariants (non-null keys, timestamp bounds, categorical domain checks) enforced via Great Expectations profiles and pytest asserts.
- Changes require fixtures under `ML/scripts/tests/fixtures/` and `pytest ML/scripts/tests -k data_contracts` to pass before merge.

## 8. Change Management Workflow
1. Update this document with proposed schema modifications and rationale.
2. Bump `schema_version` in code and sample metadata.
3. Regenerate fixtures and rerun schema validation tests.
4. Communicate changes to analytics, data science, and backfill owners before deployment.
5. Tag the change in the next weekly ML fraud status update.

## 9. Reference Scripts
- `ML/scripts/etl_postgres.py` — Materializes training datasets using the schema above.
- `ML/scripts/feature_builder.py` — Derives rolling aggregates and OMSDK features.
- `ML/scripts/weak_labels.py` — Generates weak label flags described in the schema.
- `ML/scripts/shadow_scoring.py` — Emits scoring payloads in shadow mode.
- `ML/scripts/package_model.py` — Embeds `schema_version` and salts into model artifacts.

Questions or proposals should go through an RFC in `docs/Internal/ML/RFCS/` and tag Platform ML owners.
