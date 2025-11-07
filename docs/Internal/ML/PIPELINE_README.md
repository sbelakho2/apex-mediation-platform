# ML Fraud Pipeline — Setup and Quick Start

Last updated: 2025-11-07
Owner: ML / Platform Engineering

Purpose
- Provide a minimal, working scaffold to load training data from ML/ML Data, normalize it to the DataContracts schema, and train a first baseline model using PyOD.
- Keep everything offline, CPU-only, and reproducible to respect the platform’s ≤ $500/month operating budget.

What’s included in this pass
- A tiny Python workspace under `ml/` with pinned dependencies.
- A simple training script that:
  - Loads (and auto-decompresses) CSV/CSV.GZ/Parquet files from `ML/ML Data/`.
  - Applies basic privacy guards (drops raw IP/IDs if present).
  - Selects a small set of numeric features and trains an IsolationForest baseline via PyOD.
  - Exports a model artifact directory under `models/fraud/dev/` with:
    - `model.pkl` (PyOD model via joblib)
    - `feature_manifest.json`
    - `trained_fraud_model.json` (metrics placeholder + shadow-mode gating fields)
- A "small sample" mode for CI/dry-runs that limits to N rows.

Pre-requisites
- Python 3.10+ installed locally.
- Windows or macOS/Linux shell.

Setup (one-time)
1) Create a virtual environment and install dependencies (Windows PowerShell):
```
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r ML/requirements.txt
```

On macOS/Linux:
```
python3 -m venv .venv
source .venv/bin/activate
pip install -r ml/requirements.txt
```

Data expectations
- Place raw training inputs under `ML/ML Data/`. The loader will scan recursively for `.parquet`, `.csv`, `.csv.gz`.
- The script performs minimal normalization; full schema compliance will be implemented in the next passes per `docs/Internal/ML/DataContracts.md`.

Run a small-sample training (fast, offline)
```
python ml/scripts/train_pyod.py --input "ML/ML Data" --outdir models/fraud/dev --limit 20000 --date 2025-11-07
```
Options:
- `--input`: folder with raw data files
- `--outdir`: artifacts destination (created if missing)
- `--limit`: optional row cap for quick runs
- `--date`: tag for artifacts subfolder (defaults to today)

Outputs
- `models/fraud/dev/<date>/model.pkl` — PyOD IsolationForest model
- `models/fraud/dev/<date>/feature_manifest.json` — selected features and dtypes
- `models/fraud/dev/<date>/trained_fraud_model.json` — metadata + placeholder metrics and strict shadow-mode gate (blocking must remain off)

Notes / Roadmap alignment
- This is PR1 (Foundations) in the ML Part 3 plan. Next steps:
  - Implement formal schema normalization to `data/training/YYYY-MM-DD` with `schema_version` metadata.
  - Add enrichment loaders (Tor/cloud/ASN) and weak supervision label functions.
  - Introduce TabPFN supervised baseline on silver labels and full evaluation harness.

Safety & Privacy
- The loader drops columns that look like raw identifiers (e.g., `ip`, `user_agent`, `gaid/idfa`, `device_id`).
- The artifacts explicitly set `shadow_mode: true` and include degenerate-metric guards so the backend will not block based on this model.

Troubleshooting
- If you encounter dependency issues on Windows, ensure Visual C++ Build Tools are installed for numpy/scikit-learn wheels.
- For very large datasets, use `--limit` during local runs and let nightly jobs process full partitions.
