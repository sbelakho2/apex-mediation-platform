"""
Pydantic v2 dataset schemas and validation helpers (FIX-06).

Defines canonical row-level schemas for common training datasets (fraud/ctr).
Includes utilities to compute simple per-column diagnostics on a pandas
DataFrame and to validate rows in a streaming manner for large inputs.
"""
from __future__ import annotations

from typing import Any, Dict, Iterable, Iterator, Literal, Optional

import math

from pydantic import BaseModel, Field, ValidationError, StrictFloat, StrictInt, StrictStr, ConfigDict


SchemaName = Literal["fraud", "ctr"]


class FraudRow(BaseModel):
    """Canonical schema for fraud training rows (minimal/high-signal features).

    This schema is intentionally small to keep validation cost low and focuses
    on the most important columns. Additional columns are allowed but ignored.
    """

    model_config = ConfigDict(extra="allow", str_strip_whitespace=True)

    # Time
    event_time: StrictStr | StrictInt | StrictFloat = Field(..., description="ISO string or epoch seconds")

    # Entity IDs (hashed or normalized strings)
    ip: StrictStr | None = None
    asn: StrictStr | None = None
    device_id_hash: StrictStr | None = None
    placement_id: StrictStr | None = None

    # Event signals
    event_type: StrictStr | None = None
    ctit_seconds: StrictFloat | StrictInt | None = None

    # Label (0/1)
    label: StrictInt = Field(..., ge=0, le=1)


class CTRRow(BaseModel):
    """Canonical schema for CTR training rows (example).

    Like FraudRow, this is minimal; projects can extend as needed.
    """

    model_config = ConfigDict(extra="allow", str_strip_whitespace=True)

    event_time: StrictStr | StrictInt | StrictFloat
    placement_id: StrictStr | None = None
    ad_format: StrictStr | None = None
    label: StrictInt = Field(..., ge=0, le=1)  # click: 1, no-click: 0


def get_row_model(schema: SchemaName):
    if schema == "fraud":
        return FraudRow
    if schema == "ctr":
        return CTRRow
    raise ValueError(f"Unknown schema: {schema}")


def iter_validate_rows(
    df,  # pandas.DataFrame (kept untyped to avoid hard dependency at import time)
    schema: SchemaName,
    limit: Optional[int] = None,
) -> Iterator[tuple[int, Optional[ValidationError]]]:
    """Yield (row_index, error) for each validated row.

    If `limit` is set, validates at most `limit` rows.
    """
    Model = get_row_model(schema)
    total = len(df)
    n = min(total, limit) if (limit is not None and limit >= 0) else total
    for idx in range(n):
        try:
            Model.model_validate(df.iloc[idx].to_dict())
            yield (idx, None)
        except ValidationError as e:  # noqa: PERF203 - small volume per sample
            yield (idx, e)


def diagnostics(df) -> Dict[str, Dict[str, Any]]:
    """Compute simple diagnostics per column (nulls, distincts, min/max for numerics).

    Returns a nested dict: {column: {metric: value}}.
    """
    import numpy as np  # local import to avoid mandatory dependency when unused

    report: Dict[str, Dict[str, Any]] = {}
    for col in df.columns:
        series = df[col]
        info: Dict[str, Any] = {}
        # Nulls
        try:
            nulls = int(series.isna().sum())
        except Exception:
            nulls = None
        info["nulls"] = nulls

        # Distinct (cap to avoid heavy computation on huge frames)
        try:
            distinct = int(series.nunique(dropna=True))
        except Exception:
            distinct = None
        info["distinct"] = distinct

        # Numeric min/max
        try:
            arr = series.to_numpy()
            if np.issubdtype(arr.dtype, np.number):
                # Use nanmin/nanmax for safety
                info["min"] = float(np.nanmin(arr)) if arr.size else None
                info["max"] = float(np.nanmax(arr)) if arr.size else None
        except Exception:
            # leave min/max absent if not numeric or failed
            pass

        report[col] = info
    return report
