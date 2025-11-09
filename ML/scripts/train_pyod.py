import argparse
import json
import os
import shutil
import tempfile
import tarfile
import zipfile
from datetime import UTC, datetime
from pathlib import Path

import numpy as np
import pandas as pd
from pyod.models.iforest import IForest
from pyod.models.copod import COPOD

# Train unsupervised anomaly detectors to generate weak labels from features.parquet.
# Outputs follow OUTPUT_SCHEMAS below to keep parquet consumers stable.

OUTPUT_SCHEMAS = {
    "anomaly_scores": ["score", "label_weak"],
    "weak_labels": ["label_weak"],
}


def _maybe_extract_archives(input_path: Path) -> Path:
    """If input_path is a directory, extract any .zip/.tar/.tar.gz inside to a temp dir and return a dir with contents.
    If input_path is a file, return its parent. Caller should clean up temp dir if returned path is under tmp."""
    if input_path.is_file():
        return input_path.parent
    # Directory: scan for archives and extract
    tmpdir = Path(tempfile.mkdtemp(prefix="pyod_extract_"))
    # Copy dir tree into tmpdir first to unify processing
    for root, _, files in os.walk(input_path):
        for f in files:
            src = Path(root) / f
            rel = src.relative_to(input_path)
            dest = tmpdir / rel
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(src, dest)
    # Extract archives in-place under tmpdir
    for p in list(tmpdir.rglob("*")):
        if not p.is_file():
            continue
        lower = p.name.lower()
        try:
            if lower.endswith(".zip"):
                with zipfile.ZipFile(p, 'r') as zf:
                    zf.extractall(p.parent)
                p.unlink(missing_ok=True)
            elif lower.endswith(".tar") or lower.endswith(".tar.gz") or lower.endswith(".tgz"):
                with tarfile.open(p, 'r:*') as tf:
                    tf.extractall(p.parent)
                p.unlink(missing_ok=True)
        except Exception as e:
            print(f"Warning: failed to extract {p}: {e}")
    return tmpdir


def _find_parquet(base: Path) -> Path | None:
    for name in ("features.parquet",):
        candidate = base / name
        if candidate.exists():
            return candidate
    for p in base.rglob("*.parquet"):
        return p
    return None


def build_arg_parser() -> argparse.ArgumentParser:
    ap = argparse.ArgumentParser()
    ap.add_argument("--in-parquet", required=False, help="Path to features.parquet from prepare_data.py")
    ap.add_argument("--input", required=False, help="Directory containing data (archives allowed) or a parquet file")
    ap.add_argument("--out-dir", required=False, default=None)
    ap.add_argument("--model", default="iforest", choices=["iforest", "copod"])
    ap.add_argument("--contamination", type=float, default=0.05, help="Expected fraud rate for weak labels")
    ap.add_argument("--limit", type=int, default=0, help="Optional row cap for fast dev runs")
    ap.add_argument("--drop-cols", default="ip,user_id,gaid,idfa,ifa,adid", help="Comma-separated columns to drop for privacy if present")
    ap.add_argument("--date-col", default=None, help="Optional datetime column name for filtering")
    ap.add_argument("--date-start", default=None, help="Inclusive start date (YYYY-MM-DD)")
    ap.add_argument("--date-end", default=None, help="Inclusive end date (YYYY-MM-DD)")
    return ap


def run(cli_args: list[str] | None = None) -> Path:
    args = build_arg_parser().parse_args(cli_args)

    if args.out_dir is None:
        args.out_dir = os.path.join("models", "fraud", "dev", datetime.now(UTC).strftime("%Y%m%d"))
    os.makedirs(args.out_dir, exist_ok=True)

    # Resolve input parquet
    parquet_path = None
    cleanup_dir = None
    if args.in_parquet:
        parquet_path = Path(args.in_parquet)
    elif args.input:
        base = Path(args.input)
        if base.is_dir():
            extracted = _maybe_extract_archives(base)
            cleanup_dir = extracted if str(extracted).startswith(tempfile.gettempdir()) else None
            parquet_path = _find_parquet(extracted)
        else:
            parquet_path = base
    else:
        raise SystemExit("Provide --in-parquet or --input")

    if parquet_path is None or not parquet_path.exists():
        raise SystemExit("Could not locate a parquet file under input")

    try:
        df = pd.read_parquet(parquet_path)
    finally:
        if cleanup_dir and Path(cleanup_dir).exists():
            shutil.rmtree(cleanup_dir, ignore_errors=True)

    # Privacy guard: drop configured columns if present
    drop_cols = [c.strip() for c in (args.drop_cols or "").split(",") if c.strip()]
    for c in drop_cols:
        if c in df.columns:
            df = df.drop(columns=[c])

    # Optional date filtering
    if args.date_col and args.date_col in df.columns and (args.date_start or args.date_end):
        col = pd.to_datetime(df[args.date_col], errors="coerce")
        mask = pd.Series([True] * len(df))
        if args.date_start:
            mask &= col >= pd.to_datetime(args.date_start)
        if args.date_end:
            mask &= col <= pd.to_datetime(args.date_end) + pd.Timedelta(days=1) - pd.Timedelta(milliseconds=1)
        df = df[mask]

    # Optional limit
    if args.limit and args.limit > 0:
        df = df.head(args.limit)

    feature_cols = [c for c in df.columns if c not in ("label",)]
    X = df[feature_cols].to_numpy(dtype=np.float32)

    if args.model == "iforest":
        clf = IForest(contamination=args.contamination, random_state=42)
    else:
        clf = COPOD()  # parameter-free

    clf.fit(X)
    scores = clf.decision_function(X)  # higher scores = more abnormal in PyOD convention

    # Convert scores to weak labels by thresholding top contamination fraction
    threshold = np.quantile(scores, 1.0 - args.contamination)
    label_weak = (scores >= threshold).astype(int)

    out_scores = pd.DataFrame({
        "score": scores,
        "label_weak": label_weak,
    })
    out_scores = out_scores[OUTPUT_SCHEMAS["anomaly_scores"]]
    out_scores_path = os.path.join(args.out_dir, "anomaly_scores.parquet")
    out_scores.to_parquet(out_scores_path, index=False)

    # Also write a lightweight weak labels parquet for downstream supervised training
    pd.DataFrame({"label_weak": label_weak}, columns=OUTPUT_SCHEMAS["weak_labels"]).to_parquet(
        os.path.join(args.out_dir, "weak_labels.parquet"),
        index=False,
    )

    meta = {
        "generated_at": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
        "model": args.model,
        "contamination": args.contamination,
        "input": str(parquet_path.resolve()),
        "rows": int(out_scores.shape[0]),
        "threshold": float(threshold),
        "feature_cols": feature_cols,
        "date_filter": {
            "col": args.date_col,
            "start": args.date_start,
            "end": args.date_end,
        },
        "limit": args.limit,
        "dropped_cols": [c for c in drop_cols if c],
        "schemas": OUTPUT_SCHEMAS,
    }
    with open(os.path.join(args.out_dir, "pyod_meta.json"), "w", encoding="utf-8") as fh:
        json.dump(meta, fh, indent=2)

    print("Wrote:", out_scores_path)
    return Path(args.out_dir)


if __name__ == "__main__":
    run()
