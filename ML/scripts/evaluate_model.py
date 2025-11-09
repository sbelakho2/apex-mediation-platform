import argparse
import json
import os
from datetime import UTC, datetime
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import joblib
import numpy as np
import pandas as pd
from sklearn.metrics import (auc, confusion_matrix, precision_recall_curve,
                             roc_auc_score, roc_curve)

DEFAULT_LABEL_COLUMN = "label"
DEFAULT_TIME_COLUMN = "event_time"
REPORT_ROOT = Path("docs") / "Internal" / "ML" / "Reports"

GATING_RULES = {
    "min_roc_auc": 0.85,
    "min_pr_auc": 0.40,
    "min_precision_at_recall": 0.80,
    "min_recall_at_precision": 0.90,
    "min_ks": 0.20,
    "required_windows": 4,
    "consecutive_passes": 4,
}


def _load_data(features_path: str, label_column: str) -> Tuple[pd.DataFrame, pd.Series, pd.DataFrame]:
    frame = pd.read_parquet(features_path)
    if label_column not in frame.columns:
        raise SystemExit(f"Label column '{label_column}' is required for evaluation")
    labels = frame[label_column].astype(int)
    features = frame.drop(columns=[label_column])
    return features, labels, frame


def _load_model(model_dir: Path) -> Tuple[Dict[str, float], float, float, str]:
    artifact_path = model_dir / "trained_fraud_model.json"
    if not artifact_path.exists():
        raise SystemExit(f"Missing trained model artifact at {artifact_path}")
    with artifact_path.open("r", encoding="utf-8") as handle:
        artifact = json.load(handle)
    weights = artifact.get("weights", {})
    bias = float(artifact.get("bias", 0.0))
    threshold = float(artifact.get("threshold", 0.5))
    version = artifact.get("version", "unknown")
    if not weights:
        raise SystemExit("Weights not found inside trained_fraud_model.json")
    return weights, bias, threshold, version


def _load_calibrator(model_dir: Path):
    calibrator_path = model_dir / "logreg_calibrated.pkl"
    if not calibrator_path.exists():
        raise SystemExit(f"Missing calibrated model at {calibrator_path}")
    return joblib.load(calibrator_path)


def _precision_at_recall(y_true: np.ndarray, scores: np.ndarray, target_recall: float) -> float:
    precision, recall, thresholds = precision_recall_curve(y_true, scores)
    for p, r, _ in zip(precision[:-1], recall[:-1], thresholds):
        if r >= target_recall:
            return float(p)
    return float(precision[-1])


def _recall_at_precision(y_true: np.ndarray, scores: np.ndarray, target_precision: float) -> float:
    precision, recall, thresholds = precision_recall_curve(y_true, scores)
    for p, r, _ in zip(precision[:-1], recall[:-1], thresholds):
        if p >= target_precision:
            return float(r)
    return float(recall[-1])


def _kolmogorov_smirnov(y_true: np.ndarray, scores: np.ndarray) -> float:
    positives = scores[y_true == 1]
    negatives = scores[y_true == 0]
    if positives.size == 0 or negatives.size == 0:
        return 0.0
    sorted_scores = np.sort(scores)
    cdf_pos = np.searchsorted(np.sort(positives), sorted_scores, side="right") / positives.size
    cdf_neg = np.searchsorted(np.sort(negatives), sorted_scores, side="right") / negatives.size
    return float(np.max(np.abs(cdf_pos - cdf_neg)))


def _lift_table(y_true: np.ndarray, scores: np.ndarray, buckets: int = 10) -> List[Dict[str, float]]:
    data = pd.DataFrame({"score": scores, "label": y_true})
    data = data.sort_values("score", ascending=False).reset_index(drop=True)
    data["bucket"] = pd.qcut(data.index, q=buckets, labels=False)
    base_rate = data["label"].mean() or 1e-9
    table: List[Dict[str, float]] = []
    for bucket in range(buckets):
        slice_df = data[data["bucket"] == bucket]
        if slice_df.empty:
            continue
        bucket_rate = slice_df["label"].mean()
        lift = bucket_rate / base_rate if base_rate > 0 else 0.0
        table.append(
            {
                "bucket": int(bucket + 1),
                "count": int(slice_df.shape[0]),
                "positives": int(slice_df["label"].sum()),
                "rate": float(bucket_rate),
                "lift": float(lift),
            }
        )
    return table


def _confusion_at_threshold(y_true: np.ndarray, scores: np.ndarray, threshold: float) -> Dict[str, int]:
    preds = (scores >= threshold).astype(int)
    tn, fp, fn, tp = confusion_matrix(y_true, preds).ravel()
    return {"tp": int(tp), "fp": int(fp), "tn": int(tn), "fn": int(fn)}


def _extended_metrics(y_true: np.ndarray, scores: np.ndarray, threshold: float) -> Dict[str, object]:
    roc_auc = float(roc_auc_score(y_true, scores))
    precision, recall, pr_thresholds = precision_recall_curve(y_true, scores)
    pr_auc = float(auc(recall, precision))

    ks = _kolmogorov_smirnov(y_true, scores)
    precision_at_recall = _precision_at_recall(y_true, scores, target_recall=0.9)
    recall_at_precision = _recall_at_precision(y_true, scores, target_precision=0.8)
    lift = _lift_table(y_true, scores)
    confusion = _confusion_at_threshold(y_true, scores, threshold)
    fpr, tpr, roc_thresholds = roc_curve(y_true, scores)

    return {
        "roc_auc": roc_auc,
        "pr_auc": pr_auc,
        "precision_recall_curve": {
            "precision": precision[:-1].tolist(),
            "recall": recall[:-1].tolist(),
            "thresholds": pr_thresholds.tolist(),
        },
        "roc_curve": {
            "fpr": fpr.tolist(),
            "tpr": tpr.tolist(),
            "thresholds": roc_thresholds.tolist(),
        },
        "precision_at_recall_0_9": precision_at_recall,
        "recall_at_precision_0_8": recall_at_precision,
        "ks_statistic": ks,
        "lift_table": lift,
        "confusion_matrix": confusion,
    }


def _basic_metrics(y_true: np.ndarray, scores: np.ndarray) -> Dict[str, float]:
    if len(np.unique(y_true)) < 2:
        return {"roc_auc": float("nan"), "pr_auc": float("nan"), "positive_rate": float(np.mean(y_true))}
    return {
        "roc_auc": float(roc_auc_score(y_true, scores)),
        "pr_auc": float(auc(*precision_recall_curve(y_true, scores)[1::-1])),
        "positive_rate": float(np.mean(y_true)),
    }


def _cost_curve(y_true: np.ndarray, scores: np.ndarray, fp_cost: float, fn_cost: float, points: int = 21) -> List[Dict[str, float]]:
    thresholds = np.linspace(0.0, 1.0, points)
    curve: List[Dict[str, float]] = []
    for threshold in thresholds:
        preds = (scores >= threshold).astype(int)
        tn, fp, fn, tp = confusion_matrix(y_true, preds).ravel()
        cost = fp_cost * fp + fn_cost * fn
        curve.append(
            {
                "threshold": float(threshold),
                "expected_cost": float(cost),
                "fp": int(fp),
                "fn": int(fn),
            }
        )
    return curve


def _recommended_threshold(
    y_true: np.ndarray,
    scores: np.ndarray,
    precision_target: float,
    recall_target: float,
) -> float:
    precision, recall, thresholds = precision_recall_curve(y_true, scores)
    if thresholds.size == 0:
        return 0.5
    for p, r, t in zip(precision[:-1], recall[:-1], thresholds):
        if p >= precision_target and r >= recall_target:
            return float(t)
    # Fall back to F1-optimal threshold if targets unmet
    f1 = 2 * (precision[:-1] * recall[:-1]) / np.clip(precision[:-1] + recall[:-1], 1e-9, None)
    idx = int(np.nanargmax(f1))
    return float(thresholds[idx])


def _timeline_metrics(frame: pd.DataFrame, scores: np.ndarray, label_column: str, time_column: str) -> List[Dict[str, object]]:
    if time_column not in frame.columns:
        return []
    timestamps = pd.to_datetime(frame[time_column], errors="coerce")
    if timestamps.isna().all():
        return []
    weeks = timestamps.dt.to_period("W")
    labels = frame[label_column].to_numpy()
    rows: List[Dict[str, object]] = []
    for period in sorted(weeks.dropna().unique()):
        mask = weeks == period
        if mask.sum() < 10:
            continue
        metrics = _basic_metrics(labels[mask], scores[mask])
        rows.append(
            {
                "window": str(period),
                "samples": int(mask.sum()),
                "roc_auc": metrics["roc_auc"],
                "pr_auc": metrics["pr_auc"],
                "positive_rate": metrics["positive_rate"],
            }
        )
    return rows


def _subgroup_metrics(frame: pd.DataFrame, scores: np.ndarray, label_column: str, columns: List[str]) -> Dict[str, List[Dict[str, object]]]:
    labels = frame[label_column].to_numpy()
    results: Dict[str, List[Dict[str, object]]] = {}
    for column in columns:
        if column not in frame.columns:
            continue
        groups = []
        series = frame[column].fillna("unknown")
        for value, subset in series.groupby(series):
            mask = series == value
            if mask.sum() < 50:
                continue
            metrics = _basic_metrics(labels[mask], scores[mask])
            groups.append(
                {
                    "group": str(value),
                    "samples": int(mask.sum()),
                    "roc_auc": metrics["roc_auc"],
                    "pr_auc": metrics["pr_auc"],
                    "positive_rate": metrics["positive_rate"],
                }
            )
        if groups:
            results[column] = groups
    return results


def _load_training_meta(model_dir: Path) -> Dict[str, object]:
    meta_path = model_dir / "train_meta.json"
    if not meta_path.exists():
        return {}
    with meta_path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def _gating_decision(metrics: Dict[str, object], validation_windows: int) -> Dict[str, object]:
    meets = (
        metrics["roc_auc"] >= GATING_RULES["min_roc_auc"]
        and metrics["pr_auc"] >= GATING_RULES["min_pr_auc"]
        and metrics["precision_at_recall_0_9"] >= GATING_RULES["min_precision_at_recall"]
        and metrics["recall_at_precision_0_8"] >= GATING_RULES["min_recall_at_precision"]
        and metrics["ks_statistic"] >= GATING_RULES["min_ks"]
    )
    decision = "stay_shadow"
    if meets:
        if validation_windows >= GATING_RULES["required_windows"]:
            decision = "candidate_review"
        else:
            decision = "collect_more_windows"
    return {
        "decision": decision,
        "rules": GATING_RULES,
        "validation_windows": validation_windows,
    }


def _write_json(path: Path, payload: Dict[str, object]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2)


def _write_markdown(path: Path, version: str, metrics: Dict[str, object]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    confusion = metrics.get("confusion_matrix", {})
    lift_rows = metrics.get("lift_table", [])
    lines = [
        f"# Fraud Model Evaluation — {version}",
        "",
    f"Generated: {datetime.now(UTC).isoformat().replace('+00:00', 'Z')}",
        "",
        "## Summary Metrics",
        "",
        "| Metric | Value |",
        "| --- | --- |",
        f"| ROC AUC | {metrics['roc_auc']:.4f} |",
        f"| PR AUC | {metrics['pr_auc']:.4f} |",
        f"| Precision @ Recall≥0.9 | {metrics['precision_at_recall_0_9']:.4f} |",
        f"| Recall @ Precision≥0.8 | {metrics['recall_at_precision_0_8']:.4f} |",
        f"| KS Statistic | {metrics['ks_statistic']:.4f} |",
        "",
        "## Confusion Matrix (Operating Threshold)",
        "",
        "| | Predicted Fraud | Predicted Legit |",
        "| --- | --- | --- |",
        f"| Actual Fraud | {confusion.get('tp', 0)} | {confusion.get('fn', 0)} |",
        f"| Actual Legit | {confusion.get('fp', 0)} | {confusion.get('tn', 0)} |",
        "",
        "## Decile Lift Table",
        "",
        "| Bucket | Samples | Positives | Rate | Lift |",
        "| --- | --- | --- | --- | --- |",
    ]
    for row in lift_rows:
        lines.append(
            f"| {row['bucket']} | {row['count']} | {row['positives']} | {row['rate']:.4f} | {row['lift']:.2f} |"
        )
    lines.append("")
    lines.append("> Generated by ML/scripts/evaluate_model.py")
    path.write_text("\n".join(lines), encoding="utf-8")


def _evaluate_arrays(
    model_dir: Path,
    features: pd.DataFrame,
    labels: pd.Series,
    raw_frame: pd.DataFrame,
    label_column: str,
    time_column: str,
    slice_columns: List[str],
    fp_cost: float,
    fn_cost: float,
) -> Dict[str, object]:
    calibrator = _load_calibrator(model_dir)
    scores = calibrator.predict_proba(features.to_numpy(dtype=np.float32))[:, 1]
    weights, bias, threshold, version = _load_model(model_dir)

    metrics = _extended_metrics(labels.to_numpy(), scores, threshold)
    metrics["cost_curve"] = _cost_curve(labels.to_numpy(), scores, fp_cost, fn_cost)
    metrics["recommended_threshold"] = _recommended_threshold(
        labels.to_numpy(),
        scores,
        precision_target=GATING_RULES["min_precision_at_recall"],
        recall_target=GATING_RULES["min_recall_at_precision"],
    )
    meta = _load_training_meta(model_dir)
    validation_windows = len(meta.get("folds", []))
    gating = _gating_decision(metrics, validation_windows)
    stability = {
        "time_slices": _timeline_metrics(raw_frame.assign(**{label_column: labels}), scores, label_column, time_column),
        "subgroups": _subgroup_metrics(
            raw_frame.assign(**{label_column: labels}),
            scores,
            label_column,
            slice_columns,
        ),
    }
    payload = {
        "model_version": version,
    "generated_at": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
        "threshold": threshold,
        "metrics": metrics,
        "gating": gating,
        "stability": stability,
    }

    evaluation_path = model_dir / "evaluation_metrics.json"
    _write_json(evaluation_path, payload)

    report_name = f"{datetime.now(UTC).strftime('%Y%m%d_%H%M%S')}_{version}.md"
    report_path = REPORT_ROOT / report_name
    _write_markdown(report_path, version, metrics)

    # Update trained_fraud_model.json with extended metrics
    artifact_path = model_dir / "trained_fraud_model.json"
    with artifact_path.open("r", encoding="utf-8") as handle:
        artifact = json.load(handle)
    artifact.setdefault("extended_metrics", {}).update(metrics)
    artifact["recommended_threshold"] = metrics["recommended_threshold"]
    artifact.setdefault("reports", []).append(str(report_path))
    artifact["gating"] = gating
    artifact["stability"] = stability
    _write_json(artifact_path, artifact)

    return payload


def evaluate(
    model_dir: Path,
    features_path: Path,
    label_column: str,
    time_column: str,
    slice_columns: List[str],
    fp_cost: float,
    fn_cost: float,
) -> Dict[str, object]:
    features, labels, raw_frame = _load_data(str(features_path), label_column)
    return _evaluate_arrays(
        model_dir,
        features,
        labels,
        raw_frame,
        label_column,
        time_column,
        slice_columns,
        fp_cost,
        fn_cost,
    )


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Evaluate fraud model against labeled holdout dataset")
    parser.add_argument("--model-dir", required=True, help="Directory containing trained model artifacts")
    parser.add_argument("--features", required=True, help="Holdout parquet with engineered features + labels")
    parser.add_argument("--label-column", default=DEFAULT_LABEL_COLUMN)
    parser.add_argument("--time-column", default=DEFAULT_TIME_COLUMN)
    parser.add_argument(
        "--slice-columns",
        nargs="*",
        help="Optional categorical columns to compute subgroup metrics (defaults to placement_id/country if present)",
    )
    parser.add_argument("--fp-cost", type=float, default=1.0, help="Cost weight for false positives")
    parser.add_argument("--fn-cost", type=float, default=5.0, help="Cost weight for false negatives")
    return parser


def run(argv: Optional[List[str]] = None) -> Dict[str, object]:
    parser = build_arg_parser()
    args = parser.parse_args(argv)
    model_dir = Path(args.model_dir)
    features_path = Path(args.features)
    features, labels, raw_frame = _load_data(str(features_path), args.label_column)
    slice_columns = list(args.slice_columns or [])
    if not slice_columns:
        slice_columns = [col for col in ("placement_id", "partner_id", "country") if col in raw_frame.columns]
    return _evaluate_arrays(
        model_dir,
        features,
        labels,
        raw_frame,
        args.label_column,
        args.time_column,
        slice_columns,
        args.fp_cost,
        args.fn_cost,
    )


def main() -> None:
    run()


if __name__ == "__main__":
    main()
