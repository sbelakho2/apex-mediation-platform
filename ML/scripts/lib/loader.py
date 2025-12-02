"""
Streaming/Chunked data loaders (FIX-06)

Goals:
- Provide memory-safe iterators for CSV/TSV/JSONL using pandas chunks.
- Provide a Parquet streaming iterator using pyarrow.dataset when available.
- Offer simple knobs via environment variables to cap memory usage:
  - ML_MAX_RAM_FRACTION (default 0.5)
  - CHUNK_ROWS (default 100_000)

The primary interface is iterator-style functions that yield batches.
"""
from __future__ import annotations

from dataclasses import dataclass
import os
from pathlib import Path
from typing import Iterator, Iterable, Optional, Dict, Any, List, Tuple


def _env_float(key: str, dflt: float) -> float:
    try:
        v = float(os.getenv(key, str(dflt)))
        if v <= 0:
            return dflt
        return v
    except Exception:
        return dflt


def _env_int(key: str, dflt: int) -> int:
    try:
        v = int(os.getenv(key, str(dflt)))
        if v <= 0:
            return dflt
        return v
    except Exception:
        return dflt


def _default_chunk_rows() -> int:
    return _env_int("CHUNK_ROWS", 100_000)


def _max_ram_fraction() -> float:
    # Conservative default: use at most 50% of available RAM for a single loader iterator
    return max(0.1, min(0.9, _env_float("ML_MAX_RAM_FRACTION", 0.5)))


def _estimate_rows_for_budget(file_path: Path, default_rows: int) -> int:
    """
    Heuristic: if file size is known, assume ~100 bytes/row for CSV/JSONL and
    ~300 bytes/row for Parquet (varies widely). This only nudges chunk size down
    when files are very large; users can override via CHUNK_ROWS.
    """
    try:
        size = file_path.stat().st_size
    except Exception:
        return default_rows

    # Choose per-format baseline later if needed; keep simple ~100 bytes/row.
    approx_row_size = 100
    approx_rows_total = max(1, size // approx_row_size)

    # Use fraction of RAM as a soft guideline. Without psutil, we cannot read total RAM portably,
    # so just cap the per-chunk rows to a fraction of file rows to avoid huge chunks.
    frac = _max_ram_fraction()
    suggested = int(max(10_000, min(default_rows, approx_rows_total * frac * 0.05)))
    return suggested


@dataclass(frozen=True)
class CsvOptions:
    delimiter: str = ","
    dtypes: Optional[Dict[str, Any]] = None
    columns: Optional[List[str]] = None
    chunksize: Optional[int] = None


def iter_csv(path: Path | str, options: Optional[CsvOptions] = None) -> Iterator["pandas.DataFrame"]:  # type: ignore[name-defined]
    import pandas as pd  # local import to keep module load light when unused

    p = Path(path)
    opts = options or CsvOptions()
    chunksize = opts.chunksize or _estimate_rows_for_budget(p, _default_chunk_rows())
    for chunk in pd.read_csv(
        p,
        sep=opts.delimiter,
        usecols=opts.columns,
        dtype=opts.dtypes,
        chunksize=chunksize,
        low_memory=True,
    ):
        yield chunk


def iter_tsv(path: Path | str, options: Optional[CsvOptions] = None) -> Iterator["pandas.DataFrame"]:  # type: ignore[name-defined]
    opts = options or CsvOptions(delimiter="\t")
    return iter_csv(path, options=opts)


def iter_jsonl(path: Path | str, chunk_rows: Optional[int] = None) -> Iterator["pandas.DataFrame"]:  # type: ignore[name-defined]
    """
    Stream JSON Lines by accumulating rows into DataFrame batches of size chunk_rows.
    Uses json.loads for line parsing and pandas.DataFrame.from_records for efficient batching.
    Malformed lines are skipped.
    """
    import pandas as pd
    import json
    p = Path(path)
    size = _estimate_rows_for_budget(p, _default_chunk_rows())
    target = int(chunk_rows or size)
    rows: List[Dict[str, Any]] = []  # type: ignore[name-defined]
    with p.open("r", encoding="utf-8", errors="ignore") as fh:
        for line in fh:
            s = line.strip()
            if not s:
                continue
            try:
                obj = json.loads(s)
                if isinstance(obj, dict):
                    rows.append(obj)
                else:
                    # Ignore non-dict values
                    continue
            except Exception:
                # Skip malformed lines; optionally log in future
                continue
            if len(rows) >= target:
                yield pd.DataFrame.from_records(rows)
                rows = []
        if rows:
            yield pd.DataFrame.from_records(rows)


def iter_parquet(path: Path | str, columns: Optional[List[str]] = None, filters: Optional[List[Tuple[str, str, Any]]] = None, batch_size: Optional[int] = None) -> Iterator["pandas.DataFrame"]:  # type: ignore[name-defined]
    """
    Stream Parquet via pyarrow.dataset. If pyarrow is unavailable, raise an informative error.
    """
    try:
        import pyarrow.dataset as ds  # type: ignore
        import pyarrow as pa  # type: ignore
        import pyarrow.parquet as pq  # type: ignore
        import pandas as pd
    except Exception as e:
        raise RuntimeError("pyarrow is required for Parquet streaming. Install pyarrow to use iter_parquet().") from e

    # Build dataset and scan in batches
    dataset = ds.dataset(str(path), format="parquet")
    # Convert filters if provided (expects list of (col, op, value))
    _filters = None
    if filters:
        _filters = [(c, op, v) for (c, op, v) in filters]
    scanner_kwargs = {"columns": columns, "filter": _filters, "batch_size": batch_size or 64_000}
    try:
        scanner = dataset.scanner(**scanner_kwargs)
    except AttributeError:
        scanner = dataset.scan(**scanner_kwargs)
    for record_batch in scanner.to_batches():
        # Convert to pandas DataFrame for pipeline parity
        yield record_batch.to_pandas(types_mapper=None)  # default dtype mapping


def sum_column_over_chunks(iterator: Iterable["pandas.DataFrame"], column: str) -> float:  # type: ignore[name-defined]
    import numpy as np
    total = 0.0
    for df in iterator:
        if column in df.columns:
            # Use nan_to_num for safety, then sum
            total += float(np.nan_to_num(df[column].to_numpy(dtype=float), nan=0.0).sum())
    return total

