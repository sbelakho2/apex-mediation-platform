#!/usr/bin/env python3
"""
Export validation script: compares ONNX/TorchScript inference metrics vs training metrics.
Designed to fail CI builds when unacceptable regression deltas are detected.

Thresholds:
- PR-AUC regression: >2%
- Inference latency overhead: >5%
- ROC-AUC regression: >2%
"""
import argparse
import json
import sys
import time
from pathlib import Path
from typing import Dict, Optional, Tuple

import joblib
import numpy as np
import onnxruntime as ort
import pandas as pd
from sklearn.metrics import auc, precision_recall_curve, roc_auc_score


class ExportValidationError(Exception):
    """Raised when export validation fails gating thresholds."""
    pass


def _load_training_metrics(model_dir: Path) -> Dict[str, float]:
    """Load reference metrics from training artifacts."""
    artifact_path = model_dir / "trained_fraud_model.json"
    if not artifact_path.exists():
        raise FileNotFoundError(f"Training artifact not found: {artifact_path}")
    
    with artifact_path.open("r", encoding="utf-8") as handle:
        artifact = json.load(handle)
    
    metrics = artifact.get("metrics", {})
    if not metrics:
        raise ValueError("Training artifact missing metrics field")
    
    return {
        "roc_auc": float(metrics.get("roc_auc", 0.0)),
        "pr_auc": float(metrics.get("pr_auc", 0.0)),
    }


def _load_test_data(features_path: str, label_column: str) -> Tuple[np.ndarray, np.ndarray]:
    """Load test dataset for validation."""
    df = pd.read_parquet(features_path)
    if label_column not in df.columns:
        raise ValueError(f"Label column '{label_column}' not found in features")
    
    y = df[label_column].astype(int).to_numpy()
    X = df.drop(columns=[label_column]).to_numpy(dtype=np.float32)
    return X, y


def _validate_onnx_export(
    onnx_path: Path,
    X_test: np.ndarray,
    y_test: np.ndarray,
    training_metrics: Dict[str, float],
    pr_auc_threshold: float,
    roc_auc_threshold: float,
    latency_threshold: float,
) -> Dict[str, object]:
    """
    Validate ONNX exported model against training metrics.
    
    Returns:
        Validation results with pass/fail status
    
    Raises:
        ExportValidationError if validation fails gating thresholds
    """
    # Load ONNX model
    session = ort.InferenceSession(str(onnx_path), providers=["CPUExecutionProvider"])
    input_name = session.get_inputs()[0].name
    output_name = session.get_outputs()[0].name
    
    # Inference latency measurement
    latencies = []
    for i in range(min(1000, len(X_test))):
        sample = X_test[i : i + 1]
        start = time.perf_counter()
        _ = session.run([output_name], {input_name: sample})
        latencies.append(time.perf_counter() - start)
    
    p95_latency_ms = float(np.percentile(latencies, 95) * 1000)
    
    # Full inference pass
    predictions = []
    for i in range(len(X_test)):
        sample = X_test[i : i + 1]
        output = session.run([output_name], {input_name: sample})
        predictions.append(output[0][0][1] if output[0].shape[1] > 1 else output[0][0][0])
    
    y_pred = np.array(predictions)
    
    # Compute metrics
    onnx_roc_auc = float(roc_auc_score(y_test, y_pred))
    precision, recall, _ = precision_recall_curve(y_test, y_pred)
    onnx_pr_auc = float(auc(recall, precision))
    
    # Compare with training metrics
    roc_delta = abs(onnx_roc_auc - training_metrics["roc_auc"])
    pr_delta = abs(onnx_pr_auc - training_metrics["pr_auc"])
    
    roc_delta_pct = (roc_delta / max(training_metrics["roc_auc"], 1e-9)) * 100
    pr_delta_pct = (pr_delta / max(training_metrics["pr_auc"], 1e-9)) * 100
    
    # Gating decisions
    passes = []
    failures = []
    
    if roc_delta_pct <= roc_auc_threshold:
        passes.append(f"ROC-AUC delta {roc_delta_pct:.2f}% within threshold")
    else:
        failures.append(f"ROC-AUC regression {roc_delta_pct:.2f}% exceeds {roc_auc_threshold}%")
    
    if pr_delta_pct <= pr_auc_threshold:
        passes.append(f"PR-AUC delta {pr_delta_pct:.2f}% within threshold")
    else:
        failures.append(f"PR-AUC regression {pr_delta_pct:.2f}% exceeds {pr_auc_threshold}%")
    
    # Latency threshold (absolute, not relative)
    latency_budget_ms = 10.0  # 10ms p95 budget for fraud scoring
    if p95_latency_ms <= latency_budget_ms * (1 + latency_threshold / 100):
        passes.append(f"p95 latency {p95_latency_ms:.2f}ms within budget")
    else:
        failures.append(f"p95 latency {p95_latency_ms:.2f}ms exceeds {latency_budget_ms}ms + {latency_threshold}%")
    
    result = {
        "onnx_path": str(onnx_path),
        "training_metrics": training_metrics,
        "onnx_metrics": {
            "roc_auc": onnx_roc_auc,
            "pr_auc": onnx_pr_auc,
            "p95_latency_ms": p95_latency_ms,
        },
        "deltas": {
            "roc_auc_delta_pct": roc_delta_pct,
            "pr_auc_delta_pct": pr_delta_pct,
        },
        "thresholds": {
            "pr_auc_threshold_pct": pr_auc_threshold,
            "roc_auc_threshold_pct": roc_auc_threshold,
            "latency_threshold_pct": latency_threshold,
        },
        "passes": passes,
        "failures": failures,
        "validation_passed": len(failures) == 0,
    }
    
    if failures:
        raise ExportValidationError(
            f"ONNX export validation failed:\n" + "\n".join(f"  - {f}" for f in failures)
        )
    
    return result


def _validate_pytorch_export(
    pytorch_path: Path,
    X_test: np.ndarray,
    y_test: np.ndarray,
    training_metrics: Dict[str, float],
    pr_auc_threshold: float,
    roc_auc_threshold: float,
    latency_threshold: float,
) -> Dict[str, object]:
    """Validate TorchScript exported model (similar to ONNX validation)."""
    import torch
    
    model = torch.jit.load(str(pytorch_path))
    model.eval()
    
    # Latency measurement
    latencies = []
    with torch.no_grad():
        for i in range(min(1000, len(X_test))):
            sample = torch.from_numpy(X_test[i : i + 1])
            start = time.perf_counter()
            _ = model(sample)
            latencies.append(time.perf_counter() - start)
    
    p95_latency_ms = float(np.percentile(latencies, 95) * 1000)
    
    # Full inference
    with torch.no_grad():
        X_tensor = torch.from_numpy(X_test)
        outputs = model(X_tensor)
        if outputs.dim() > 1 and outputs.shape[1] > 1:
            y_pred = torch.softmax(outputs, dim=1)[:, 1].numpy()
        else:
            y_pred = torch.sigmoid(outputs).squeeze().numpy()
    
    # Compute metrics
    torch_roc_auc = float(roc_auc_score(y_test, y_pred))
    precision, recall, _ = precision_recall_curve(y_test, y_pred)
    torch_pr_auc = float(auc(recall, precision))
    
    # Compare deltas
    roc_delta_pct = (abs(torch_roc_auc - training_metrics["roc_auc"]) / max(training_metrics["roc_auc"], 1e-9)) * 100
    pr_delta_pct = (abs(torch_pr_auc - training_metrics["pr_auc"]) / max(training_metrics["pr_auc"], 1e-9)) * 100
    
    passes = []
    failures = []
    
    if roc_delta_pct <= roc_auc_threshold:
        passes.append(f"ROC-AUC delta {roc_delta_pct:.2f}% within threshold")
    else:
        failures.append(f"ROC-AUC regression {roc_delta_pct:.2f}% exceeds {roc_auc_threshold}%")
    
    if pr_delta_pct <= pr_auc_threshold:
        passes.append(f"PR-AUC delta {pr_delta_pct:.2f}% within threshold")
    else:
        failures.append(f"PR-AUC regression {pr_delta_pct:.2f}% exceeds {pr_auc_threshold}%")
    
    latency_budget_ms = 10.0
    if p95_latency_ms <= latency_budget_ms * (1 + latency_threshold / 100):
        passes.append(f"p95 latency {p95_latency_ms:.2f}ms within budget")
    else:
        failures.append(f"p95 latency {p95_latency_ms:.2f}ms exceeds budget")
    
    result = {
        "pytorch_path": str(pytorch_path),
        "training_metrics": training_metrics,
        "pytorch_metrics": {
            "roc_auc": torch_roc_auc,
            "pr_auc": torch_pr_auc,
            "p95_latency_ms": p95_latency_ms,
        },
        "deltas": {
            "roc_auc_delta_pct": roc_delta_pct,
            "pr_auc_delta_pct": pr_delta_pct,
        },
        "passes": passes,
        "failures": failures,
        "validation_passed": len(failures) == 0,
    }
    
    if failures:
        raise ExportValidationError(
            f"TorchScript export validation failed:\n" + "\n".join(f"  - {f}" for f in failures)
        )
    
    return result


def main():
    parser = argparse.ArgumentParser(description="Validate exported model against training metrics")
    parser.add_argument("--model-dir", required=True, help="Directory with trained model artifacts")
    parser.add_argument("--onnx-path", help="Path to ONNX exported model")
    parser.add_argument("--pytorch-path", help="Path to TorchScript exported model")
    parser.add_argument("--test-features", required=True, help="Test features parquet for validation")
    parser.add_argument("--label-column", default="label", help="Label column name")
    parser.add_argument("--pr-auc-threshold", type=float, default=2.0, help="PR-AUC delta threshold (%)")
    parser.add_argument("--roc-auc-threshold", type=float, default=2.0, help="ROC-AUC delta threshold (%)")
    parser.add_argument("--latency-threshold", type=float, default=5.0, help="Latency overhead threshold (%)")
    parser.add_argument("--output", help="Output JSON path for validation results")
    args = parser.parse_args()
    
    model_dir = Path(args.model_dir)
    training_metrics = _load_training_metrics(model_dir)
    X_test, y_test = _load_test_data(args.test_features, args.label_column)
    
    results = {"timestamp": time.time(), "validations": []}
    all_passed = True
    
    try:
        if args.onnx_path:
            onnx_result = _validate_onnx_export(
                Path(args.onnx_path),
                X_test,
                y_test,
                training_metrics,
                args.pr_auc_threshold,
                args.roc_auc_threshold,
                args.latency_threshold,
            )
            results["validations"].append(onnx_result)
            print(f"✓ ONNX validation passed")
        
        if args.pytorch_path:
            pytorch_result = _validate_pytorch_export(
                Path(args.pytorch_path),
                X_test,
                y_test,
                training_metrics,
                args.pr_auc_threshold,
                args.roc_auc_threshold,
                args.latency_threshold,
            )
            results["validations"].append(pytorch_result)
            print(f"✓ TorchScript validation passed")
    
    except ExportValidationError as e:
        print(f"✗ Validation failed:\n{e}", file=sys.stderr)
        results["error"] = str(e)
        all_passed = False
    
    results["overall_passed"] = all_passed
    
    if args.output:
        output_path = Path(args.output)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        with output_path.open("w", encoding="utf-8") as handle:
            json.dump(results, handle, indent=2)
        print(f"Validation results written to {output_path}")
    
    if not all_passed:
        sys.exit(1)
    
    print("\n✓ All export validations passed")


if __name__ == "__main__":
    main()
