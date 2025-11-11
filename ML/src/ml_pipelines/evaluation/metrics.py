"""Evaluation utilities for classification metrics with fraud detection focus."""

from __future__ import annotations

from typing import Dict, Iterable, Sequence

import numpy as np
from sklearn.metrics import (
    average_precision_score,
    precision_recall_fscore_support,
    precision_score,
    roc_auc_score,
    roc_curve,
)


DEFAULT_K_VALUES: tuple[float | int, ...] = (0.05, 0.1)
DEFAULT_FPR_TARGETS: tuple[float, ...] = (0.001, 0.005, 0.01)


def precision_at_k(y_true: np.ndarray, scores: np.ndarray, k: float | int) -> float:
    """Compute precision for the top-k samples (k as count or fraction)."""
    if len(scores) == 0:
        return 0.0
    if isinstance(k, float):
        if not 0 < k <= 1:
            raise ValueError("Fractional k must be in (0, 1].")
        top_n = max(1, int(np.ceil(k * len(scores))))
    else:
        if k <= 0:
            raise ValueError("k must be positive.")
        top_n = min(len(scores), int(k))
    order = np.argsort(scores)[::-1]
    top_idx = order[:top_n]
    precision = float(np.mean(y_true[top_idx])) if top_idx.size else 0.0
    return precision


def precision_at_fpr(
    y_true: np.ndarray,
    scores: np.ndarray,
    targets: Sequence[float] = DEFAULT_FPR_TARGETS,
) -> Dict[float, float]:
    """Compute precision at or below target false-positive rates."""
    if len(scores) == 0:
        return {target: 0.0 for target in targets}

    fpr, _, thresholds = roc_curve(y_true, scores)
    results: Dict[float, float] = {}
    for target in targets:
        if target <= 0 or target >= 1:
            raise ValueError("FPR targets must be between 0 and 1.")
        mask = np.where(fpr <= target)[0]
        if mask.size == 0:
            results[target] = 0.0
            continue
        threshold = thresholds[mask[-1]]
        preds = scores >= threshold
        precision = precision_score(y_true, preds, zero_division=0)
        results[target] = float(precision)
    return results


def classification_metrics(
    y_true: np.ndarray,
    probabilities: np.ndarray,
    *,
    prefix: str,
    k_values: Iterable[float | int] = DEFAULT_K_VALUES,
    fpr_targets: Iterable[float] = DEFAULT_FPR_TARGETS,
) -> Dict[str, float]:
    """Compute a comprehensive metric bundle for calibrated fraud scores."""
    ap = average_precision_score(y_true, probabilities)
    roc = roc_auc_score(y_true, probabilities)

    preds = (probabilities >= 0.5).astype(int)
    precision, recall, f1, _ = precision_recall_fscore_support(
        y_true, preds, average="binary", zero_division=0
    )

    metrics: Dict[str, float] = {
        f"{prefix}_pr_auc": float(ap),
        f"{prefix}_roc_auc": float(roc),
        f"{prefix}_precision": float(precision),
        f"{prefix}_recall": float(recall),
        f"{prefix}_f1": float(f1),
    }

    for value in k_values:
        score = precision_at_k(y_true, probabilities, value)
        label = _format_k_label(value)
        metrics[f"{prefix}_precision_at_{label}"] = float(score)

    fpr_scores = precision_at_fpr(y_true, probabilities, list(fpr_targets))
    for target, score in fpr_scores.items():
        label = f"{target * 100:.3f}".rstrip("0").rstrip(".")
        metrics[f"{prefix}_precision_at_fpr_{label}pct"] = float(score)

    return metrics


def _format_k_label(value: float | int) -> str:
    if isinstance(value, float):
        percent = value * 100
        if percent.is_integer():
            return f"{int(percent)}pct"
        return f"{percent:.1f}pct".replace(".", "_")
    return f"top{int(value)}"
