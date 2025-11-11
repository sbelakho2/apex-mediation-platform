from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
import sys

import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT / "src") not in sys.path:
    sys.path.insert(0, str(ROOT / "src"))

from ml_pipelines.feature_store.offline_builder import OfflineFeatureBuilder
from ml_pipelines.feature_store.online_calculator import OnlineFeatureCalculator


def _write_manifest(base: Path, source: str, run_date: str, entries: list[dict], files: dict[str, str]) -> None:
    run_dir = base / "v1" / source / run_date
    run_dir.mkdir(parents=True, exist_ok=True)
    for filename, content in files.items():
        (run_dir / filename).write_text(content, encoding="utf-8")
    manifest = {
        "source": source,
        "version": "v1",
        "runDate": run_date,
        "generatedAt": f"{run_date}T00:00:00Z",
        "entries": entries,
    }
    (run_dir / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")


def test_offline_builder_generates_parquet_and_schema(tmp_path: Path) -> None:
    enrichment_root = tmp_path / "data" / "enrichment"
    entries = [
        {
            "name": "torbulkexitlist",
            "file": "torbulkexitlist.txt",
            "fetched_at": "2025-01-01T00:00:00Z",
        }
    ]
    files = {"torbulkexitlist.txt": "203.0.113.5\n"}
    _write_manifest(enrichment_root, "tor", "2025-01-01", entries, files)

    builder = OfflineFeatureBuilder(enrichment_root)
    dataset = builder.build(tmp_path / "features", retention_days=30)

    parquet_path = dataset.output_dir / "ip_enrichment.parquet"
    schema_path = dataset.output_dir / "schema.json"
    assert parquet_path.exists()
    assert schema_path.exists()

    reloaded = pd.read_parquet(parquet_path)
    assert "hashed_network" in reloaded.columns
    assert bool(reloaded.iloc[0]["is_tor"])

    calculator = OnlineFeatureCalculator(reloaded)
    result = calculator.lookup("203.0.113.5")
    assert result.features["is_tor"] is True
    assert result.features["scoreable"] is True


def test_retention_prunes_old_runs(tmp_path: Path) -> None:
    enrichment_root = tmp_path / "data" / "enrichment"
    old_date = (datetime.now(timezone.utc) - timedelta(days=400)).strftime("%Y-%m-%d")
    recent_date = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    _write_manifest(
        enrichment_root,
        "ripe",
        old_date,
        [
            {
                "name": "ripe-as15169",
                "file": "as15169.json",
                "fetched_at": "2024-01-01T00:00:00Z",
            }
        ],
        {"as15169.json": json.dumps({"data": {"prefixes": [{"prefix": "8.8.8.0/24", "asn": "15169"}]}})},
    )

    _write_manifest(
        enrichment_root,
        "ripe",
        recent_date,
        [
            {
                "name": "ripe-as15169",
                "file": "as15169.json",
                "fetched_at": "2025-01-01T00:00:00Z",
            }
        ],
        {"as15169.json": json.dumps({"data": {"prefixes": [{"prefix": "8.8.4.0/24", "asn": "15169"}]}})},
    )

    builder = OfflineFeatureBuilder(enrichment_root)
    builder.build(tmp_path / "features", retention_days=365)

    pruned_dir = enrichment_root / "v1" / "ripe" / old_date
    assert not pruned_dir.exists()

    remaining_dir = enrichment_root / "v1" / "ripe" / recent_date
    assert remaining_dir.exists()
