#!/usr/bin/env python3
"""Prepare feature store datasets from enrichment manifests."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
ML_SRC = REPO_ROOT / "ML" / "src"
if str(ML_SRC) not in sys.path:
    sys.path.insert(0, str(ML_SRC))

from ml_pipelines.feature_store.offline_builder import OfflineFeatureBuilder
from ml_pipelines.feature_store.online_calculator import OnlineFeatureCalculator


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build feature store artifacts from enrichment data")
    parser.add_argument(
        "--enrichment-root",
        type=Path,
        default=Path("data/enrichment"),
        help="Root path that contains enrichment manifests (default: data/enrichment)",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("data/enrichment/features/latest"),
        help="Directory to write parquet/csv/schema outputs",
    )
    parser.add_argument(
        "--retention-days",
        type=int,
        default=365,
        help="Retention window for enrichment runs (default: 365 days)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Load manifests and validate without writing artifacts",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    builder = OfflineFeatureBuilder(args.enrichment_root)
    dataset = builder.build(args.output, retention_days=args.retention_days)

    if args.dry_run:
        # Validate we can serve features without writing to disk by instantiating the online calculator
        OnlineFeatureCalculator(dataset.frame)
        return 0

    calculator = OnlineFeatureCalculator(dataset.frame)
    sample_ips = dataset.frame["network"].head(5).tolist()
    for entry in sample_ips:
        ip = entry.split("/")[0]
        calculator.lookup(ip)
    return 0


if __name__ == "__main__":
    sys.exit(main())
