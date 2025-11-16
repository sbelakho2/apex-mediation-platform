import os
from pathlib import Path

import pandas as pd
import pytest


# Ensure we can import loaders from ML/scripts/lib without package install
import sys as _sys
from pathlib import Path as _P
_THIS = _P(__file__).resolve()
_LIB_DIR = _THIS.parent.parent / "lib"
if str(_LIB_DIR) not in _sys.path:
    _sys.path.insert(0, str(_LIB_DIR))

from lib.loader import iter_csv, iter_jsonl, iter_parquet, sum_column_over_chunks  # type: ignore


def _write_jsonl(df: pd.DataFrame, path: Path) -> None:
    with path.open("w", encoding="utf-8") as fh:
        for _, row in df.iterrows():
            fh.write(row.to_json())
            fh.write("\n")


def test_csv_chunked_sum_equals_full(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    # Create sample CSV
    n = 1234
    df = pd.DataFrame({"value": list(range(1, n + 1)), "ones": 1})
    csv_path = tmp_path / "sample.csv"
    df.to_csv(csv_path, index=False)

    # Force smaller chunks to cover pagination
    monkeypatch.setenv("CHUNK_ROWS", "100")

    full_sum = pd.read_csv(csv_path)["value"].sum()
    chunk_sum = sum_column_over_chunks(iter_csv(csv_path), "value")
    assert float(full_sum) == pytest.approx(chunk_sum, rel=0, abs=0.0)

    full_count = len(df)
    chunk_count = int(sum_column_over_chunks(iter_csv(csv_path), "ones"))
    assert full_count == chunk_count


def test_jsonl_chunked_sum_equals_full(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    n = 789
    df = pd.DataFrame({"value": list(range(1, n + 1)), "ones": 1})
    jsonl_path = tmp_path / "sample.jsonl"
    _write_jsonl(df, jsonl_path)

    monkeypatch.setenv("CHUNK_ROWS", "50")

    full_sum = pd.read_json(jsonl_path, lines=True)["value"].sum()
    chunk_sum = sum_column_over_chunks(iter_jsonl(jsonl_path), "value")
    assert float(full_sum) == pytest.approx(chunk_sum, rel=0, abs=0.0)

    full_count = len(df)
    chunk_count = int(sum_column_over_chunks(iter_jsonl(jsonl_path), "ones"))
    assert full_count == chunk_count


def test_parquet_chunked_sum_equals_full(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    pa = pytest.importorskip("pyarrow")  # noqa: F841 - imported for side effects/availability
    n = 456
    df = pd.DataFrame({"value": list(range(1, n + 1)), "ones": 1})
    parquet_path = tmp_path / "sample.parquet"
    df.to_parquet(parquet_path, index=False)

    monkeypatch.setenv("CHUNK_ROWS", "64")

    full_sum = pd.read_parquet(parquet_path)["value"].sum()
    chunk_sum = sum_column_over_chunks(iter_parquet(parquet_path), "value")
    assert float(full_sum) == pytest.approx(chunk_sum, rel=0, abs=0.0)

    full_count = len(df)
    chunk_count = int(sum_column_over_chunks(iter_parquet(parquet_path), "ones"))
    assert full_count == chunk_count
