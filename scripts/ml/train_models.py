#!/usr/bin/env python3
"""CLI entrypoint for training fraud detection models."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys

import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT / "ML" / "src") not in sys.path:
    sys.path.insert(0, str(ROOT / "ML" / "src"))

from ml_pipelines.models import TrainingConfig, train_models  # noqa: E402


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Train fraud detection models with calibrated outputs.")
    parser.add_argument("dataset", type=Path, help="Path to the feature dataset (CSV or Parquet)")
    parser.add_argument("--output-root", type=Path, default=Path("models"), help="Directory to store model artifacts")
    parser.add_argument("--run-id", type=str, default=None, help="Override generated run id")
    parser.add_argument("--target", type=str, default="y_weak", help="Target column name")
    parser.add_argument("--weight", type=str, default="confidence", help="Optional confidence/weight column")
    parser.add_argument(
        "--feature",
        dest="feature_columns",
        action="append",
        help="Explicit feature column to include (repeatable). If omitted, numeric columns are inferred.",
    )
    parser.add_argument("--epochs", type=int, default=5, help="Training epochs for deep models")
    parser.add_argument("--batch-size", type=int, default=32, help="Batch size for deep models")
    parser.add_argument("--learning-rate", type=float, default=1e-3, help="Learning rate for deep models")
    parser.add_argument("--hidden-dim", type=int, default=32, help="Hidden dimension for deep models")
    parser.add_argument("--test-size", type=float, default=0.25, help="Validation split proportion")
    parser.add_argument("--random-state", type=int, default=42, help="Random seed")
    parser.add_argument("--dry-run", action="store_true", help="Parse config and dataset headers only; no training")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    dataset_path = args.dataset.expanduser().resolve()
    if not dataset_path.exists():
        print(f"ERROR: Dataset path does not exist: {dataset_path}", file=sys.stderr)
        sys.exit(2)
    if dataset_path.is_dir():
        print(f"ERROR: Dataset path points to a directory, expected file: {dataset_path}", file=sys.stderr)
        sys.exit(2)
    allowed_suffixes = {".csv", ".parquet", ".pq"}
    if dataset_path.suffix and dataset_path.suffix.lower() not in allowed_suffixes:
        print(
            f"WARNING: Unexpected dataset extension '{dataset_path.suffix}'. Supported: {', '.join(sorted(allowed_suffixes))}",
            file=sys.stderr,
        )
    config = TrainingConfig(
        dataset_path=dataset_path,
        output_root=args.output_root,
        run_id=args.run_id,
        target_column=args.target,
        weight_column=args.weight,
        feature_columns=args.feature_columns,
        epochs=args.epochs,
        batch_size=args.batch_size,
        learning_rate=args.learning_rate,
        hidden_dim=args.hidden_dim,
        test_size=args.test_size,
        random_state=args.random_state,
    )

    if args.dry_run:
        # Load only a small sample to validate headers without full training
        try:
            if dataset_path.suffix.lower() in (".parquet", ".pq"):
                df = pd.read_parquet(dataset_path)
            else:
                df = pd.read_csv(dataset_path, nrows=10)
            cols = list(df.columns)
        except Exception as e:
            print(f"ERROR: Failed to read dataset: {e}", file=sys.stderr)
            sys.exit(2)
        print(json.dumps({
            "ok": True,
            "dataset": str(dataset_path),
            "columns": cols,
            "rows_previewed": len(df)
        }, indent=2))
        return

    artifacts = train_models(config)
    manifest_path = config.output_dir / "training_manifest.json"

    print(json.dumps({"run_id": artifacts.run_id, "manifest": str(manifest_path)}, indent=2))


if __name__ == "__main__":
    main()
