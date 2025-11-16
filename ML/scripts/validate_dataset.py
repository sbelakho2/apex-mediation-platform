#!/usr/bin/env python3
"""
validate_dataset.py — Schema validation CLI for datasets (FIX-06)

Validates parquet/csv/jsonl datasets against canonical schemas (fraud/ctr)
using Pydantic v2 models. Produces a machine-readable JSON report with
diagnostics and a concise console summary. Exits non-zero when the number of
validation errors exceeds --fail-threshold.

Usage examples:
  python ML/scripts/validate_dataset.py \
    --schema fraud --format parquet --path data/features.parquet \
    --limit 10000 --report artifacts/fraud_features.diagnostics.json

  python ML/scripts/validate_dataset.py \
    --schema ctr --format csv --path data/ctr.csv \
    --limit 5000 --fail-threshold 0
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional


# Local imports from ML/scripts/lib without requiring package installation
def _ensure_lib_path() -> None:
    import sys as _sys
    from pathlib import Path as _P

    this = _P(__file__).resolve()
    lib_dir = this.parent / "lib"
    if str(lib_dir) not in _sys.path:
        _sys.path.insert(0, str(lib_dir))


_ensure_lib_path()

from lib.schema import diagnostics, iter_validate_rows  # type: ignore
from lib.schema import SchemaName  # type: ignore
from lib.loader import (  # type: ignore
    iter_parquet,
    iter_csv,
    iter_jsonl,
)

import pandas as pd


SUPPORTED_FORMATS = {"parquet", "csv", "jsonl"}


@dataclass
class SampleError:
    row_index: int
    error: str


def _read_sample(path: Path, fmt: str, limit: int) -> pd.DataFrame:
    """Read up to `limit` rows using streaming iterators for the given format."""
    rows = max(1, int(limit))
    chunks: List[pd.DataFrame] = []
    total = 0

    if fmt == "parquet":
        iterator = iter_parquet(path)
    elif fmt == "csv":
        iterator = iter_csv(path)
    elif fmt == "jsonl":
        iterator = iter_jsonl(path)
    else:
        raise SystemExit(f"Unsupported format: {fmt}")

    for ch in iterator:
        need = rows - total
        if need <= 0:
            break
        if ch.shape[0] > need:
            ch = ch.iloc[:need]
        chunks.append(ch)
        total += ch.shape[0]
        if total >= rows:
            break

    if not chunks:
        return pd.DataFrame()
    return pd.concat(chunks, ignore_index=True)


def _validate_df(df: pd.DataFrame, schema: SchemaName, limit: Optional[int], max_examples: int = 20):
    error_count = 0
    examples: List[SampleError] = []
    for idx, err in iter_validate_rows(df, schema=schema, limit=limit):
        if err is not None:
            error_count += 1
            if len(examples) < max_examples:
                examples.append(SampleError(row_index=int(idx), error=str(err)))
    return error_count, examples


def build_arg_parser() -> argparse.ArgumentParser:
    ap = argparse.ArgumentParser(description="Validate dataset against canonical schemas and emit diagnostics")
    ap.add_argument("--schema", required=True, choices=["fraud", "ctr"], help="Schema to validate against")
    ap.add_argument("--format", required=True, choices=sorted(SUPPORTED_FORMATS), help="Input format")
    ap.add_argument("--path", required=True, help="Path to the input dataset file")
    ap.add_argument("--limit", type=int, default=10000, help="Validate up to N rows (default: 10000)")
    ap.add_argument("--fail-threshold", type=int, default=0, help="Exit non-zero if errors exceed this number (default: 0)")
    ap.add_argument("--report", type=str, default=None, help="Write JSON report to this path (optional)")
    return ap


def main(argv: Optional[List[str]] = None) -> int:
    args = build_arg_parser().parse_args(argv)

    path = Path(args.path)
    if not path.exists():
        print(f"error: file not found: {path}", file=sys.stderr)
        return 2

    fmt = str(args.format).lower()
    if fmt not in SUPPORTED_FORMATS:
        print(f"error: unsupported format: {fmt}", file=sys.stderr)
        return 2

    schema: SchemaName = args.schema  # type: ignore[assignment]
    sample_limit = max(1, int(args.limit))
    t0 = time.time()
    df = _read_sample(path, fmt, sample_limit)
    read_secs = time.time() - t0

    if df.empty:
        print("warn: dataset is empty or no rows read for sample; nothing to validate")

    t1 = time.time()
    error_count, examples = _validate_df(df, schema=schema, limit=len(df))
    validate_secs = time.time() - t1

    diag = diagnostics(df) if not df.empty else {}

    report: Dict[str, Any] = {
        "schema": schema,
        "format": fmt,
        "path": str(path),
        "sampled_rows": int(len(df)),
        "error_count": int(error_count),
        "examples": [asdict(e) for e in examples],
        "diagnostics": diag,
        "timing": {
            "read_seconds": round(read_secs, 3),
            "validate_seconds": round(validate_secs, 3),
        },
    }

    if args.report:
        outp = Path(args.report)
        outp.parent.mkdir(parents=True, exist_ok=True)
        outp.write_text(json.dumps(report, indent=2))

    # Console summary
    print(
        f"Validated schema={schema} format={fmt} rows={len(df)} errors={error_count} "
        f"(read {read_secs:.2f}s, validate {validate_secs:.2f}s)"
    )

    return 1 if error_count > int(args.fail_threshold) else 0


if __name__ == "__main__":
    raise SystemExit(main())
