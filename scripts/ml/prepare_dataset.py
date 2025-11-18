#!/usr/bin/env python3
"""Prepare feature store datasets from enrichment manifests."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

DEFAULT_SAMPLE_COLUMN_CANDIDATES = ("network", "ip", "ip_cidr", "ip_address")

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
    parser.add_argument(
        "--columns",
        type=str,
        default=None,
        help="Comma-separated expected columns in the dataset; validate presence (e.g., 'ip,asn,city').",
    )
    parser.add_argument(
        "--column-map",
        type=Path,
        default=None,
        help="Optional JSON file mapping alternate column names to canonical ones (e.g., {'ip_address':'ip'}).",
    )
    parser.add_argument(
        "--sample-network-column",
        type=str,
        default="network",
        help="Column to use for sample lookups instead of hard-coded 'network' (default: network)",
    )
    parser.add_argument(
        "--sample-column-fallbacks",
        type=str,
        default=None,
        help=(
            "Comma-separated list of additional columns that may contain sample IPs/CIDRs. "
            "Each entry is appended to the built-in fallbacks (network, ip, ip_cidr, ip_address)."
        ),
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    builder = OfflineFeatureBuilder(args.enrichment_root)
    dataset = builder.build(args.output, retention_days=args.retention_days)

    # Normalize/validate columns
    frame = dataset.frame
    if args.column_map and args.column_map.exists():
        import json
        mapping = json.loads(args.column_map.read_text())
        # Rename columns present in the mapping
        rename = {src: dst for src, dst in mapping.items() if src in frame.columns}
        if rename:
            frame = frame.rename(columns=rename)

    if args.columns:
        expected = [c.strip() for c in args.columns.split(",") if c.strip()]
        missing = [c for c in expected if c not in frame.columns]
        extras = []  # We don't fail on extras, but could list them
        if missing:
            print(
                "ERROR: Missing expected columns: " + ", ".join(missing),
                file=sys.stderr,
            )
            print("Available columns: " + ", ".join(frame.columns), file=sys.stderr)
            return 2

    if args.dry_run:
        # Validate we can serve features without writing to disk by instantiating the online calculator
        OnlineFeatureCalculator(frame)
        return 0

    calculator = OnlineFeatureCalculator(frame)
    explicit = [args.sample_network_column] if args.sample_network_column else []
    custom_fallbacks = []
    if args.sample_column_fallbacks:
        custom_fallbacks = [c.strip() for c in args.sample_column_fallbacks.split(",") if c.strip()]
    candidates = []
    for name in explicit + custom_fallbacks + list(DEFAULT_SAMPLE_COLUMN_CANDIDATES):
        if name and name not in candidates:
            candidates.append(name)

    sample_column = next((name for name in candidates if name in frame.columns), None)
    if not sample_column:
        print(
            "WARN: No sample column candidates found in dataset; skipping lookup smoke test.",
            file=sys.stderr,
        )
        return 0

    if sample_column != args.sample_network_column:
        print(
            f"INFO: sample column '{args.sample_network_column}' missing; using '{sample_column}' as fallback",
            file=sys.stderr,
        )

    sample_ips = frame[sample_column].head(5).tolist()
    for entry in sample_ips:
        ip = entry.split("/")[0]
        calculator.lookup(ip)
    return 0


if __name__ == "__main__":
    sys.exit(main())
