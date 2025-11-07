# ML Fraud — Data Contracts and Schemas

Last updated: 2025-11-07
Owner: ML / Platform Engineering

Purpose
- Define stable, versioned data contracts for ML fraud training and online scoring.
- Enforce privacy/PII minimization and redaction rules.
- Ensure train/serve feature parity and reproducibility across versions.

Versioning
- Semantic versioning for schema: MAJOR.MINOR.PATCH (e.g., fraud.schema.v1.0.0)
- Parquet files embed schema_version in key-value metadata.
- Breaking changes bump MAJOR; additive fields bump MINOR; doc/metadata-only bump PATCH.

Privacy & PII Rules
- No raw IPs: store truncated_ip (/24 for IPv4; /48 for IPv6)
- No device identifiers (GAID/IDFA). Use hashed, salted stable_id when required for aggregation.
- User-Agent stored only as parsed components (family/major/minor) and UA hash; no raw UA in training.
- Drop request payloads/URLs/headers; keep derived flags only.
- Retention: training snapshots keep 60 days rolling by default; enrichment lists versioned separately.

Directories
- data/training/YYYY-MM-DD/*.parquet — daily partitions with schema_version metadata
- data/enrichment/<source>/<version>/ — IP/ASN/VPN/Tor/cloud ranges and UA maps
- models/fraud/<model_version>/ — model + metrics + manifests

Training Schema (Feature/Label Parquet)
- schema_version: string (e.g., fraud.schema.v1.0.0)
- partition_keys: event_date (DATE), hour (INT)

Core Keys
- request_id: STRING
- event_timestamp: TIMESTAMP (ms)
- event_date: DATE
- placement_id: STRING
- publisher_id: STRING
- adapter: STRING (winner/attempted)

Outcome / Labels
- weak_label_fraud: INT (0/1) — from weak supervision (see Label Functions)
- post_install_conversion_24h: INT (0/1) — if available for correlation only

Device / Context
- os: ENUM {android, ios, other}
- os_version_major: INT
- app_version_major: INT (optional)
- device_make: STRING (small vocab)
- device_model: STRING (bucketed)
- truncated_ip: STRING (e.g., 192.168.0.0/24)
- asn: INT (from enrichment)
- geo_country: STRING (ISO-2)
- timezone_offset_min: INT
- connection_type: ENUM {wifi, cellular, other, unknown}

Auction / Supply Chain
- schain_depth: INT
- reseller_flag: INT (0/1)
- seller_authorized: INT (0/1) — from app-ads.txt/sellers.json join
- adapter_mix_hash: STRING (short hash for high-cardinality mix)

Engagement / OMSDK (if present)
- om_viewable_ms: INT
- om_interactions: INT
- om_measurement_present: INT (0/1)

Temporal & Aggregates
- hour_of_day: INT [0..23]
- day_of_week: INT [0..6]
- ip_click_rate_1h: FLOAT
- ip_install_rate_24h: FLOAT
- device_click_burst_5m: FLOAT (z-score)
- ctit_bucket: ENUM {ultra_short, short, normal, long, ultra_long}

Train/Serve Parity
- Only include features derivable at scoring time from request + cached enrichment.
- Keep a feature_manifest.json listing features, types, and derivation logic.

Scoring Schema (Online Shadow)
- request_id: STRING
- model_version: STRING
- score: FLOAT [0,1]
- threshold: FLOAT (current blocking threshold; for reference only)
- inference_timestamp: TIMESTAMP (ms)
- shadow_mode: BOOLEAN (always true until promotion)

Label Functions (Weak Supervision) — Summary
- seller_authorized == 0 → candidate fraud
- truncated_ip in DC/VPN/Tor and UA claims mobile → candidate fraud
- CTIT: ultra_short spike → candidate fraud; ultra_long + low CVR → candidate fraud
- OMSDK inconsistency: non-viewable but reported viewable → candidate fraud

Quality & Tests
- Unit tests for schema evolutions: ensure parquet writers/readers validate schema_version.
- Row-level invariants: non-null keys, timestamp bounds, categorical domain checks.

Acceptance
- Data contracts referenced in DEVELOPMENT_TODO_CHECKLIST.md Part 3.
- Schemas implemented in ETL with unit tests and embedded schema_version metadata.
