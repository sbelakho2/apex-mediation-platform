"""Concurrency/idempotency tests for streaming loaders (FIX-06).

Goal: prove that processing chunks in parallel does not duplicate rows
and produces deterministic results, independent of worker count/order.
"""
from __future__ import annotations

import concurrent.futures as cf
from pathlib import Path
from typing import Iterable, List

import pandas as pd
import pytest

# Import streaming loaders directly from scripts/lib without package install
import sys as _sys
from pathlib import Path as _P

_THIS = _P(__file__).resolve()
_LIB_DIR = _THIS.parent.parent / "lib"
if str(_LIB_DIR) not in _sys.path:
    _sys.path.insert(0, str(_LIB_DIR))

from lib.loader import iter_csv  # type: ignore


def _process_chunk(df: pd.DataFrame) -> pd.DataFrame:
    # Simulate a transformation that must be idempotent and not duplicate rows
    # Add a derived column and return the same number of rows
    out = df.copy()
    if "value" in out.columns:
        out["value_x2"] = (out["value"].astype(float) * 2.0).astype(float)
    else:
        out["value_x2"] = 0.0
    return out


def _parallel_process(chunks: Iterable[pd.DataFrame], workers: int) -> pd.DataFrame:
    dfs: List[pd.DataFrame] = []
    with cf.ThreadPoolExecutor(max_workers=workers) as pool:
        futures = [pool.submit(_process_chunk, ch) for ch in chunks]
        for f in futures:
            dfs.append(f.result())
    return pd.concat(dfs, ignore_index=True) if dfs else pd.DataFrame()


@pytest.mark.parametrize("workers", [1, 2, 4])
def test_parallel_streaming_is_idempotent(tmp_path: Path, workers: int) -> None:
    # Prepare a medium-sized CSV to force multiple chunks
    n = 10_000
    df = pd.DataFrame({
        "id": list(range(n)),
        "value": list(range(1, n + 1)),
    })
    path = tmp_path / "sample.csv"
    df.to_csv(path, index=False)

    # Run streaming with a small chunk size to ensure multiple batches
    # by setting environment variable CHUNK_ROWS (monkeypatch not used to avoid fixture coupling)
    import os

    os.environ["CHUNK_ROWS"] = "512"

    # Process sequentially (workers=1) as baseline and in parallel
    seq_out = _parallel_process(iter_csv(path), workers=1)
    par_out = _parallel_process(iter_csv(path), workers=workers)

    # Row counts match input and each other
    assert len(seq_out) == n
    assert len(par_out) == n

    # Deterministic: sorting by id must yield identical derived values
    seq_sorted = seq_out.sort_values("id").reset_index(drop=True)
    par_sorted = par_out.sort_values("id").reset_index(drop=True)

    pd.testing.assert_series_equal(
        seq_sorted["value_x2"], par_sorted["value_x2"], check_names=False
    )
