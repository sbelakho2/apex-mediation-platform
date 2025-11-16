FIX‑06 — Validation & Final Sign‑off

Scope
- Data & ML Pipeline Hardening across `ML/**`, `data/**`, `models/**`, and `.github/workflows`.

Required checks (configure in GitHub → Settings → Branches → Branch protection)
- [ ] ML PR Fast Lane workflow is a required status check
  - Workflow file: `.github/workflows/ml-pr.yml`
- [ ] Reviewers required: at least 1 code owner for ML or Data paths

Operational cadences
- [ ] Nightly artifacts from “ML Nightly Pipeline” reviewed weekly
  - Location: GitHub Actions → ml-nightly → Artifacts `ml-nightly-artifacts`
  - Review for: manifest validation failures, FE/Train warnings, artifact sizes/anomalies

Verifications (local or CI)
1) CPU install and tests
```bash
python -m venv .venv && source .venv/bin/activate
pip install --upgrade pip
pip install -c ML/constraints.txt -r ML/requirements.txt
pytest ML/scripts/tests -q
```

2) Streaming FE + tiny train
```bash
python ML/scripts/feature_engineering.py --input data/training/latest --out-dir /tmp/fe \
  --input-format parquet --stream --validate-in --validate-out --validate-limit 500 || true
python ML/scripts/train_supervised_logreg.py --features /tmp/fe/features.parquet \
  --row-limit 500 --input-format parquet --out-dir /tmp/model --validate-features --validate-limit 500
```

3) Manifest integrity
```bash
python ML/scripts/manifest_tools.py scan data | head
for f in $(python ML/scripts/manifest_tools.py scan data); do \
  python ML/scripts/manifest_tools.py validate "$f"; done
```

Outcomes
- [x] CI lanes green for last 3 runs (PR and Nightly)
- [x] Dockerfile installs use `-c ML/constraints.txt`
- [x] ML quick‑start present at `ML/README.md`
- [x] CHANGELOG updated with FIX‑06 entry

Sign‑off
- Approver: ____________________   Date: __________
