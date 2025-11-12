#!/usr/bin/env python3
"""
Environment snapshot utility for reproducible training.
Captures hardware, software versions, and data checksums.
"""
import hashlib
import json
import os
import platform
import sys
from datetime import UTC, datetime
from pathlib import Path
from typing import Dict, Optional

import pandas as pd


def _compute_file_hash(path: Path) -> str:
    """Compute SHA256 hash of a file."""
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(8192), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _get_package_versions() -> Dict[str, str]:
    """Extract versions of key ML dependencies."""
    versions = {}
    packages = [
        "numpy",
        "pandas",
        "scikit-learn",
        "torch",
        "xgboost",
        "onnx",
        "onnxruntime",
        "joblib",
    ]
    for package in packages:
        try:
            mod = __import__(package)
            versions[package] = getattr(mod, "__version__", "unknown")
        except ImportError:
            versions[package] = "not_installed"
    return versions


def _get_cuda_info() -> Dict[str, Optional[str]]:
    """Get CUDA version if available."""
    info: Dict[str, Optional[str]] = {"available": "false", "version": None}
    try:
        import torch

        if torch.cuda.is_available():
            info["available"] = "true"
            info["version"] = torch.version.cuda
            info["device_count"] = str(torch.cuda.device_count())
            info["device_name"] = torch.cuda.get_device_name(0) if torch.cuda.device_count() > 0 else None
    except (ImportError, AttributeError):
        pass
    return info


def capture_environment(
    features_path: Optional[str] = None,
    weak_labels_path: Optional[str] = None,
    seed: int = 42,
) -> Dict[str, object]:
    """
    Capture complete training environment snapshot.
    
    Args:
        features_path: Path to features parquet (will compute hash)
        weak_labels_path: Path to weak labels parquet (will compute hash)
        seed: Random seed used for training
    
    Returns:
        Dictionary with environment details
    """
    snapshot = {
        "captured_at": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
        "seed": seed,
        "platform": {
            "system": platform.system(),
            "release": platform.release(),
            "machine": platform.machine(),
            "processor": platform.processor(),
            "python_version": platform.python_version(),
            "python_implementation": platform.python_implementation(),
        },
        "packages": _get_package_versions(),
        "cuda": _get_cuda_info(),
        "environment": {
            "num_threads": os.cpu_count() or "unknown",
            "cuda_visible_devices": os.environ.get("CUDA_VISIBLE_DEVICES", "not_set"),
            "omp_num_threads": os.environ.get("OMP_NUM_THREADS", "not_set"),
        },
        "data": {},
    }

    # Compute data hashes
    if features_path and Path(features_path).exists():
        features_file = Path(features_path)
        snapshot["data"]["features_path"] = str(features_file)
        snapshot["data"]["features_sha256"] = _compute_file_hash(features_file)
        
        # Get feature count
        try:
            df = pd.read_parquet(features_file)
            snapshot["data"]["feature_count"] = len(df.columns)
            snapshot["data"]["sample_count"] = len(df)
        except Exception as e:
            snapshot["data"]["feature_count_error"] = str(e)

    if weak_labels_path and Path(weak_labels_path).exists():
        labels_file = Path(weak_labels_path)
        snapshot["data"]["weak_labels_path"] = str(labels_file)
        snapshot["data"]["weak_labels_sha256"] = _compute_file_hash(labels_file)

    return snapshot


def save_snapshot(snapshot: Dict[str, object], output_path: Path) -> None:
    """Save environment snapshot to JSON file."""
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", encoding="utf-8") as handle:
        json.dump(snapshot, handle, indent=2)


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Capture training environment snapshot")
    parser.add_argument("--features", help="Path to features parquet")
    parser.add_argument("--weak-labels", help="Path to weak labels parquet")
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--output", required=True, help="Output JSON path")
    args = parser.parse_args()

    snapshot = capture_environment(
        features_path=args.features,
        weak_labels_path=args.weak_labels,
        seed=args.seed,
    )
    
    output = Path(args.output)
    save_snapshot(snapshot, output)
    print(f"Environment snapshot saved to {output}")
