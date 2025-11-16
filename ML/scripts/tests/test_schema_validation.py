from __future__ import annotations

from pathlib import Path
from typing import List

import pandas as pd

# Import from scripts/lib without package install
import sys as _sys
from pathlib import Path as _P

_THIS = _P(__file__).resolve()
_LIB_DIR = _THIS.parent.parent / "lib"
if str(_LIB_DIR) not in _sys.path:
    _sys.path.insert(0, str(_LIB_DIR))

from lib.schema import iter_validate_rows, diagnostics  # type: ignore


def test_iter_validate_rows_reports_errors() -> None:
    # Build a small mixed DataFrame: two valid, one invalid (label out of range)
    df = pd.DataFrame(
        [
            {
                "event_time": "2025-01-01T00:00:00Z",
                "ip": "1.2.3.4",
                "device_id_hash": "abc",
                "placement_id": "pl1",
                "label": 1,
            },
            {
                "event_time": 1704067200,  # epoch seconds
                "asn": "AS1234",
                "placement_id": "pl2",
                "label": 0,
            },
            {
                "event_time": "2025-01-02T00:00:00Z",
                "label": 3,  # invalid
            },
        ]
    )

    errors: List[int] = []
    for idx, err in iter_validate_rows(df, schema="fraud", limit=len(df)):
        if err is not None:
            errors.append(idx)

    assert errors == [2]


def test_diagnostics_shape() -> None:
    df = pd.DataFrame(
        {
            "event_time": ["2025-01-01T00:00:00Z", "2025-01-02T00:00:00Z"],
            "label": [1, 0],
            "value": [3.14, 2.72],
        }
    )
    report = diagnostics(df)
    # Ensure expected keys present and numeric min/max computed
    assert set(report.keys()) >= {"event_time", "label", "value"}
    assert "nulls" in report["event_time"]
    assert "distinct" in report["event_time"]
    assert report["value"].get("min") == 2.72
    assert report["value"].get("max") == 3.14
