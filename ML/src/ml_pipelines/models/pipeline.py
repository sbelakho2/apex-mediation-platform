"""High-level orchestration for fraud model training."""

from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Optional

import joblib
import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler

from ml_pipelines.evaluation import classification_metrics

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

    feature_frame = data[features].astype(float).fillna(0.0)
    target_series = data[config.target_column].astype(int)
    weight_series = None
    if config.weight_column and config.weight_column in data.columns:
        weight_series = data[config.weight_column].astype(float)

    stratify = target_series if target_series.nunique() > 1 else None

    if weight_series is not None:
        X_train_df, X_val_df, y_train_series, y_val_series, _, _ = train_test_split(
            feature_frame,
            target_series,
            weight_series,
            test_size=config.test_size,
            random_state=config.random_state,
            stratify=stratify,
        )
    else:
        X_train_df, X_val_df, y_train_series, y_val_series = train_test_split(
            feature_frame,
            target_series,
            test_size=config.test_size,
            random_state=config.random_state,
            stratify=stratify,
        )

    scaler = StandardScaler()
    X_train = scaler.fit_transform(X_train_df.to_numpy(dtype=float, copy=True))
    X_val = scaler.transform(X_val_df.to_numpy(dtype=float, copy=True))

    y_train = y_train_series.to_numpy(dtype=int, copy=True)
    y_val = y_val_series.to_numpy(dtype=int, copy=True)

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
    ae_probs = np.asarray(ae_result.get("val_probabilities", []), dtype=float)

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
    svdd_probs = np.asarray(svdd_result.get("val_probabilities", []), dtype=float)

    isolation_result = train_isolation_forest(
        X_train,
        y_train,
        X_val,
        y_val,
        output_path=output_dir / "isolation_forest.joblib",
        random_state=config.random_state,
    )
    metrics.update(isolation_result["metrics"])
    artifacts["isolation_forest"] = output_dir / "isolation_forest.joblib"
    iso_probs = np.asarray(isolation_result.get("probabilities", []), dtype=float)

    gbdt_result = train_gradient_boosting(
        X_train,
        y_train,
        X_val,
        y_val,
        output_path=output_dir / "gbdt.joblib",
        random_state=config.random_state,
    )
    metrics.update(gbdt_result["metrics"])
    artifacts["gbdt"] = output_dir / "gbdt.joblib"
    gbdt_model = gbdt_result.get("model")
    gbdt_probs = np.asarray(gbdt_result.get("probabilities", []), dtype=float)

    if all(arr.size for arr in (ae_probs, svdd_probs, iso_probs, gbdt_probs)):
        ensemble_scores = np.mean(np.vstack([ae_probs, svdd_probs, iso_probs, gbdt_probs]), axis=0)
        ensemble_metrics = classification_metrics(y_val, ensemble_scores, prefix="ensemble")
        metrics.update(ensemble_metrics)

    stability_metrics = _compute_adversarial_stability(
        gbdt_model,
        scaler,
        X_val_df,
        gbdt_probs,
        features,
        random_state=config.random_state,
    )
    metrics.update(stability_metrics)

    manifest = ModelArtifacts(run_id=str(config.run_id), output_dir=output_dir, files=artifacts, metrics=metrics)

    generated_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    lineage = _build_lineage(config, features, record_count=len(data), has_weights=weight_series is not None)

    _write_metrics(output_dir, metrics)
    _write_manifest(output_dir, manifest, config, features, weight_series is not None, generated_at, lineage)
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
    generated_at: str,
    lineage: Dict[str, object],
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
    }
    payload["generated_at"] = generated_at
    payload["lineage"] = lineage
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
        if key.endswith(("pr_auc", "roc_auc", "f1")) or "precision_at" in key:
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


def _build_lineage(
    config: TrainingConfig,
    features: list[str],
    *,
    record_count: int,
    has_weights: bool,
) -> Dict[str, object]:
    dataset_path = Path(config.dataset_path) if config.dataset_path else None
    dataset_hash = _file_sha256(dataset_path) if dataset_path and dataset_path.exists() else None
    manifest_candidate = dataset_path.parent / "manifest.json" if dataset_path else None
    source_manifests = []
    if manifest_candidate and manifest_candidate.exists():
        source_manifests.append(str(manifest_candidate))

    return {
        "records": record_count,
        "dataset": {
            "path": str(config.dataset_path),
            "sha256": dataset_hash,
        },
        "source_manifests": source_manifests,
        "feature_columns": features,
        "weight_column": config.weight_column if has_weights else None,
        "split": {
            "test_size": config.test_size,
            "random_state": config.random_state,
        },
    }


def _compute_adversarial_stability(
    model,
    scaler: StandardScaler,
    val_frame: pd.DataFrame,
    base_probabilities: np.ndarray,
    feature_names: list[str],
    *,
    random_state: int,
) -> Dict[str, float]:
    if model is None or base_probabilities.size == 0 or val_frame.empty:
        return {}

    metrics: Dict[str, float] = {}

    ip_frame = _perturb_ip_hopping(val_frame, feature_names, random_state)
    ip_probs = model.predict_proba(scaler.transform(ip_frame.to_numpy(dtype=float, copy=True)))[:, 1]
    metrics["gbdt_stability_ip_hopping"] = _stability_score(base_probabilities, ip_probs)

    asn_frame = _perturb_asn_masking(val_frame, feature_names)
    asn_probs = model.predict_proba(scaler.transform(asn_frame.to_numpy(dtype=float, copy=True)))[:, 1]
    metrics["gbdt_stability_asn_masking"] = _stability_score(base_probabilities, asn_probs)

    return metrics


def _perturb_ip_hopping(frame: pd.DataFrame, feature_names: list[str], random_state: int) -> pd.DataFrame:
    mutated = frame.copy(deep=True)
    rng = np.random.default_rng(random_state)
    columns = _select_columns(feature_names, ("ip", "network", "tor", "vpn", "cloud"))
    for column in columns:
        values = mutated[column].to_numpy(copy=True)
        rng.shuffle(values)
        mutated[column] = values
    return mutated


def _perturb_asn_masking(frame: pd.DataFrame, feature_names: list[str]) -> pd.DataFrame:
    mutated = frame.copy(deep=True)
    columns = _select_columns(feature_names, ("asn",))
    for column in columns:
        mutated[column] = 0.0
    return mutated


def _select_columns(feature_names: list[str], keywords: tuple[str, ...]) -> list[str]:
    matched = [name for name in feature_names if any(keyword in name.lower() for keyword in keywords)]
    if matched:
        return matched
    fallback_count = min(3, len(feature_names))
    return feature_names[:fallback_count]


def _stability_score(base: np.ndarray, perturbed: np.ndarray) -> float:
    if base.size == 0 or perturbed.size == 0:
        return 0.0
    delta = np.mean(np.abs(base - perturbed))
    return float(np.clip(1.0 - delta, 0.0, 1.0))


def _file_sha256(path: Path | None) -> Optional[str]:
    if path is None or not path.exists():
        return None
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(8192), b""):
            digest.update(chunk)
    return digest.hexdigest()
