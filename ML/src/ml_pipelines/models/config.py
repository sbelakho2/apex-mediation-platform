"""Configuration helpers for model training."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Optional, Sequence

import torch


@dataclass
class TrainingConfig:
    dataset_path: Path
    output_root: Path = Path("models")
    run_id: Optional[str] = None
    target_column: str = "y_weak"
    weight_column: Optional[str] = "confidence"
    feature_columns: Optional[Sequence[str]] = None
    test_size: float = 0.25
    random_state: int = 42
    epochs: int = 5
    batch_size: int = 32
    learning_rate: float = 1e-3
    hidden_dim: int = 32
    patience: int = 3

    def __post_init__(self) -> None:
        self.dataset_path = Path(self.dataset_path)
        self.output_root = Path(self.output_root)
        if self.run_id is None:
            self.run_id = datetime.utcnow().strftime("%Y%m%d-%H%M%S")

    @property
    def device(self) -> torch.device:
        return torch.device("cuda" if torch.cuda.is_available() else "cpu")

    @property
    def output_dir(self) -> Path:
        return self.output_root / str(self.run_id)

    def ensure_output_dir(self) -> Path:
        path = self.output_dir
        path.mkdir(parents=True, exist_ok=True)
        (path / "onnx").mkdir(exist_ok=True)
        return path


__all__ = ["TrainingConfig"]
