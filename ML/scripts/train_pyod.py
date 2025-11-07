#!/usr/bin/env python3
"""
Minimal, offline PyOD baseline trainer for the Fraud model (PR1 — Foundations).
- Scans an input directory recursively for parquet/csv/csv.gz files.
- Loads data into a DataFrame, applies basic privacy guards (drops raw IDs/UA/IP if present).
- Selects a small numeric feature set (auto-detected) and trains an IsolationForest model via PyOD.
- Exports artifacts to models/fraud/dev/<date>/:
  - model.pkl (joblib dump)
  - feature_manifest.json (selected features + dtypes)
  - trained_fraud_model.json (metrics placeholders + enforced shadow mode)

Usage (Windows PowerShell example):
  python ml/scripts/train_pyod.py --input "ML/ML Data" --outdir models/fraud/dev --limit 20000 --date 2025-11-07

Note: This is a starter script. Full schema normalization, enrichment, weak labels, and TabPFN
      training will be added in subsequent passes per docs/Internal/ML/DataContracts.md and ML_TRAINING.md.
"""
from __future__ import annotations
import argparse
import gzip
import io
import json
import os
import sys
import datetime as dt
from typing import List, Tuple

import joblib  # type: ignore
import numpy as np
import pandas as pd
from pyod.models.iforest import IForest  # type: ignore


RAW_ID_COLUMNS = {
    "ip", "user_agent", "ua", "gaid", "idfa", "ifa", "device_id", "android_id", "advertising_id"
}


def find_files(root: str) -> List[str]:
    exts = (".parquet", ".csv", ".csv.gz")
    paths: List[str] = []
    for base, _, files in os.walk(root):
        for f in files:
            lf = f.lower()
            if lf.endswith(exts):
                paths.append(os.path.join(base, f))
    return sorted(paths)


def read_any(path: str, limit: int | None = None) -> pd.DataFrame:
    lower = path.lower()
    if lower.endswith(".parquet"):
        df = pd.read_parquet(path)
    elif lower.endswith(".csv"):
        df = pd.read_csv(path)
    elif lower.endswith(".csv.gz"):
        with gzip.open(path, "rt", encoding="utf-8", errors="ignore") as f:
            df = pd.read_csv(f)
    else:
        raise ValueError(f"Unsupported file type: {path}")
    if limit is not None and len(df) > limit:
        df = df.iloc[:limit].copy()
    return df


def load_dataset(input_dir: str, limit: int | None = None, per_file_cap: int | None = None) -> pd.DataFrame:
    paths = find_files(input_dir)
    if not paths:
        raise FileNotFoundError(f"No data files found in: {input_dir}")
    frames: List[pd.DataFrame] = []
    rows_left = limit
    for p in paths:
        cap = None
        if per_file_cap is not None:
            cap = per_file_cap
        if rows_left is not None:
            cap = min(cap or rows_left, rows_left)
        df = read_any(p, limit=cap)
        frames.append(df)
        if rows_left is not None:
            rows_left -= len(df)
            if rows_left <= 0:
                break
    if not frames:
        raise RuntimeError("No frames loaded")
    df = pd.concat(frames, axis=0, ignore_index=True)
    return df


def privacy_guard(df: pd.DataFrame) -> pd.DataFrame:
    cols_to_drop = [c for c in df.columns if c.lower() in RAW_ID_COLUMNS]
    if cols_to_drop:
        df = df.drop(columns=cols_to_drop, errors='ignore')
    return df


def select_numeric_features(df: pd.DataFrame, max_features: int = 64) -> Tuple[pd.DataFrame, List[str]]:
    # Auto-select numeric columns, drop near-constant columns.
    num_df = df.select_dtypes(include=[np.number]).copy()
    # Fill NaNs with zeros for anomaly models
    num_df = num_df.replace([np.inf, -np.inf], np.nan).fillna(0.0)
    # Drop columns with zero variance
    variances = num_df.var(axis=0)
    keep = variances[variances > 0.0].index.tolist()
    num_df = num_df[keep]
    # Cap the number of features to keep runtime small
    if len(num_df.columns) > max_features:
        num_df = num_df.iloc[:, :max_features]
    return num_df, list(num_df.columns)


def ensure_dir(path: str) -> None:
    os.makedirs(path, exist_ok=True)


def export_artifacts(outdir: str, features: List[str], model: IForest, meta: dict) -> None:
    ensure_dir(outdir)
    # Model
    joblib.dump(model, os.path.join(outdir, "model.pkl"))
    # Feature manifest
    feat = {
        "features": features,
        "dtypes": {f: "float64" for f in features},
        "train_date": meta.get("date"),
        "schema_version": "fraud.schema.v1.0.0",
    }
    with open(os.path.join(outdir, "feature_manifest.json"), "w", encoding="utf-8") as f:
        json.dump(feat, f, indent=2)
    # trained_fraud_model.json — include conservative metrics to force shadow mode until real eval
    metrics = {
        "model_type": "pyod_isolation_forest",
        "version": meta.get("version", "dev"),
        "train_date": meta.get("date"),
        "schema_version": "fraud.schema.v1.0.0",
        # Conservative placeholders; backend safety already enforces shadow if degenerate
        "auc": 0.5,
        "precision": 0.0,
        "recall": 0.0,
        "thresholds": {"default": 1.0},
        "shadow_mode": True,
        "notes": "Placeholder metrics; do not use for blocking. Replace after proper evaluation.",
    }
    with open(os.path.join(outdir, "trained_fraud_model.json"), "w", encoding="utf-8") as f:
        json.dump(metrics, f, indent=2)


def train_isoforest(X: pd.DataFrame, random_state: int = 42) -> IForest:
    # Use small sample size assumptions; keep defaults light.
    model = IForest(contamination=0.05, random_state=random_state)
    model.fit(X.values)
    return model


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", required=True, help="Input directory with raw data files (ML/ML Data)")
    ap.add_argument("--outdir", required=True, help="Base output directory (e.g., models/fraud/dev)")
    ap.add_argument("--limit", type=int, default=None, help="Row cap for fast runs (optional)")
    ap.add_argument("--date", type=str, default=None, help="Artifact date folder (YYYY-MM-DD). Defaults to today.")
    args = ap.parse_args()

    date_str = args.date or dt.date.today().isoformat()
    out = os.path.join(args.outdir, date_str)

    print(f"[train_pyod] Loading data from: {args.input}")
    try:
        df = load_dataset(args.input, limit=args.limit, per_file_cap=min(args.limit or 1000000, 50000))
    except Exception as e:
        print(f"Failed to load dataset: {e}", file=sys.stderr)
        return 2

    print(f"[train_pyod] Loaded rows: {len(df):,} cols: {len(df.columns)}")
    df = privacy_guard(df)
    X, feat_names = select_numeric_features(df)
    if X.empty or len(feat_names) == 0:
        print("No numeric features found after filtering.", file=sys.stderr)
        return 3

    print(f"[train_pyod] Selected features: {len(feat_names)}")
    model = train_isoforest(X)

    meta = {"date": date_str, "version": "dev"}
    export_artifacts(out, feat_names, model, meta)
    print(f"[train_pyod] Artifacts written to: {out}")
    print("[train_pyod] NOTE: trained_fraud_model.json contains placeholder metrics; model is shadow-only.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
