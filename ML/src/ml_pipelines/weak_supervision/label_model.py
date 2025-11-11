"""Simple probabilistic label model to aggregate label function outputs."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional, Sequence

import pandas as pd

from .label_functions import LabelFunction, apply_label_functions


@dataclass
class WeakLabelResult:
    label_matrix: pd.DataFrame
    predictions: pd.DataFrame


class ProbabilisticLabelModel:
    """Aggregates label function outputs using weighted majority voting."""

    def __init__(
        self,
        label_functions: Sequence[LabelFunction],
        *,
        positive_label: int = 1,
        negative_label: int = 0,
    ) -> None:
        if not label_functions:
            raise ValueError("Label model requires at least one label function")
        self.label_functions = list(label_functions)
        self.positive_label = positive_label
        self.negative_label = negative_label

    def predict(
        self,
        records: Sequence[dict[str, object]] | pd.DataFrame,
    ) -> WeakLabelResult:
        label_matrix = apply_label_functions(self.label_functions, records)
        predictions = self._aggregate(label_matrix)
        return WeakLabelResult(label_matrix=label_matrix, predictions=predictions)

    def _aggregate(self, label_matrix: pd.DataFrame) -> pd.DataFrame:
        y_weak: list[Optional[int]] = []
        confidence: list[float] = []
        positive_votes: list[float] = []
        negative_votes: list[float] = []
        vote_counts: list[int] = []

        for _, row in label_matrix.iterrows():
            pos_weight = 0.0
            neg_weight = 0.0
            votes = 0

            for lf in self.label_functions:
                value = row.get(lf.name)
                if pd.isna(value):
                    continue
                votes += 1
                if value == self.positive_label:
                    pos_weight += lf.weight
                elif value == self.negative_label:
                    neg_weight += lf.weight
                else:
                    # Unknown label - skip but keep vote count consistent
                    continue

            positive_votes.append(pos_weight)
            negative_votes.append(neg_weight)
            vote_counts.append(votes)

            total_weight = pos_weight + neg_weight
            if total_weight == 0.0:
                y_weak.append(None)
                confidence.append(0.0)
                continue

            score = pos_weight - neg_weight
            if score > 0:
                y_weak.append(self.positive_label)
            elif score < 0:
                y_weak.append(self.negative_label)
            else:
                y_weak.append(None)

            confidence.append(abs(score) / total_weight if total_weight else 0.0)

        return pd.DataFrame(
            {
                "y_weak": pd.Series(y_weak, dtype=object),
                "confidence": confidence,
                "positive_weight": positive_votes,
                "negative_weight": negative_votes,
                "vote_count": vote_counts,
            }
        )
