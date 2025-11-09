import argparse
import hashlib
import json
import shutil
from datetime import UTC, datetime
from pathlib import Path
from typing import Dict, List, Optional

REGISTRY_ROOT = Path("models") / "fraud"


class PackagingError(RuntimeError):
    pass


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(8192), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _load_artifact(model_dir: Path) -> Dict[str, object]:
    artifact_path = model_dir / "trained_fraud_model.json"
    if not artifact_path.exists():
        raise PackagingError(f"Missing artifact file at {artifact_path}")
    with artifact_path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def _collect_files(model_dir: Path, extra_files: Optional[List[str]]) -> List[Path]:
    expected = [
        model_dir / "logreg_calibrated.pkl",
        model_dir / "trained_fraud_model.json",
        model_dir / "train_meta.json",
        model_dir / "evaluation_metrics.json",
    ]
    if extra_files:
        expected.extend(Path(path) for path in extra_files)
    files = [path for path in expected if path.exists()]
    if len(files) < 3:
        raise PackagingError("Not enough artifacts present to package model")
    return files


def _write_manifest(destination: Path, version: str, files: List[Path]) -> None:
    manifest = {
        "version": version,
    "packaged_at": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
        "artifacts": [
            {
                "name": file.name,
                "sha256": _sha256(destination / file.name),
                "size_bytes": (destination / file.name).stat().st_size,
            }
            for file in files
        ],
    }
    manifest_path = destination / "model_manifest.json"
    with manifest_path.open("w", encoding="utf-8") as handle:
        json.dump(manifest, handle, indent=2)


def _update_latest_pointer(registry_root: Path, target: Path) -> None:
    latest_link = registry_root / "latest"
    if latest_link.exists() or latest_link.is_symlink():
        try:
            latest_link.unlink()
        except OSError:
            pass
    try:
        latest_link.symlink_to(target)
        return
    except OSError:
        # Windows without admin privileges: fall back to writing a pointer file
        pointer_path = registry_root / "LATEST.json"
        payload = {
            "updated_at": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
            "current": str(target.name),
        }
        with pointer_path.open("w", encoding="utf-8") as handle:
            json.dump(payload, handle, indent=2)


def package_model(model_dir: Path, registry_root: Path, extra_files: Optional[List[str]]) -> Path:
    artifact = _load_artifact(model_dir)
    version = artifact.get("version")
    if not version:
        raise PackagingError("Artifact missing 'version' field")

    target_dir = registry_root / version
    target_dir.mkdir(parents=True, exist_ok=True)

    files = _collect_files(model_dir, extra_files)
    for path in files:
        shutil.copy2(path, target_dir / path.name)

    _write_manifest(target_dir, version, files)
    _update_latest_pointer(registry_root, target_dir)

    return target_dir


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Package trained fraud model into versioned registry")
    parser.add_argument("--model-dir", required=True, help="Directory with trained model artifacts")
    parser.add_argument(
        "--registry-root",
        default=str(REGISTRY_ROOT),
        help="Registry root (default: models/fraud)",
    )
    parser.add_argument(
        "--extra",
        nargs="*",
        help="Optional extra files to copy alongside the model (e.g., feature manifest)",
    )
    return parser


def run(argv: Optional[List[str]] = None) -> Path:
    parser = build_arg_parser()
    args = parser.parse_args(argv)
    model_dir = Path(args.model_dir)
    registry_root = Path(args.registry_root)
    registry_root.mkdir(parents=True, exist_ok=True)
    return package_model(model_dir, registry_root, args.extra)


def main() -> None:
    run()


if __name__ == "__main__":
    main()
