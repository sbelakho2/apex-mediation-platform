import argparse
import json
import os
import gzip
import bz2
import lzma
from datetime import datetime
from typing import Dict, Any, Iterable

import pandas as pd

# This script normalizes raw ML data under ML/ML Data into a tabular feature set
# matching backend/fraud/internal/ml/fraud_ml.go FeatureVector. It writes a
# parquet dataset and a small manifest with schema + counts.

FEATURE_COLUMNS = [
    "device_age", "device_ip_count", "device_app_count",
    "click_frequency", "session_duration", "time_between_clicks",
    "hour_of_day", "day_of_week", "is_weekend",
    "is_datacenter", "is_vpn", "is_proxy",
    "ua_length", "ua_entropy", "is_mobile_ua",
    "historical_fraud_rate", "conversion_rate",
]


def _open_any(path: str):
    if path.endswith(".gz"):
        return gzip.open(path, "rt", encoding="utf-8")
    if path.endswith(".bz2"):
        return bz2.open(path, "rt", encoding="utf-8")
    if path.endswith(".xz") or path.endswith(".lzma"):
        return lzma.open(path, "rt", encoding="utf-8")
    return open(path, "rt", encoding="utf-8")


def _iter_jsonl(paths: Iterable[str]):
    for p in paths:
        with _open_any(p) as fh:
            for line in fh:
                line = line.strip()
                if not line:
                    continue
                try:
                    yield json.loads(line)
                except json.JSONDecodeError:
                    continue


def _to_feature_row(ev: Dict[str, Any]) -> Dict[str, Any]:
    # Best-effort extraction; missing fields default sensibly.
    # This must remain aligned with Go FeatureVector.
    def g(*keys, default=0.0):
        cur = ev
        for k in keys:
            if not isinstance(cur, dict) or k not in cur:
                return default
            cur = cur[k]
        if cur is None:
            return default
        try:
            return float(cur)
        except Exception:
            return default

    fv = {
        "device_age": g("device", "age_days"),
        "device_ip_count": g("device", "unique_ip_count"),
        "device_app_count": g("device", "unique_app_count"),
        "click_frequency": g("behavior", "clicks_per_hour"),
        "session_duration": g("behavior", "avg_session_sec"),
        "time_between_clicks": g("behavior", "avg_time_between_clicks_sec"),
        "hour_of_day": g("time", "hour"),
        "day_of_week": g("time", "dow"),
        "is_weekend": g("time", "is_weekend"),
        "is_datacenter": g("network", "is_datacenter"),
        "is_vpn": g("network", "is_vpn"),
        "is_proxy": g("network", "is_proxy"),
        "ua_length": g("ua", "length"),
        "ua_entropy": g("ua", "entropy"),
        "is_mobile_ua": g("ua", "is_mobile"),
        "historical_fraud_rate": g("history", "fraud_rate"),
        "conversion_rate": g("history", "conversion_rate"),
    }
    # Optional label if present
    label = ev.get("label")  # 0/1 supervised labels when available
    if isinstance(label, (int, float)):
        fv["label"] = int(label)
    return fv


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--input-dir", default=os.path.join("ML", "ML Data"))
    ap.add_argument("--glob", default="*.jsonl*")
    ap.add_argument("--out-dir", default=os.path.join("models", "fraud", "dev", datetime.utcnow().strftime("%Y%m%d")))
    args = ap.parse_args()

    os.makedirs(args.out_dir, exist_ok=True)

    # Collect files
    paths = []
    for root, _dirs, files in os.walk(args.input_dir):
        for f in files:
            if f.startswith("."):
                continue
            if f.endswith(".jsonl") or f.endswith(".jsonl.gz") or f.endswith(".jsonl.bz2") or f.endswith(".jsonl.xz"):
                paths.append(os.path.join(root, f))

    rows = []
    for ev in _iter_jsonl(paths):
        rows.append(_to_feature_row(ev))

    if not rows:
        raise SystemExit("No rows parsed from input data")

    df = pd.DataFrame(rows)
    # Ensure all expected columns exist
    for c in FEATURE_COLUMNS:
        if c not in df.columns:
            df[c] = 0.0
    # Label may be missing (unsupervised phase possible)
    out_parquet = os.path.join(args.out_dir, "features.parquet")
    df.to_parquet(out_parquet, index=False)

    manifest = {
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "rows": int(df.shape[0]),
        "columns": list(df.columns),
        "feature_columns": FEATURE_COLUMNS,
        "has_label": "label" in df.columns,
        "source": os.path.abspath(args.input_dir),
    }
    with open(os.path.join(args.out_dir, "manifest.json"), "w", encoding="utf-8") as fh:
        json.dump(manifest, fh, indent=2)
    print("Wrote:", out_parquet)


if __name__ == "__main__":
    main()
