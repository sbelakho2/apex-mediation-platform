#!/usr/bin/env python3
"""
Manifest tools (FIX-06): compute checksum, validate, refresh, and scan manifests.

Usage examples:
  python ML/scripts/manifest_tools.py compute-checksum data/enrichment/cache/ip_enrichment.csv
  python ML/scripts/manifest_tools.py refresh data/enrichment/ip_enrichment_manifest.json
  python ML/scripts/manifest_tools.py validate data/enrichment/ip_enrichment_manifest.json
  python ML/scripts/manifest_tools.py scan data
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import List

from lib.manifest import (
    compute_sha256,
    validate_manifest,
    refresh_manifest,
    scan_for_manifests,
    ManifestError,
)


def cmd_compute_checksum(args: argparse.Namespace) -> int:
    p = Path(args.file)
    if not p.exists():
        print(f"error: file not found: {p}", file=sys.stderr)
        return 2
    sha = compute_sha256(p)
    print(sha)
    return 0


def cmd_validate(args: argparse.Namespace) -> int:
    manifest = Path(args.manifest)
    try:
        validate_manifest(manifest, strict_checksum=not args.allow_missing_checksum)
        print(f"OK: {manifest}")
        return 0
    except ManifestError as e:
        print(f"invalid: {manifest}: {e}", file=sys.stderr)
        return 1


def cmd_refresh(args: argparse.Namespace) -> int:
    manifest = Path(args.manifest)
    try:
        m = refresh_manifest(manifest, version=args.version)
        print(f"updated: {manifest} -> version={m.version} sha256={m.sha256}")
        return 0
    except ManifestError as e:
        print(f"failed: {manifest}: {e}", file=sys.stderr)
        return 1


def cmd_scan(args: argparse.Namespace) -> int:
    root = Path(args.root)
    paths: List[Path] = scan_for_manifests(root)
    for p in paths:
        print(str(p))
    return 0


def build_parser() -> argparse.ArgumentParser:
    ap = argparse.ArgumentParser(prog="manifest_tools", description="Manifest maintenance utilities")
    sub = ap.add_subparsers(dest="cmd", required=True)

    p1 = sub.add_parser("compute-checksum", help="Compute sha256 for a data file")
    p1.add_argument("file", help="Path to data file")
    p1.set_defaults(func=cmd_compute_checksum)

    p2 = sub.add_parser("validate", help="Validate a manifest JSON and referenced file")
    p2.add_argument("manifest", help="Path to manifest JSON")
    p2.add_argument("--allow-missing-checksum", action="store_true", help="Do not fail if sha256 is missing")
    p2.set_defaults(func=cmd_validate)

    p3 = sub.add_parser("refresh", help="Compute checksum and update version/updated_at in a manifest")
    p3.add_argument("manifest", help="Path to manifest JSON")
    p3.add_argument("--version", help="Version string to set (defaults to ISO timestamp)")
    p3.set_defaults(func=cmd_refresh)

    p4 = sub.add_parser("scan", help="Scan a directory tree for manifest files")
    p4.add_argument("root", help="Directory to scan")
    p4.set_defaults(func=cmd_scan)

    return ap


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    return int(args.func(args))


if __name__ == "__main__":
    raise SystemExit(main())
