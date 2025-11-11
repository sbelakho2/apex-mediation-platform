"""Metrics utilities for assessing label function quality."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Dict

import pandas as pd


@dataclass(frozen=True)
class LabelMetrics:
    coverage: Dict[str, float]
    overall_coverage: float
    overlap_rate: float
    conflict_rate: float


def compute_label_metrics(label_matrix: pd.DataFrame) -> LabelMetrics:
    """Compute coverage, overlap, and conflict statistics for a label matrix."""

    if label_matrix.empty:
        return LabelMetrics(coverage={}, overall_coverage=0.0, overlap_rate=0.0, conflict_rate=0.0)

    total_records = len(label_matrix)
    coverage: Dict[str, float] = {}

    for column in label_matrix.columns:
        series = label_matrix[column]
        non_abstain = series[~series.isna()]
        coverage[column] = len(non_abstain) / total_records

    row_non_abstain_counts = label_matrix.apply(lambda row: row.notna().sum(), axis=1)
    rows_with_votes = row_non_abstain_counts > 0
    overlap_rows = row_non_abstain_counts > 1

    def _has_conflict(row: pd.Series) -> bool:
        votes = row.dropna().unique()
        return len(votes) > 1

    conflict_rows = label_matrix.apply(_has_conflict, axis=1)

    overall_coverage = rows_with_votes.sum() / total_records
    overlap_rate = overlap_rows.sum() / total_records

    if rows_with_votes.sum() == 0:
        conflict_rate = 0.0
    else:
        conflict_rate = conflict_rows.sum() / total_records

    return LabelMetrics(
        coverage=coverage,
        overall_coverage=overall_coverage,
        overlap_rate=overlap_rate,
        conflict_rate=conflict_rate,
    )
