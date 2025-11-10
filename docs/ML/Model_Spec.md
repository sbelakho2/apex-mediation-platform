### Apex Mediation ML — Fraud Detection Model Specification

#### Purpose
Design a world-class, privacy-preserving fraud detection system that operates in shadow mode initially, delivering calibrated risk scores with low false-positive rates and robust generalization under adversarial conditions.

#### Problem framing
- Task: anomaly/abuse detection in traffic and auction telemetry.
- Inputs: enriched network signals (ASN, cloud/DC ranges, Tor/VPN flags), device/session signals, temporal aggregates, adapter outcomes/timeouts, and rate/entropy features.
- Outputs: risk score in [0,1] + reason codes and feature contributions.

#### Data and enrichment (CLI-fetchable sources)
- Tor Exit Nodes: TorProject (bulk exit list + Onionoo summaries)
- Cloud Ranges: AWS ip-ranges.json, GCP cloud.json, Azure ServiceTags Public
- ASN/Prefixes: RIPEstat API (permissive), optional Team Cymru (check ToS)
- VPN/Proxy: permissive community lists only (modular, optional)
- All fetchers use checksums and dated manifests under `data/enrichment/v1/`.

#### Feature schema (offline/online parity)
- Network features: `asn`, `is_cloud`, `cloud_provider`, `is_tor`, `is_vpn`, `geo_cc`, `asn_risk_score`
- Device/session: `os`, `device_type`, `app_or_site`, `ua_hash`, `session_age_s`, `req_per_min`
- Temporal aggregates: rolling rates `[1m,5m,1h,24h]` for `errors`, `timeouts`, `no_fill`, unique counts, entropy (domains/placements)
- Auction/adapter signals: distribution stats (mean/var/p95) of bid prices, below_floor ratio, timeout fraction
- All PII fields hashed/salted; retention and minimization enforced.

#### Labeling (weak supervision + semi-supervised)
- Label functions (LFs): heuristic rules combining network, temporal, and adapter signals (e.g., Tor+odd hours+timeout burst).
- Aggregation: simple probabilistic label model; export `y_weak`, `confidence`.
- Semi-supervised: pseudo-labeling on high-confidence LFs for deep models.

#### Model architecture
- Ensemble of:
  - Deep Autoencoder (PyTorch) for reconstruction error scoring (GPU-accelerated)
  - DeepSVDD variant for compact normality hypersphere
  - Tree baselines (Isolation Forest, LightGBM/XGBoost) on engineered features
- Calibration: temperature scaling or isotonic; conformal prediction for thresholds at low FPR targets
- Export: TorchScript + ONNX; JSON `model_card.md` + `metrics.json`.

#### Training and evaluation
- Pipeline: deterministic seeds, time-aware splits, stratified by publisher/geo when applicable; leakage guards
- Metrics: PR-AUC, ROC-AUC, precision@k, precision at FPR∈{0.1%, 0.5%, 1%}; stability under synthetic adversarial transforms (IP hopping, ASN masking)
- Artifacts: `models/<run_id>/` with weights, ONNX, feature schema, metrics, training manifest

#### MLOps and governance
- Reproducibility: JSON manifests for data/params; optional MLflow
- Privacy: hashing, k-anonymity probes, data filters by date; no raw IPs saved
- Fairness: bias probes across geo/device; documented mitigations if drift
- Monitoring: drift detectors on features; shadow-mode scoring in backend; rollback path to rules

#### Rollout
- Phase 1: shadow mode; counters only; no serving decisions
- Phase 2: gated actions for very high confidence strata; human review loop
- Phase 3: controlled automated actions with continuous monitoring
