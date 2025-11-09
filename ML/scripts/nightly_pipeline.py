import argparse
import hashlib
import os
import subprocess
import sys
import time
from pathlib import Path
from typing import Dict, List, Optional

DEFAULT_DATASET_ROOT = Path("data") / "training" / "latest"
DEFAULT_WORKDIR = Path("models") / "fraud" / "workdir"
DEFAULT_FINGERPRINT_FILE = DEFAULT_WORKDIR / ".last_dataset_fingerprint"


def _build_steps(small_sample: bool, sample_size: Optional[int]) -> List[Dict[str, object]]:
    feature_command = [
        sys.executable,
        "ML/scripts/feature_engineering.py",
        "--input",
        str(DEFAULT_DATASET_ROOT),
        "--out-dir",
        str(DEFAULT_WORKDIR / "features"),
    ]
    if small_sample and sample_size:
        feature_command.extend(["--sample-size", str(sample_size)])
    feature_command.extend(["--seed", "42"])

    steps: List[Dict[str, object]] = [
        {
            "name": "feature_engineering",
            "command": feature_command,
        },
        {
            "name": "train_supervised_logreg",
            "command": [
                sys.executable,
                "ML/scripts/train_supervised_logreg.py",
                "--features",
                str(DEFAULT_WORKDIR / "features" / "features.parquet"),
                "--out-dir",
                str(DEFAULT_WORKDIR / "model"),
                "--seed",
                "42",
            ],
        },
        {
            "name": "evaluate_model",
            "command": [
                sys.executable,
                "ML/scripts/evaluate_model.py",
                "--model-dir",
                str(DEFAULT_WORKDIR / "model"),
                "--features",
                str(DEFAULT_WORKDIR / "features" / "features.parquet"),
            ],
        },
        {
            "name": "package_model",
            "command": [
                sys.executable,
                "ML/scripts/package_model.py",
                "--model-dir",
                str(DEFAULT_WORKDIR / "model"),
                "--extra",
                str(DEFAULT_WORKDIR / "features" / "feature_manifest.json"),
            ],
        },
        {
            "name": "monitor_shadow_scores",
            "command": [
                sys.executable,
                "ML/scripts/monitor_shadow_scores.py",
                "--shadow-parquet",
                str(DEFAULT_WORKDIR / "shadow" / "shadow_scores.parquet"),
                "--output-dir",
                str(Path("models") / "fraud" / "monitoring"),
                "--update-baseline",
            ],
            "skip_if_missing": DEFAULT_WORKDIR / "shadow" / "shadow_scores.parquet",
        },
    ]

    return steps


def _compute_fingerprint(path: Path) -> Optional[str]:
    if not path.exists():
        return None
    digest = hashlib.sha256()
    if path.is_dir():
        for root, _dirs, files in os.walk(path):
            for name in sorted(files):
                full_path = Path(root) / name
                rel = full_path.relative_to(path)
                stat = full_path.stat()
                digest.update(str(rel).encode("utf-8"))
                digest.update(str(int(stat.st_mtime)).encode("utf-8"))
                digest.update(str(stat.st_size).encode("utf-8"))
    else:
        stat = path.stat()
        digest.update(path.name.encode("utf-8"))
        digest.update(str(int(stat.st_mtime)).encode("utf-8"))
        digest.update(str(stat.st_size).encode("utf-8"))
        with path.open("rb") as handle:
            for chunk in iter(lambda: handle.read(8192), b""):
                digest.update(chunk)
    return digest.hexdigest()


def _run_step(step: Dict[str, object], *, time_budget_seconds: Optional[float]) -> None:
    name = step["name"]
    command: List[str] = step["command"]
    guard_value = step.get("skip_if_missing")
    if guard_value is not None and not Path(guard_value).exists():
        print(f"→ Skipping {name} (missing {guard_value})")
        return

    print(f"→ Running {name}...")
    start = time.time()
    try:
        subprocess.run(command, check=True)
    except subprocess.CalledProcessError as exc:
        raise SystemExit(f"Step '{name}' failed with exit code {exc.returncode}")
    duration = time.time() - start
    if time_budget_seconds is not None and duration > time_budget_seconds:
        raise SystemExit(f"Step '{name}' exceeded time budget ({duration:.1f}s > {time_budget_seconds:.1f}s)")


def run_pipeline(
    *,
    selected: Optional[List[str]],
    small_sample: bool,
    sample_size: Optional[int],
    skip_if_unchanged: bool,
    fingerprint_source: Path,
    fingerprint_file: Path,
    max_runtime_minutes: Optional[int],
) -> None:
    steps = _build_steps(small_sample, sample_size)
    if selected:
        lookup = {step["name"]: step for step in steps}
        steps = [lookup[name] for name in selected if name in lookup]
        if not steps:
            raise SystemExit("No valid steps selected")

    fingerprint = None
    if skip_if_unchanged:
        fingerprint = _compute_fingerprint(fingerprint_source)
        if fingerprint is not None and fingerprint_file.exists():
            previous = fingerprint_file.read_text(encoding="utf-8").strip()
            if previous == fingerprint:
                print("No material dataset changes detected — skipping pipeline to save compute.")
                return

    budget_seconds = max_runtime_minutes * 60 if max_runtime_minutes else None
    for step in steps:
        _run_step(step, time_budget_seconds=budget_seconds)

    if skip_if_unchanged and fingerprint is not None:
        fingerprint_file.parent.mkdir(parents=True, exist_ok=True)
        fingerprint_file.write_text(fingerprint, encoding="utf-8")


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Nightly ML pipeline orchestration")
    parser.add_argument(
        "--steps",
        nargs="*",
        help="Optional subset of steps to run (defaults to full pipeline)",
    )
    parser.add_argument(
        "--small-sample",
        action="store_true",
        help="Run feature engineering on a deterministic sample (for CI smoke runs)",
    )
    parser.add_argument(
        "--sample-size",
        type=int,
        default=5000,
        help="Sample size to use when --small-sample is enabled",
    )
    parser.add_argument(
        "--skip-if-unchanged",
        action="store_true",
        help="Skip training/evaluation if the training dataset fingerprint has not changed",
    )
    parser.add_argument(
        "--fingerprint-source",
        default=str(DEFAULT_DATASET_ROOT),
        help="Directory or file used to compute the dataset fingerprint",
    )
    parser.add_argument(
        "--fingerprint-file",
        default=str(DEFAULT_FINGERPRINT_FILE),
        help="Location where the last dataset fingerprint is stored",
    )
    parser.add_argument(
        "--max-runtime-minutes",
        type=int,
        help="Optional per-step runtime cap in minutes (fails fast if exceeded)",
    )
    return parser


def main(argv: Optional[List[str]] = None) -> None:
    parser = build_arg_parser()
    args = parser.parse_args(argv)
    run_pipeline(
        selected=args.steps,
        small_sample=args.small_sample,
        sample_size=args.sample_size if args.small_sample else None,
        skip_if_unchanged=args.skip_if_unchanged,
        fingerprint_source=Path(args.fingerprint_source),
        fingerprint_file=Path(args.fingerprint_file),
        max_runtime_minutes=args.max_runtime_minutes,
    )


if __name__ == "__main__":
    main()
