"""Helpers for defining and executing weak supervision label functions."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Callable, Iterable, List, Mapping, Optional, Sequence

import pandas as pd

ABSTAIN = None


class LabelFunctionError(RuntimeError):
    """Raised when a label function fails during execution."""

    def __init__(self, name: str, record_index: int, original: Exception):
        super().__init__(f"Label function '{name}' failed on record {record_index}: {original}")
        self.name = name
        self.record_index = record_index
        self.original = original


@dataclass(frozen=True)
class LabelFunction:
    """Wraps a callable that emits weak labels for a record."""

    name: str
    func: Callable[[Mapping[str, object]], Optional[int]]
    weight: float = 1.0
    labels: Sequence[int] = (0, 1)

    def __call__(self, record: Mapping[str, object]) -> Optional[int]:
        value = self.func(record)
        if value is None or (isinstance(value, float) and pd.isna(value)):
            return None
        if value not in self.labels:
            raise ValueError(f"Label function '{self.name}' produced unsupported label: {value}")
        return int(value)


def apply_label_functions(
    label_functions: Sequence[LabelFunction],
    records: Iterable[Mapping[str, object]] | pd.DataFrame,
) -> pd.DataFrame:
    """Apply label functions and return a label matrix (rows = records, cols = LFs)."""

    if isinstance(records, pd.DataFrame):
        iterable: Iterable[Mapping[str, object]] = records.to_dict(orient="records")
    else:
        iterable = records

    matrix: dict[str, List[Optional[int]]] = {lf.name: [] for lf in label_functions}

    for index, record in enumerate(iterable):
        for lf in label_functions:
            try:
                matrix[lf.name].append(lf(record))
            except Exception as exc:  # pragma: no cover - defensive wrapping
                raise LabelFunctionError(lf.name, index, exc) from exc

    return pd.DataFrame(matrix)
