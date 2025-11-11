"""High-level orchestration for fraud model training."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Optional

import joblib
import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler

from .artifacts import ModelArtifacts
from .baselines import train_gradient_boosting, train_isolation_forest
from .config import TrainingConfig
from .torch_models import train_autoencoder, train_deepsvdd


def train_models(config: TrainingConfig, dataframe: Optional[pd.DataFrame] = None) -> ModelArtifacts:
    output_dir = config.ensure_output_dir()
    data = dataframe.copy() if dataframe is not None else _load_dataset(config.dataset_path)

    if config.target_column not in data.columns:
        raise ValueError(f"Target column '{config.target_column}' not found in dataset")

    data = data.dropna(subset=[config.target_column])
    features = _select_features(data, config)

    X = data[features].astype(float).fillna(0.0).to_numpy()
    y = data[config.target_column].astype(int).to_numpy()
    sample_weight = None
    if config.weight_column and config.weight_column in data.columns:
        sample_weight = data[config.weight_column].astype(float).to_numpy()

    scaler = StandardScaler()
    X = scaler.fit_transform(X)

    X_train, X_val, y_train, y_val = train_test_split(
        X,
        y,
        test_size=config.test_size,
        random_state=config.random_state,
        stratify=y if len(np.unique(y)) > 1 else None,
    )

    scaler_path = output_dir / "scaler.joblib"
    joblib.dump({"scaler": scaler, "features": features}, scaler_path)

    metrics: Dict[str, float] = {}
    artifacts: Dict[str, Path] = {"scaler": scaler_path}

    ae_result = train_autoencoder(
        X_train,
        X_val,
        y_val,
        device=config.device,
        output_dir=output_dir,
        epochs=config.epochs,
        batch_size=config.batch_size,
        learning_rate=config.learning_rate,
        hidden_dim=config.hidden_dim,
    )
    metrics.update(ae_result["metrics"])
    artifacts.update(ae_result["artifacts"])

    svdd_result = train_deepsvdd(
        X_train,
        y_train,
        X_val,
        y_val,
        device=config.device,
        output_dir=output_dir,
        epochs=config.epochs,
        batch_size=config.batch_size,
        learning_rate=config.learning_rate,
        hidden_dim=config.hidden_dim,
    )
    metrics.update(svdd_result["metrics"])
    artifacts.update(svdd_result["artifacts"])

    baseline_metrics = train_isolation_forest(
        X_train,
        y_train,
        X_val,
        y_val,
        output_path=output_dir / "isolation_forest.joblib",
        random_state=config.random_state,
    )
    metrics.update(baseline_metrics)
    artifacts["isolation_forest"] = output_dir / "isolation_forest.joblib"

    gbdt_metrics = train_gradient_boosting(
        X_train,
        y_train,
        X_val,
        y_val,
        output_path=output_dir / "gbdt.joblib",
        random_state=config.random_state,
    )
    metrics.update(gbdt_metrics)
    artifacts["gbdt"] = output_dir / "gbdt.joblib"

    manifest = ModelArtifacts(run_id=str(config.run_id), output_dir=output_dir, files=artifacts, metrics=metrics)

    _write_metrics(output_dir, metrics)
    _write_manifest(output_dir, manifest, config, features, sample_weight is not None)
    _write_model_card(output_dir, metrics, features)

    return manifest


def _load_dataset(path: Path) -> pd.DataFrame:
    if not path.exists():
        raise FileNotFoundError(path)
    if path.suffix in {".parquet", ".pq"}:
        return pd.read_parquet(path)
    if path.suffix in {".csv"}:
        return pd.read_csv(path)
    raise ValueError(f"Unsupported dataset format: {path.suffix}")


def _select_features(df: pd.DataFrame, config: TrainingConfig) -> list[str]:
    if config.feature_columns:
        missing = [col for col in config.feature_columns if col not in df.columns]
        if missing:
            raise ValueError(f"Missing feature columns: {missing}")
        return list(config.feature_columns)
    numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()
    return [col for col in numeric_cols if col not in {config.target_column, config.weight_column}]


def _write_metrics(output_dir: Path, metrics: Dict[str, float]) -> None:
    metrics_path = output_dir / "metrics.json"
    metrics_path.write_text(json.dumps(metrics, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def _write_manifest(
    output_dir: Path,
    manifest: ModelArtifacts,
    config: TrainingConfig,
    features: list[str],
    has_weights: bool,
) -> None:
    payload = manifest.to_manifest()
    payload["config"] = {
        "dataset_path": str(config.dataset_path),
        "target_column": config.target_column,
        "weight_column": config.weight_column if has_weights else None,
        "feature_columns": features,
        "test_size": config.test_size,
        "random_state": config.random_state,
        "epochs": config.epochs,
        "batch_size": config.batch_size,
        "learning_rate": config.learning_rate,
        "hidden_dim": config.hidden_dim,
        "device": str(config.device),
    "generated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    }
    (output_dir / "training_manifest.json").write_text(
        json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )


def _write_model_card(output_dir: Path, metrics: Dict[str, float], features: list[str]) -> None:
    lines = [
        "# Model Card",
        "",
        "## Summary",
        "This run trains deep autoencoder and DeepSVDD anomaly detectors with classical baselines (IsolationForest, GBDT).",
        "",
        "## Key Metrics",
    ]
    for key in sorted(metrics.keys()):
        if key.endswith(("pr_auc", "roc_auc", "f1")):
            lines.append(f"- **{key}**: {metrics[key]:.4f}")
    lines.extend(
        [
            "",
            "## Features",
            ", ".join(features),
            "",
            "## Artifacts",
            "- TorchScript models: `autoencoder.pt`, `deepsvdd.pt`, aggregated entry `model.pt`.",
            "- ONNX exports under `onnx/`.",
            "- Calibrators: `autoencoder_calibrator.joblib`, `deepsvdd_calibrator.joblib`.",
            "- Classical baselines: `isolation_forest.joblib`, `gbdt.joblib`.",
        ]
    )
    (output_dir / "model_card.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
