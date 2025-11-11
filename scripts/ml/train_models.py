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
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    config = TrainingConfig(
        dataset_path=args.dataset,
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

    artifacts = train_models(config)
    manifest_path = config.output_dir / "training_manifest.json"

    print(json.dumps({"run_id": artifacts.run_id, "manifest": str(manifest_path)}, indent=2))


if __name__ == "__main__":
    main()
