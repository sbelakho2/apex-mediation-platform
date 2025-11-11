from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

ROOT = Path(__file__).resolve().parents[2]
SRC_ROOT = ROOT / "src"
if str(SRC_ROOT) not in sys.path:
    sys.path.insert(0, str(SRC_ROOT))

from ml_pipelines.models import TrainingConfig, train_models  # noqa: E402


@pytest.fixture()
def synthetic_dataset(tmp_path: Path) -> Path:
    rng = np.random.default_rng(1234)
    size = 80
    feature_a = rng.normal(0, 1, size)
    feature_b = rng.normal(2, 0.5, size)
    feature_c = rng.uniform(-1, 1, size)
    logits = 0.8 * feature_a + 1.5 * feature_b - 1.2 * feature_c
    probability = 1 / (1 + np.exp(-logits))
    labels = (probability > 0.6).astype(int)
    confidence = np.clip(probability, 0.1, 0.9)

    df = pd.DataFrame(
        {
            "feature_a": feature_a,
            "feature_b": feature_b,
            "feature_c": feature_c,
            "y_weak": labels,
            "confidence": confidence,
        }
    )
    path = tmp_path / "dataset.csv"
    df.to_csv(path, index=False)
    return path


def test_train_models_pipeline(tmp_path: Path, synthetic_dataset: Path) -> None:
    config = TrainingConfig(
        dataset_path=synthetic_dataset,
        output_root=tmp_path,
        run_id="test-run",
        epochs=3,
        batch_size=16,
        hidden_dim=16,
        learning_rate=5e-3,
    )

    artifacts = train_models(config)
    output_dir = config.output_dir

    assert (output_dir / "model.pt").exists()
    assert (output_dir / "autoencoder.pt").exists()
    assert (output_dir / "deepsvdd.pt").exists()
    assert (output_dir / "onnx" / "autoencoder.onnx").exists()
    assert (output_dir / "onnx" / "deepsvdd.onnx").exists()
    assert (output_dir / "isolation_forest.joblib").exists()
    assert (output_dir / "gbdt.joblib").exists()
    assert (output_dir / "metrics.json").exists()
    assert (output_dir / "training_manifest.json").exists()
    assert (output_dir / "model_card.md").exists()

    metrics = json.loads((output_dir / "metrics.json").read_text(encoding="utf-8"))
    required_metrics = [
        "autoencoder_pr_auc",
        "deepsvdd_pr_auc",
        "isolation_forest_pr_auc",
        "gbdt_pr_auc",
        "autoencoder_temperature",
        "deepsvdd_temperature",
    ]
    for key in required_metrics:
        assert key in metrics

    manifest = json.loads((output_dir / "training_manifest.json").read_text(encoding="utf-8"))
    assert manifest["run_id"] == "test-run"
    assert manifest["files"]["autoencoder_torch"].endswith("autoencoder.pt")

    model_card = (output_dir / "model_card.md").read_text(encoding="utf-8")
    assert "Model Card" in model_card
    assert "autoencoder" in model_card

    assert artifacts.metrics.get("gbdt_pr_auc") is not None


def test_train_models_cli(tmp_path: Path, synthetic_dataset: Path) -> None:
    output_root = tmp_path / "cli"
    script = ROOT.parent / "scripts" / "ml" / "train_models.py"
    result = subprocess.run(
        [
            sys.executable,
            str(script),
            str(synthetic_dataset),
            "--output-root",
            str(output_root),
            "--run-id",
            "cli-run",
            "--epochs",
            "2",
            "--batch-size",
            "16",
            "--hidden-dim",
            "8",
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    payload = json.loads(result.stdout)
    manifest_path = Path(payload["manifest"])
    assert manifest_path.exists()
    metrics_path = manifest_path.parent / "metrics.json"
    assert metrics_path.exists()