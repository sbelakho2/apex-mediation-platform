#!/usr/bin/env python3
"""
check_manifests.py — Enforce single source of truth (SoT) for manifest files (FIX-06)

Fails when files that look like manifests (name contains 'manifest' and ends with .json)
exist outside whitelisted directories.

Whitelisted roots:
  - models/**
  - data/enrichment/**
  - data/weak-supervision/**
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import Iterable, List


WHITELIST = (
    "models",
    "data/enrichment",
    "data/weak-supervision",
)


def looks_like_manifest(p: Path) -> bool:
    name = p.name.lower()
    return name.endswith(".json") and "manifest" in name


def is_whitelisted(p: Path, root: Path) -> bool:
    rel = p.relative_to(root)
    # Allow only specific top-level paths
    for wl in WHITELIST:
        if str(rel).startswith(wl + "/") or str(rel) == wl:
            return True
    return False


def find_violations(root: Path) -> List[Path]:
    bad: List[Path] = []
    for p in root.rglob("*.json"):
        if looks_like_manifest(p) and not is_whitelisted(p, root):
            bad.append(p)
    return bad


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Fail if manifest-like files exist outside whitelisted directories")
    ap.add_argument("--root", default=".", help="Repository root to scan (default: .)")
    args = ap.parse_args(argv)

    root = Path(args.root).resolve()
    violations = find_violations(root)
    if violations:
        print("Found non-whitelisted manifest files:", file=sys.stderr)
        for v in violations:
            print(f"  - {v}", file=sys.stderr)
        return 1
    print("No manifest SoT violations detected")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
