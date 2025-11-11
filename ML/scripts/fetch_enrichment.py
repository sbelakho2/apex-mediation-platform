"""CLI for downloading network enrichment data sources."""

from __future__ import annotations

import argparse
from pathlib import Path
from typing import Sequence

from ml_pipelines.enrichment import DEFAULT_SOURCE_NAMES, fetch_sources


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Fetch enrichment datasets with manifests")
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("data/enrichment"),
        help="Root output directory (defaults to data/enrichment)",
    )
    parser.add_argument(
        "--sources",
        nargs="*",
        default=list(DEFAULT_SOURCE_NAMES),
        help="Subset of sources to download (default: tor cloud ripe vpn)",
    )
    parser.add_argument(
        "--date",
        type=str,
        default=None,
        help="Optional YYYY-MM-DD override for the run date",
    )
    parser.add_argument(
        "--include-vpn",
        action="store_true",
        help="Force inclusion of VPN allow/block lists regardless of env flag",
    )
    parser.add_argument(
        "--no-vpn",
        action="store_true",
        help="Disable VPN list downloads regardless of env flag",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Re-download files even if they exist locally",
    )
    return parser.parse_args(argv)


def run(argv: Sequence[str] | None = None) -> None:
    args = parse_args(argv)
    include_vpn = None
    if args.include_vpn:
        include_vpn = True
    elif args.no_vpn:
        include_vpn = False

    fetch_sources(
        args.output,
        date_override=args.date,
        sources=args.sources,
        include_vpn_lists=include_vpn,
        force=args.force,
    )


if __name__ == "__main__":  # pragma: no cover - CLI entry point
    run()
