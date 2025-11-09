import json
from datetime import datetime, timedelta
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

from ML.scripts import train_pyod


@pytest.fixture()
def sample_features(tmp_path: Path) -> Path:
    frame = pd.DataFrame(
        {
            "feature_a": [0.0, 0.0, 1.0, 1.0, 10.0],
            "feature_b": [0.0, 1.0, 0.0, 1.0, 10.0],
            "event_time": [datetime(2025, 1, 1) + timedelta(hours=i) for i in range(5)],
            "ip": ["1.1.1.1"] * 5,
        }
    )
    path = tmp_path / "features.parquet"
    frame.to_parquet(path, index=False)
    return path


def test_train_pyod_generates_deterministic_outputs(tmp_path: Path, sample_features: Path) -> None:
    out_dir = tmp_path / "out"
    train_pyod.run(
        [
            "--in-parquet",
            str(sample_features),
            "--out-dir",
            str(out_dir),
            "--model",
            "iforest",
            "--contamination",
            "0.4",
        ]
    )

    scores = pd.read_parquet(out_dir / "anomaly_scores.parquet")
    expected_scores = pd.DataFrame(
        {
            "score": np.array(
                [
                    0.026401283988956636,
                    -0.017600855992637776,
                    -0.02370405531771086,
                    -0.020053048813346297,
                    0.22659905679452458,
                ]
            ),
            "label_weak": np.array([1, 0, 0, 0, 1], dtype=np.int32),
        }
    )
    pd.testing.assert_frame_equal(
        scores,
        expected_scores,
        check_dtype=False,
        atol=1e-6,
    )

    weak_labels = pd.read_parquet(out_dir / "weak_labels.parquet")
    assert list(weak_labels.columns) == train_pyod.OUTPUT_SCHEMAS["weak_labels"]
    assert list(weak_labels["label_weak"].astype(int)) == [1, 0, 0, 0, 1]

    with open(out_dir / "pyod_meta.json", "r", encoding="utf-8") as fh:
        meta = json.load(fh)
    assert meta["rows"] == 5
    assert meta["feature_cols"] == ["feature_a", "feature_b", "event_time"]
    assert meta["schemas"] == train_pyod.OUTPUT_SCHEMAS
    assert meta["dropped_cols"] == ["ip", "user_id", "gaid", "idfa", "ifa", "adid"]


def test_train_pyod_applies_limit_and_date_filter(tmp_path: Path, sample_features: Path) -> None:
    out_dir = tmp_path / "limit_out"
    date_start = "2025-01-01"
    date_end = "2025-01-02"

    train_pyod.run(
        [
            "--in-parquet",
            str(sample_features),
            "--out-dir",
            str(out_dir),
            "--model",
            "copod",
            "--limit",
            "3",
            "--date-col",
            "event_time",
            "--date-start",
            date_start,
            "--date-end",
            date_end,
        ]
    )

    scores = pd.read_parquet(out_dir / "anomaly_scores.parquet")
    # Limit should reduce to first three rows after date filter (all rows match) -> 3 rows
    assert scores.shape[0] == 3
    assert list(scores.columns) == train_pyod.OUTPUT_SCHEMAS["anomaly_scores"]

    with open(out_dir / "pyod_meta.json", "r", encoding="utf-8") as fh:
        meta = json.load(fh)
    assert meta["rows"] == 3
    assert meta["date_filter"] == {
        "col": "event_time",
        "start": date_start,
        "end": date_end,
    }
