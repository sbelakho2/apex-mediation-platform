import argparse
import json
import os
import random
from datetime import UTC, datetime
from typing import Dict, List, Optional, Tuple

import joblib
import numpy as np
import pandas as pd
from sklearn.calibration import CalibratedClassifierCV
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import auc, precision_recall_curve, roc_auc_score
from sklearn.model_selection import train_test_split

DEFAULT_TIME_COLUMN = "event_time"
DEFAULT_LABEL_COLUMN = "label"
SUPPORTED_CALIBRATIONS = ("sigmoid", "isotonic")


def _load_datasets(
    features_path: str,
    weak_labels_path: Optional[str],
    label_column: str,
) -> Tuple[pd.DataFrame, pd.Series]:
    frame = pd.read_parquet(features_path)
    label: Optional[pd.Series]
    if label_column in frame.columns:
        label = frame[label_column].astype(int)
        frame = frame.drop(columns=[label_column])
    else:
        label = None

    if label is None and weak_labels_path:
        weak = pd.read_parquet(weak_labels_path)
        if "label_weak" not in weak.columns:
            raise SystemExit("Weak labels parquet must include column 'label_weak'")
        label = weak["label_weak"].astype(int)

    if label is None:
        raise SystemExit("No ground-truth or weak labels available for supervised training")

    return frame, label


def _build_time_folds(
    timestamps: pd.Series,
    train_weeks: int,
    val_weeks: int,
    minimum_folds: int,
    seed: int,
    labels: Optional[pd.Series] = None,
) -> List[Tuple[np.ndarray, np.ndarray]]:
    timestamps = pd.to_datetime(timestamps, errors="coerce")
    periods = timestamps.dt.to_period("W")
    unique_periods = periods.dropna().sort_values().unique()
    total_needed = train_weeks + val_weeks

    folds: List[Tuple[np.ndarray, np.ndarray]] = []
    for start in range(0, len(unique_periods) - total_needed + 1):
        train_periods = unique_periods[start : start + train_weeks]
        val_periods = unique_periods[start + train_weeks : start + total_needed]
        train_idx = np.where(periods.isin(train_periods))[0]
        val_idx = np.where(periods.isin(val_periods))[0]
        if train_idx.size == 0 or val_idx.size == 0:
            continue
        folds.append((train_idx, val_idx))

    # Fall back to a stratified random split if time windows are too sparse.
    if len(folds) < minimum_folds:
        indices = np.arange(len(timestamps))
        stratify = labels.to_numpy() if labels is not None and labels.nunique() > 1 else None
        train_idx, val_idx = train_test_split(
            indices,
            test_size=0.2,
            random_state=seed,
            stratify=stratify,
        )
        folds.append((train_idx, val_idx))

    return folds


def _fit_calibrator(
    X_train: np.ndarray,
    y_train: np.ndarray,
    method: str,
    C: float = 1.0,
    max_iter: int = 1000,
) -> CalibratedClassifierCV:
    base = LogisticRegression(
        solver="liblinear",
        max_iter=max_iter,
        class_weight="balanced",
        C=C,
    )
    calibrator_kwargs = {"method": method, "cv": 3}
    try:
        calibrator = CalibratedClassifierCV(estimator=base, **calibrator_kwargs)
    except TypeError:
        calibrator = CalibratedClassifierCV(base_estimator=base, **calibrator_kwargs)
    calibrator.fit(X_train, y_train)
    return calibrator


def _collect_metrics(y_true: np.ndarray, scores: np.ndarray) -> Dict[str, float]:
    roc = float(roc_auc_score(y_true, scores))
    precision, recall, _ = precision_recall_curve(y_true, scores)
    pr_auc = float(auc(recall, precision))
    return {"roc_auc": roc, "pr_auc": pr_auc}


def _choose_threshold(
    y_true: np.ndarray,
    scores: np.ndarray,
    target_precision: float,
    min_recall: float,
) -> float:
    precision, recall, thresholds = precision_recall_curve(y_true, scores)
    chosen = 0.5
    best = None
    for p, r, t in zip(precision[:-1], recall[:-1], thresholds):
        if p >= target_precision and r >= min_recall:
            chosen = float(t)
            best = (p, r, t)
            break
    if best is None and len(thresholds) > 0:
        f1 = 2 * (precision[:-1] * recall[:-1]) / np.clip(precision[:-1] + recall[:-1], 1e-9, None)
        idx = int(np.nanargmax(f1))
        chosen = float(thresholds[idx])
    return chosen


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Supervised logistic regression baseline with calibration")
    parser.add_argument("--features", required=True, help="Path to engineered features parquet")
    parser.add_argument("--weak-labels", help="Optional weak labels parquet (label_weak column)")
    parser.add_argument("--out-dir", help="Output directory", default=None)
    parser.add_argument("--time-column", default=DEFAULT_TIME_COLUMN)
    parser.add_argument("--label-column", default=DEFAULT_LABEL_COLUMN)
    parser.add_argument("--train-weeks", type=int, default=3)
    parser.add_argument("--val-weeks", type=int, default=1)
    parser.add_argument("--min-folds", type=int, default=1)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--target-precision", type=float, default=0.8)
    parser.add_argument("--min-recall", type=float, default=0.9)
    parser.add_argument(
        "--calibration",
        default="both",
        choices=["sigmoid", "isotonic", "both"],
        help="Calibration method to evaluate",
    )
    parser.add_argument("--penalty", type=float, default=1.0, help="Inverse regularization strength (C)")
    return parser


def run(argv: Optional[List[str]] = None) -> str:
    parser = build_arg_parser()
    args = parser.parse_args(argv)

    out_dir = args.out_dir or os.path.join("models", "fraud", "dev", datetime.now(UTC).strftime("%Y%m%d_%H%M"))
    os.makedirs(out_dir, exist_ok=True)

    random.seed(args.seed)
    np.random.seed(args.seed)

    features_df, labels = _load_datasets(args.features, args.weak_labels, args.label_column)

    timestamps = (
        pd.to_datetime(features_df[args.time_column], errors="coerce")
        if args.time_column in features_df.columns
        else pd.Series(pd.NaT, index=features_df.index)
    )
    folds = _build_time_folds(
        timestamps,
        train_weeks=args.train_weeks,
        val_weeks=args.val_weeks,
        minimum_folds=args.min_folds,
        seed=args.seed,
        labels=labels,
    )

    X = features_df.to_numpy(dtype=np.float32)
    y = labels.to_numpy(dtype=np.int32)

    per_method_scores: Dict[str, List[np.ndarray]] = {method: [] for method in SUPPORTED_CALIBRATIONS}
    per_method_labels: Dict[str, List[np.ndarray]] = {method: [] for method in SUPPORTED_CALIBRATIONS}
    per_method_metrics: Dict[str, List[Dict[str, float]]] = {method: [] for method in SUPPORTED_CALIBRATIONS}
    fold_records: List[Dict[str, object]] = []

    methods_to_eval = [m for m in SUPPORTED_CALIBRATIONS if args.calibration in (m, "both")]

    for fold_index, (train_idx, val_idx) in enumerate(folds):
        X_train, y_train = X[train_idx], y[train_idx]
        X_val, y_val = X[val_idx], y[val_idx]

        fold_entry: Dict[str, object] = {
            "fold": fold_index,
            "train_rows": int(len(train_idx)),
            "val_rows": int(len(val_idx)),
        }

        for method in methods_to_eval:
            calibrator = _fit_calibrator(X_train, y_train, method=method, C=args.penalty)
            val_scores = calibrator.predict_proba(X_val)[:, 1]
            metrics = _collect_metrics(y_val, val_scores)
            per_method_metrics[method].append(metrics)
            per_method_scores[method].append(val_scores)
            per_method_labels[method].append(y_val)
            fold_entry[f"metrics_{method}"] = metrics

        fold_records.append(fold_entry)

    summary: Dict[str, Dict[str, float]] = {}
    for method in methods_to_eval:
        metrics_list = per_method_metrics[method]
        if not metrics_list:
            continue
        summary[method] = {
            key: float(np.mean([m[key] for m in metrics_list]))
            for key in metrics_list[0]
        }

    if not summary:
        raise SystemExit("No calibration metrics were computed; check dataset and parameters")

    if args.calibration == "both":
        chosen_method = max(summary.items(), key=lambda item: item[1]["pr_auc"])[0]
    else:
        chosen_method = args.calibration

    all_scores = np.concatenate(per_method_scores[chosen_method])
    all_labels = np.concatenate(per_method_labels[chosen_method])
    threshold = _choose_threshold(all_labels, all_scores, args.target_precision, args.min_recall)

    final_calibrator = _fit_calibrator(X, y, method=chosen_method, C=args.penalty)
    joblib.dump(final_calibrator, os.path.join(out_dir, "logreg_calibrated.pkl"))

    coefs = []
    intercepts = []
    for calibrated in final_calibrator.calibrated_classifiers_:
        inner_estimator = getattr(calibrated, "estimator", None)
        if inner_estimator is None:
            inner_estimator = getattr(calibrated, "base_estimator", None)
        if inner_estimator is None:
            raise SystemExit("Calibrated classifier missing inner estimator")
        coefs.append(inner_estimator.coef_.ravel())
        intercepts.append(float(inner_estimator.intercept_.ravel()[0]))
    coef_mean = np.mean(np.stack(coefs, axis=0), axis=0)
    intercept_mean = float(np.mean(intercepts))

    feature_columns = list(features_df.columns)
    weights = {feature_columns[i]: float(coef_mean[i]) for i in range(len(feature_columns))}

    artifact = {
        "version": "logreg_dev_2",
        "weights": weights,
        "bias": intercept_mean,
        "threshold": float(threshold),
        "features": feature_columns,
    "updated_at": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
        "metrics": {
            "roc_auc": summary[chosen_method]["roc_auc"],
            "pr_auc": summary[chosen_method]["pr_auc"],
        },
        "calibration": {
            "method": chosen_method,
            "cv_metrics": summary,
        },
        "seed": int(args.seed),
    }

    with open(os.path.join(out_dir, "trained_fraud_model.json"), "w", encoding="utf-8") as handle:
        json.dump(artifact, handle, indent=2)

    with open(os.path.join(out_dir, "train_meta.json"), "w", encoding="utf-8") as handle:
        json.dump(
            {
                "generated_at": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
                "features_path": args.features,
                "weak_labels_path": args.weak_labels,
                "folds": fold_records,
                "metrics": summary,
                "chosen_calibration": chosen_method,
                "threshold": float(threshold),
                "seed": int(args.seed),
            },
            handle,
            indent=2,
        )

    print(f"Logistic regression model written to {out_dir}")
    return out_dir


def main() -> None:
    run()


if __name__ == "__main__":
    main()
