import argparse
import json
import subprocess
import sys
from time import perf_counter
from pathlib import Path
from typing import Dict, List

from tqdm.auto import tqdm

DEFAULT_DATA_ROOT = Path("ML") / "ML Data"
DEFAULT_OUTPUT_ROOT = Path("data") / "training" / "latest"
DEFAULT_WORKDIR = Path("models") / "fraud" / "gpu_workdir"


def _run(cmd: List[str], name: str, timings: List[Dict[str, float]], bar: "tqdm") -> None:
    print(f"→ Running {name}: {' '.join(cmd)}")
    start = perf_counter()
    subprocess.run(cmd, check=True)
    duration = perf_counter() - start
    timings.append({"stage": name, "seconds": duration})
    bar.set_postfix({"last": f"{duration:.1f}s"})
    bar.update(1)


def main() -> None:
    parser = argparse.ArgumentParser(description="Nightly pipeline using GPU training stack")
    parser.add_argument("--data-root", default=str(DEFAULT_DATA_ROOT))
    parser.add_argument("--output-root", default=str(DEFAULT_OUTPUT_ROOT))
    parser.add_argument("--workdir", default=str(DEFAULT_WORKDIR))
    parser.add_argument("--sample-rows", type=int, default=5000)
    parser.add_argument("--chunk-rows", type=int, default=500_000)
    parser.add_argument("--npartitions", type=int, default=64)
    parser.add_argument("--backend", default="auto", choices=["auto", "cuml", "xgboost"])
    args = parser.parse_args()

    data_root = Path(args.data_root)
    output_root = Path(args.output_root)
    workdir = Path(args.workdir)
    features_dir = workdir / "features"
    model_dir = workdir / "model"

    workdir.mkdir(parents=True, exist_ok=True)

    stage_commands = [
        (
            "etl_public_datasets",
            [
                sys.executable,
                "ML/scripts/etl_public_datasets.py",
                "--root",
                str(data_root),
                "--output",
                str(output_root),
                "--chunk-rows",
                str(args.chunk_rows),
            ],
        ),
        (
            "feature_engineering_dask",
            [
                sys.executable,
                "ML/scripts/feature_engineering_dask.py",
                "--input",
                str(output_root),
                "--out",
                str(features_dir),
                "--sample-rows",
                str(args.sample_rows),
                "--npartitions",
                str(args.npartitions),
            ],
        ),
        (
            "train_gbm_gpu",
            [
                sys.executable,
                "ML/scripts/train_gbm_gpu.py",
                "--features",
                str(features_dir),
                "--out-dir",
                str(model_dir),
                "--backend",
                args.backend,
            ],
        ),
    ]

    timings: List[Dict[str, float]] = []
    with tqdm(total=len(stage_commands), desc="Pipeline stages", unit="stage") as bar:
        for name, cmd in stage_commands:
            _run(cmd, name, timings, bar)

    stats_summary: Dict[str, Dict[str, float]] = {}

    manifest_path = output_root / "public_datasets_manifest.json"
    if manifest_path.exists():
        with open(manifest_path, "r", encoding="utf-8") as handle:
            manifest = json.load(handle)
        dataset_rows = {
            dataset: info.get("row_count", 0)
            for dataset, info in manifest.get("datasets", {}).items()
        }
        stats_summary["datasets"] = dataset_rows

    feature_manifest_path = features_dir / "feature_manifest.json"
    if feature_manifest_path.exists():
        with open(feature_manifest_path, "r", encoding="utf-8") as handle:
            feature_manifest = json.load(handle)
        stats_summary["features"] = {
            "rows": feature_manifest.get("rows", 0),
            "partitions": feature_manifest.get("partitions", 0),
        }

    metrics_path = model_dir / "evaluation_metrics.json"
    if metrics_path.exists():
        with open(metrics_path, "r", encoding="utf-8") as handle:
            metrics_payload = json.load(handle)
        stats_summary["metrics"] = metrics_payload.get("metrics", {})

    stats_summary["timings"] = {entry["stage"]: entry["seconds"] for entry in timings}

    stats_output = workdir / "pipeline_stats.json"
    with open(stats_output, "w", encoding="utf-8") as handle:
        json.dump(stats_summary, handle, indent=2)

    print("Pipeline completed successfully")
    print("Stage durations (seconds):")
    for entry in timings:
        print(f" - {entry['stage']}: {entry['seconds']:.2f}s")

    if stats_summary.get("datasets"):
        print("Dataset row counts:")
        for dataset, rows in stats_summary["datasets"].items():
            print(f" - {dataset}: {int(rows):,} rows")

    if stats_summary.get("features"):
        feat = stats_summary["features"]
        print(
            f"Features: {int(feat.get('rows', 0)):,} rows across {int(feat.get('partitions', 0))} partitions"
        )

    if stats_summary.get("metrics"):
        metrics = stats_summary["metrics"]
        print("Validation metrics:")
        for metric, value in metrics.items():
            if isinstance(value, (int, float)):
                print(f" - {metric}: {value:.4f}")
            else:
                print(f" - {metric}: {value}")


if __name__ == "__main__":
    main()
