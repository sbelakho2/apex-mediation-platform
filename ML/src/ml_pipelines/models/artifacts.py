"""Artifact tracking structures for trained models."""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, Mapping


@dataclass(frozen=True)
class ModelArtifacts:
    """Resolved artifact paths for a single training run."""

    run_id: str
    output_dir: Path
    files: Mapping[str, Path] = field(default_factory=dict)
    metrics: Mapping[str, float] = field(default_factory=dict)

    def to_manifest(self) -> Dict[str, object]:
        return {
            "run_id": self.run_id,
            "output_dir": str(self.output_dir),
            "files": {name: str(path) for name, path in self.files.items()},
            "metrics": dict(self.metrics),
        }
