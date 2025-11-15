"""CLI for downloading network enrichment data sources.

Adds optional manifest validation to satisfy FIX-06 preflight checks.
Use --validate-manifests to validate any manifest JSON files under the
output directory prior to fetching.
"""

from __future__ import annotations

import argparse
from pathlib import Path
from typing import Sequence

from ml_pipelines.enrichment import DEFAULT_SOURCE_NAMES, fetch_sources
from lib.manifest import validate_manifest, scan_for_manifests, ManifestError


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
    parser.add_argument(
        "--validate-manifests",
        action="store_true",
        help=(
            "Validate manifest JSON files under the output directory before fetching. "
            "Fails fast on missing files or checksum mismatch (strict)."
        ),
    )
    return parser.parse_args(argv)


def run(argv: Sequence[str] | None = None) -> None:
    args = parse_args(argv)
    include_vpn = None
    if args.include_vpn:
        include_vpn = True
    elif args.no_vpn:
        include_vpn = False

    # Optional manifest preflight validation
    if args.validate_manifests:
        manifests = scan_for_manifests(args.output)
        for mpath in manifests:
            try:
                validate_manifest(mpath)
                # simple progress output without adding a logging dep
                print(f"[OK] manifest: {mpath}")
            except ManifestError as e:
                raise SystemExit(f"[ERROR] manifest invalid: {mpath}: {e}")

    fetch_sources(
        args.output,
        date_override=args.date,
        sources=args.sources,
        include_vpn_lists=include_vpn,
        force=args.force,
    )


if __name__ == "__main__":  # pragma: no cover - CLI entry point
    run()
