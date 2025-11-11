"""Baseline classical models for fraud detection."""

from __future__ import annotations

from pathlib import Path
from typing import Dict, Tuple

import joblib
import numpy as np
from sklearn.calibration import CalibratedClassifierCV
from sklearn.ensemble import GradientBoostingClassifier, IsolationForest
from sklearn.isotonic import IsotonicRegression
from sklearn.metrics import average_precision_score, precision_recall_fscore_support, roc_auc_score


def train_isolation_forest(
    X_train: np.ndarray,
    y_train: np.ndarray,
    X_val: np.ndarray,
    y_val: np.ndarray,
    *,
    output_path: Path,
    random_state: int,
) -> Dict[str, float]:
    model = IsolationForest(random_state=random_state, contamination="auto", n_estimators=200)
    model.fit(X_train)

    # Higher scores should correspond to higher fraud probability
    val_scores = -model.decision_function(X_val)

    calibrator = IsotonicRegression(out_of_bounds="clip")
    calibrator.fit(val_scores, y_val)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump({"model": model, "calibrator": calibrator}, output_path)

    calibrated = calibrator.transform(val_scores)
    metrics = classification_metrics(y_val, calibrated, prefix="isolation_forest")
    return metrics


def train_gradient_boosting(
    X_train: np.ndarray,
    y_train: np.ndarray,
    X_val: np.ndarray,
    y_val: np.ndarray,
    *,
    output_path: Path,
    random_state: int,
) -> Dict[str, float]:
    base = GradientBoostingClassifier(
        random_state=random_state,
        n_estimators=200,
        max_depth=3,
        learning_rate=0.05,
    )
    calibrated = CalibratedClassifierCV(base, method="isotonic", cv=3, n_jobs=None)
    calibrated.fit(X_train, y_train)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(calibrated, output_path)

    val_probs = calibrated.predict_proba(X_val)[:, 1]
    metrics = classification_metrics(y_val, val_probs, prefix="gbdt")
    return metrics


def classification_metrics(y_true: np.ndarray, probabilities: np.ndarray, *, prefix: str) -> Dict[str, float]:
    ap = average_precision_score(y_true, probabilities)
    roc = roc_auc_score(y_true, probabilities)

    preds = (probabilities >= 0.5).astype(int)
    precision, recall, f1, _ = precision_recall_fscore_support(y_true, preds, average="binary", zero_division=0)

    return {
        f"{prefix}_pr_auc": float(ap),
        f"{prefix}_roc_auc": float(roc),
        f"{prefix}_precision": float(precision),
        f"{prefix}_recall": float(recall),
        f"{prefix}_f1": float(f1),
    }


__all__ = [
    "train_isolation_forest",
    "train_gradient_boosting",
    "classification_metrics",
]
