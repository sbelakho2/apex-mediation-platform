import argparse
import json
import os
import shutil
import tarfile
import tempfile
import zipfile
from datetime import UTC, datetime

import numpy as np
import pandas as pd

# Optional dependency: TabPFN requires PyTorch and downloads a pretrained model.
# Install (CPU) in a venv if needed:
#   pip install torch --index-url https://download.pytorch.org/whl/cpu
#   pip install tabpfn
# This script generates weak labels from TabPFN predictions to be consumed by
# supervised learners (e.g., train_supervised_logreg.py) as additional signals.


def _load_tabpfn():
    try:
        from tabpfn import TabPFNClassifier  # type: ignore
    except Exception as e:  # pragma: no cover - import-time guidance
        raise RuntimeError(
            "TabPFN is not installed. Install torch + tabpfn (see script header)."
        ) from e
    return TabPFNClassifier


def _maybe_extract_archives(input_path: str) -> str:
    p = os.path.abspath(input_path)
    if os.path.isfile(p):
        return os.path.dirname(p)
    # Directory path: copy to tmp and extract archives found
    tmpdir = tempfile.mkdtemp(prefix="tabpfn_extract_")
    for root, _, files in os.walk(p):
        for f in files:
            src = os.path.join(root, f)
            rel = os.path.relpath(src, p)
            dest = os.path.join(tmpdir, rel)
            os.makedirs(os.path.dirname(dest), exist_ok=True)
            shutil.copy2(src, dest)
    # Extract archives under tmpdir
    for root, _, files in os.walk(tmpdir):
        for f in files:
            fp = os.path.join(root, f)
            lower = f.lower()
            try:
                if lower.endswith('.zip'):
                    with zipfile.ZipFile(fp, 'r') as zf:
                        zf.extractall(root)
                    os.remove(fp)
                elif lower.endswith('.tar') or lower.endswith('.tar.gz') or lower.endswith('.tgz'):
                    with tarfile.open(fp, 'r:*') as tf:
                        tf.extractall(root)
                    os.remove(fp)
            except Exception as e:
                print(f"Warning: failed to extract {fp}: {e}")
    return tmpdir


def _find_parquet(base_dir: str) -> str | None:
    candidates = [os.path.join(base_dir, 'features.parquet')]
    for c in candidates:
        if os.path.exists(c):
            return c
    for root, _, files in os.walk(base_dir):
        for f in files:
            if f.lower().endswith('.parquet'):
                return os.path.join(root, f)
    return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--in-parquet", required=False, help="Path to features.parquet from prepare_data.py")
    ap.add_argument("--input", required=False, help="Directory containing data (archives allowed) or a parquet file")
    ap.add_argument("--out-dir", required=False, default=None)
    ap.add_argument("--contamination", type=float, default=0.05, help="Expected fraud rate for weak labels")
    ap.add_argument("--max-rows", type=int, default=250_000, help="Optional cap to bound inference time")
    ap.add_argument("--label-col", default=None, help="Optional ground-truth label column (0/1) if available for calibration diagnostics")
    ap.add_argument("--drop-cols", default="ip,user_id,gaid,idfa,ifa,adid", help="Comma-separated columns to drop for privacy if present")
    ap.add_argument("--date-col", default=None, help="Optional datetime column name for filtering")
    ap.add_argument("--date-start", default=None, help="Inclusive start date (YYYY-MM-DD)")
    ap.add_argument("--date-end", default=None, help="Inclusive end date (YYYY-MM-DD)")
    args = ap.parse_args()

    if args.out_dir is None:
        args.out_dir = os.path.join("models", "fraud", "dev", datetime.now(UTC).strftime("%Y%m%d"))
    os.makedirs(args.out_dir, exist_ok=True)

    # Resolve input parquet
    parquet_path = None
    cleanup_dir = None
    if args.in_parquet:
        parquet_path = os.path.abspath(args.in_parquet)
    elif args.input:
        base = os.path.abspath(args.input)
        if os.path.isdir(base):
            extracted = _maybe_extract_archives(base)
            cleanup_dir = extracted if extracted.startswith(tempfile.gettempdir()) else None
            fp = _find_parquet(extracted)
            parquet_path = fp
        else:
            parquet_path = base
    else:
        raise SystemExit("Provide --in-parquet or --input")

    if parquet_path is None or not os.path.exists(parquet_path):
        raise SystemExit("Could not locate a parquet file under input")

    try:
        df = pd.read_parquet(parquet_path)
    finally:
        if cleanup_dir and os.path.exists(cleanup_dir):
            shutil.rmtree(cleanup_dir, ignore_errors=True)

    # Privacy guard: drop configured columns if present and known labels/scores
    drop_set = set(c.strip() for c in (args.drop_cols or '').split(',') if c.strip())
    drop_set.update({"label", "label_weak", "label_weak_tabpfn", "score", "score_tabpfn"})
    keep_cols = [c for c in df.columns if c not in drop_set]
    df = df[keep_cols]

    # Optional date filtering
    if args.date_col and args.date_col in df.columns and (args.date_start or args.date_end):
        col = pd.to_datetime(df[args.date_col], errors="coerce")
        mask = pd.Series([True] * len(df))
        if args.date_start:
            mask &= col >= pd.to_datetime(args.date_start)
        if args.date_end:
            mask &= col <= pd.to_datetime(args.date_end) + pd.Timedelta(days=1) - pd.Timedelta(milliseconds=1)
        df = df[mask]

    # Optional max-rows cap
    if len(df) > args.max_rows:
        df = df.sample(args.max_rows, random_state=42)

    feature_cols = [c for c in df.columns if c not in ({args.label_col} if args.label_col else set())]
    X = df[feature_cols].to_numpy(dtype=np.float32)

    # Load TabPFN pre-trained classifier (fast few-shot tabular model)
    TabPFNClassifier = _load_tabpfn()
    clf = TabPFNClassifier(device="cpu")

    # TabPFN expects y during fit; for unsupervised weak-labeling, we provide dummy labels
    y_dummy = np.zeros((X.shape[0],), dtype=np.int64)
    clf.fit(X, y_dummy)  # trains a calibrator around the pre-trained prior; cheap
    proba = clf.predict_proba(X)[:, 1]  # probability of class 1 (fraud)

    # Convert probabilities to weak labels by thresholding the top contamination fraction
    threshold = float(np.quantile(proba, 1.0 - args.contamination))
    label_weak_tabpfn = (proba >= threshold).astype(np.int64)

    out = pd.DataFrame({
        "score_tabpfn": proba,
        "label_weak_tabpfn": label_weak_tabpfn,
    })

    out_path = os.path.join(args.out_dir, "tabpfn_scores.parquet")
    out.to_parquet(out_path, index=False)

    meta = {
        "generated_at": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
        "model": "tabpfn",
        "contamination": float(args.contamination),
        "input": os.path.abspath(parquet_path),
        "rows": int(out.shape[0]),
        "threshold": float(threshold),
        "feature_cols": feature_cols,
        "max_rows": int(args.max_rows),
        "label_col": args.label_col,
        "date_filter": {
            "col": args.date_col,
            "start": args.date_start,
            "end": args.date_end,
        },
        "dropped_cols": sorted(list(drop_set)),
    }
    with open(os.path.join(args.out_dir, "tabpfn_meta.json"), "w", encoding="utf-8") as fh:
        json.dump(meta, fh, indent=2)

    print("Wrote:", out_path)


if __name__ == "__main__":
    main()
