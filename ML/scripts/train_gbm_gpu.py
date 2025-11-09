import argparse
import json
import os
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Dict, Optional, Tuple

import numpy as np
import pandas as pd
from sklearn.metrics import (auc, confusion_matrix, precision_recall_curve,
                             roc_auc_score, roc_curve)
from sklearn.model_selection import train_test_split
from tqdm.auto import tqdm

try:
    import cudf  # type: ignore
    from cuml.ensemble import RandomForestClassifier  # type: ignore
    from cuml.model_selection import train_test_split as cu_train_test_split  # type: ignore
    HAS_CUML = True
except Exception:  # pragma: no cover - optional dependency
    HAS_CUML = False

try:
    import xgboost as xgb  # type: ignore
    from xgboost.callback import TrainingCallback  # type: ignore
    HAS_XGBOOST = True
except Exception:  # pragma: no cover - optional dependency
    HAS_XGBOOST = False

DEFAULT_LABEL_COLUMN = "label"
DEFAULT_TIME_COLUMN = "event_time"


@dataclass
class TrainingResult:
    model_path: Path
    threshold: float
    metrics: Dict[str, float]
    confusion: Dict[str, int]
    backend: str


def _choose_threshold(y_true: np.ndarray, scores: np.ndarray, target_precision: float, min_recall: float) -> float:
    precision, recall, thresholds = precision_recall_curve(y_true, scores)
    for p, r, t in zip(precision[:-1], recall[:-1], thresholds):
        if p >= target_precision and r >= min_recall:
            return float(t)
    if len(thresholds) == 0:
        return 0.5
    f1 = 2 * (precision[:-1] * recall[:-1]) / np.clip(precision[:-1] + recall[:-1], 1e-12, None)
    idx = int(np.nanargmax(f1))
    return float(thresholds[idx])


def _compute_metrics(y_true: np.ndarray, scores: np.ndarray, threshold: float) -> Tuple[Dict[str, float], Dict[str, int]]:
    precision, recall, _ = precision_recall_curve(y_true, scores)
    pr_auc = float(auc(recall, precision))
    roc_auc = float(roc_auc_score(y_true, scores))

    preds = (scores >= threshold).astype(int)
    cm = confusion_matrix(y_true, preds, labels=[0, 1])
    tn = int(cm[0, 0]) if cm.shape[0] > 0 and cm.shape[1] > 0 else 0
    fp = int(cm[0, 1]) if cm.shape[0] > 0 and cm.shape[1] > 1 else 0
    fn = int(cm[1, 0]) if cm.shape[0] > 1 and cm.shape[1] > 0 else 0
    tp = int(cm[1, 1]) if cm.shape[0] > 1 and cm.shape[1] > 1 else 0
    fpr, tpr, _ = roc_curve(y_true, scores)
    ks = float(np.max(np.abs(tpr - fpr))) if fpr.size else 0.0

    return (
        {
            "roc_auc": roc_auc,
            "pr_auc": pr_auc,
            "precision_at_threshold": float((tp) / max(tp + fp, 1)),
            "recall_at_threshold": float((tp) / max(tp + fn, 1)),
            "threshold": threshold,
            "ks": ks,
        },
        {
            "tp": int(tp),
            "fp": int(fp),
            "tn": int(tn),
            "fn": int(fn),
        },
    )


def _train_with_cuml(features_path: Path, label_column: str, test_size: float, seed: int, out_dir: Path) -> TrainingResult:
    if not HAS_CUML:
        raise SystemExit("cuML is not available. Install RAPIDS to use the GPU backend.")

    gdf = cudf.read_parquet(str(features_path))
    if label_column not in gdf.columns:
        raise SystemExit(f"Label column '{label_column}' missing in features parquet")

    y = gdf[label_column].astype("int32")
    X = gdf.drop(columns=[label_column])

    X_train, X_val, y_train, y_val = cu_train_test_split(X, y, test_size=test_size, random_state=seed, shuffle=True, stratify=y)

    model = RandomForestClassifier(
        n_estimators=500,
        max_depth=16,
        max_features="sqrt",
        random_state=seed,
        n_streams=os.cpu_count() or 8,
    )
    model.fit(X_train, y_train)

    proba_df = model.predict_proba(X_val)
    val_probs = proba_df.iloc[:, 1].to_numpy()
    y_val_np = y_val.to_numpy()

    threshold = _choose_threshold(y_val_np, val_probs, target_precision=0.8, min_recall=0.9)
    metrics, confusion = _compute_metrics(y_val_np, val_probs, threshold)

    model_path = out_dir / "gbm_model_cuml.pkl"
    if hasattr(model, "save_model"):
        model.save_model(str(model_path))  # type: ignore[attr-defined]
    else:
        import joblib  # local import to avoid dependency when not needed

        joblib.dump(model, model_path)

    return TrainingResult(model_path=model_path, threshold=threshold, metrics=metrics, confusion=confusion, backend="cuml_rf")


def _train_with_xgboost(features_path: Path, label_column: str, test_size: float, seed: int, out_dir: Path) -> TrainingResult:
    if not HAS_XGBOOST:
        raise SystemExit("xgboost is not available. Install xgboost>=2.0 with GPU support.")

    frame = pd.read_parquet(features_path)
    if label_column not in frame.columns:
        raise SystemExit(f"Label column '{label_column}' missing in features parquet")

    y = frame[label_column].astype(int).to_numpy()
    X = frame.drop(columns=[label_column])

    X_train, X_val, y_train, y_val = train_test_split(
        X, y,
        test_size=test_size,
        random_state=seed,
        stratify=y if np.unique(y).size > 1 else None,
    )

    classifier = xgb.XGBClassifier(
        objective="binary:logistic",
        tree_method="gpu_hist",
        predictor="gpu_predictor",
        n_estimators=800,
        learning_rate=0.05,
        max_depth=10,
        subsample=0.8,
        colsample_bytree=0.8,
        random_state=seed,
        eval_metric="aucpr",
    )
    total_iters = classifier.get_params().get("n_estimators", 0)

    class _TqdmCallback(TrainingCallback):
        def __init__(self, bar: "tqdm") -> None:
            self._bar = bar

        def after_iteration(self, model, epoch, evals_log):  # type: ignore[override]
            self._bar.update(1)
            validation_metrics = evals_log.get("validation_0", {}) if evals_log else {}
            for metric_name, values in validation_metrics.items():
                if values:
                    self._bar.set_postfix({metric_name: f"{values[-1]:.4f}"})
                    break
            return False

    progress_bar = tqdm(total=total_iters or None, desc="xgboost training", unit="iter", leave=False)
    try:
        classifier.fit(
            X_train,
            y_train,
            eval_set=[(X_val, y_val)],
            verbose=False,
            callbacks=[_TqdmCallback(progress_bar)],
        )
    finally:
        if not progress_bar.closed:
            progress_bar.close()

    val_probs = classifier.predict_proba(X_val)[:, 1]
    threshold = _choose_threshold(y_val, val_probs, target_precision=0.8, min_recall=0.9)
    metrics, confusion = _compute_metrics(y_val, val_probs, threshold)

    model_path = out_dir / "gbm_model_xgb.json"
    classifier.save_model(str(model_path))

    return TrainingResult(model_path=model_path, threshold=threshold, metrics=metrics, confusion=confusion, backend="xgboost_gpu")


def main() -> None:
    parser = argparse.ArgumentParser(description="GPU-accelerated gradient boosted tree training")
    parser.add_argument("--features", required=True, help="Path to engineered features parquet")
    parser.add_argument("--out-dir", required=True, help="Directory for trained model artifacts")
    parser.add_argument("--label-column", default=DEFAULT_LABEL_COLUMN)
    parser.add_argument("--backend", default="auto", choices=["auto", "cuml", "xgboost"])
    parser.add_argument("--test-size", type=float, default=0.2, help="Validation split size")
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    features_path = Path(args.features)
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    backend = args.backend
    if backend == "auto":
        if HAS_CUML:
            backend = "cuml"
        elif HAS_XGBOOST:
            backend = "xgboost"
        else:
            raise SystemExit("No GPU backend available. Install either RAPIDS cuML or xgboost with GPU support.")

    if backend == "cuml":
        result = _train_with_cuml(features_path, args.label_column, args.test_size, args.seed, out_dir)
    else:
        result = _train_with_xgboost(features_path, args.label_column, args.test_size, args.seed, out_dir)

    trained_artifact = {
        "version": "gpu_gbm_v1",
        "model_type": result.backend,
        "generated_at": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
        "model_path": str(result.model_path.name),
        "threshold": result.threshold,
        "metrics": result.metrics,
        "confusion_matrix": result.confusion,
        "seed": args.seed,
        "features_path": str(features_path),
    }

    with open(out_dir / "trained_fraud_model.json", "w", encoding="utf-8") as handle:
        json.dump(trained_artifact, handle, indent=2)

    with open(out_dir / "evaluation_metrics.json", "w", encoding="utf-8") as handle:
        json.dump(
            {
                "generated_at": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
                "backend": result.backend,
                "metrics": result.metrics,
                "confusion_matrix": result.confusion,
            },
            handle,
            indent=2,
        )

    if (
        result.metrics["roc_auc"] < 0.85
        or result.metrics["precision_at_threshold"] < 0.8
        or result.metrics["recall_at_threshold"] < 0.9
    ):
        raise SystemExit(
            "Acceptance metrics not met: require roc_auc>=0.85, precision>=0.8, recall>=0.9"
        )

    with open(out_dir / "model_manifest.json", "w", encoding="utf-8") as handle:
        json.dump(
            {
                "artifacts": [
                    {
                        "name": result.model_path.name,
                        "relative_path": str(result.model_path.name),
                        "size_bytes": result.model_path.stat().st_size if result.model_path.exists() else 0,
                    },
                    {"name": "trained_fraud_model.json", "relative_path": "trained_fraud_model.json"},
                    {"name": "evaluation_metrics.json", "relative_path": "evaluation_metrics.json"},
                ],
                "generated_at": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
            },
            handle,
            indent=2,
        )

    print(f"Trained GPU model using backend {result.backend}; metrics: {result.metrics}")


if __name__ == "__main__":
    main()
