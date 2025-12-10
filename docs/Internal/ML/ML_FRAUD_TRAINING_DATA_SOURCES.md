# ML Fraud Training Data Sources and Pipeline Plan

Date: 2025-11-06
Owner: Fraud & Risk Engineering
Status: Draft v1

---

## Goal
Identify reliable, immediately actionable data sources to train an effective fraud detection model for ApexMediation. Define collection, labeling, governance, and evaluation so we can ship a production-suitable classifier after shadow validation.

---

## Label Strategy Overview

We will combine: (1) internally observed signals, (2) weak supervision rules, (3) third-party enrichment, and (4) adjudicated feedback loops. Labels are assigned with provenance and confidence scores.

Label classes:
- Positive (Fraud) – high confidence (adjudicated vendor flags, SKAN mismatch, bot honeypot hits) and medium confidence (rule-based SIVT/GIVT signals).
- Negative (Legit) – conversions validated via MMP/SKAN, high LTV cohorts, long sessions, consistent device/app histories.
- Unlabeled – dropped from training or used for semi-supervised approaches later.

---

## Primary Internal Sources (Immediately Available)

1) Event Streams (Click/Impression/Install) – ClickHouse schemas already exist in repo.
- Tables: impressions, clicks, installs, fraud_events (see data/schemas).
- Features: device_id, ip, ua, placement_id, app_id, geo, timestamps, session metrics.
- Action: Build ETL jobs to extract training rows with 30–60 day windows.

2) Fraud Rules Engine Outputs (Weak Supervision)
- Rules: excessive CTR per device/IP, data-center IP, VPN/proxy, rapid-click patterns, UA anomalies.
- Output: fraud_flags array + rule scores; saved to fraud_events.
- Action: Convert rules to label functions (LFs) with weights; create composite weak labels.

3) Honeypot Placements & Canaries
- Inject non-visible placements or invalid endpoints that only bots hit.
- Label: Any activity on honeypots = Positive (Fraud, high confidence).
- Action: Add small share of traffic (0.1–0.5%) to canaries; ensure no user impact.

---

## Third-Party Enrichment (Ready-to-Use Feeds)

These can be integrated quickly and provide high-signal features/labels:

- IP/ASN Reputation:
  - AbuseIPDB (API + monthly dumps) – score, categories (botnet, scraper).
  - IP2Proxy/IP2Location (commercial DB) – VPN/Proxy/DC flags.
  - Cloud/Hosting IP lists (AWS, GCP, Azure ranges) – free JSON sources.

- Network & Anonymity:
  - Tor exit node list (torproject.org, updated frequently).
  - CAIDA AS classification data (if needed for ISP vs hosting).

- UA/Device Intelligence:
  - uap-core regexes (open-source) for UA parsing into device family/os/browser.
  - DeviceMap (Apache) as an alternative.

- App Integrity/Attribution:
  - SKAdNetwork postbacks (Apple) – compare with claimed installs/clicks
  - MMP postbacks (AppsFlyer/Adjust/Branch) – fraud flags where available (requires publisher participation).

All feeds should be cached locally and versioned for reproducible training. IP feeds can be refreshed weekly; UA parsing libraries via pinned versions.

---

## Data Contracts and Schemas

- Feature Store Alignment
  - Match inference FeatureVector in backend/fraud/internal/ml/fraud_ml.go (device_age, device_ip_count, etc.).
  - Add derived features: ASN class, IP reputation score, VPN/Proxy flags, UA family entropy, per-geo eCPM baseline.
- Labels Table (fraud_labels)
  - Columns: entity_id (device_id or request_id), label (0/1), confidence (0–1), source (rule/vendor/mmp/skan/honeypot), created_at, expiry_at, provenance_json.
- Training Views
  - Denormalized views joining events, features, and labels, time-sliced, with leakage protections.

---

## Governance & Compliance

- PII: Store only hashed device identifiers; IP truncated or salted for training; apply data minimization.
- Consent: Only process data per consent flags (GDPR/CCPA/ATT); exclude users with DNT/LMT as required.
- Retention: 90-day rolling window for raw events; 1-year for aggregated features with privacy reviews.
- Access: Role-based controls; training datasets exported to secure bucket with audit logs.

---

## Training & Evaluation Protocol

- Splitting: Time-based split (last N days as test/validation), ensuring no device leakage between sets.
- Metrics: ROC-AUC, PR-AUC; business targets: Precision ≥ 0.8 at Recall ≥ 0.9; cost-sensitive metrics (blocked revenue vs saved loss).
- Calibration: Platt scaling or isotonic on validation set.
- Threshold Tuning: Select operating point that meets targets; store in model metadata.
- Drift Monitoring: PSI/KS tests for key features weekly; automatic alerts.
- Registry: Model versioning with metrics and training data snapshot hashes.

---

## Minimal Viable Data Pipeline (Weeks 0–2)

1) Extract last 30 days of events from ClickHouse into a training parquet dataset.
2) Join with enrichment feeds (IP reputation, Tor, VPN/proxy) using IP+time windows.
3) Generate weak labels from rules + honeypot positives; include SKAN/MMP where available.
4) Compute inference-aligned feature vectors; persist to feature table with schema parity.
5) Train baseline models (logistic regression, gradient boosted trees) and evaluate; export metrics in trained_fraud_model.json.
6) Deploy in shadow mode; generate online score distributions and correlate with weak labels.

---

## Ready Data Sources Summary

- Internal: Click/Impression/Install events; fraud_flags; device/app histories – ready now.
- Enrichment: AbuseIPDB (sign up; free tier available), Tor exit nodes (free), cloud IP ranges (free), uap-core (free) – ready within 1–2 days.
- Attribution: SKAdNetwork postbacks (requires app integration) – start collecting immediately for iOS apps.
- MMP: AppsFlyer/Adjust/Branch – integrate per publisher (optional but recommended).

---

## Deliverables

- ETL jobs to build training parquet + feature tables.
- Label function library (weak supervision) with weights and confidence mapping.
- Enrichment sync jobs and caches.
- Evaluation reports (offline) and shadow-mode dashboards (online).

---

## Go/No-Go Criteria for Leaving Shadow Mode

- Offline: AUC ≥ 0.85; Precision ≥ 0.8 at Recall ≥ 0.9 on time-sliced validation.
- Online Shadow: Stable score distributions; correlation with weak labels; false-positive audits < 0.5% of revenue.
- Ops: Drift monitors and rollback ready; appeal workflow documented.
