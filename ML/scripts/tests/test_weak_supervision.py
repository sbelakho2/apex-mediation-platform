from __future__ import annotations

from pathlib import Path
import sys

import pandas as pd
import pytest

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT / "src") not in sys.path:
    sys.path.insert(0, str(ROOT / "src"))

from ml_pipelines.weak_supervision import (  # noqa: E402
    LabelFunction,
    ProbabilisticLabelModel,
    apply_label_functions,
    compute_label_metrics,
)


def _build_dataset() -> pd.DataFrame:
    return pd.DataFrame(
        [
            {"ip_risk_score": 0.95, "is_tor": True, "velocity": 6, "chargeback_rate": 0.7},
            {"ip_risk_score": 0.05, "is_tor": False, "velocity": 2, "chargeback_rate": 0.2},
            {"ip_risk_score": 0.88, "is_tor": True, "velocity": 3, "chargeback_rate": 0.8},
            {"ip_risk_score": 0.12, "is_tor": False, "velocity": 0, "chargeback_rate": 0.3},
            {"ip_risk_score": 0.40, "is_tor": False, "velocity": 5, "chargeback_rate": 0.05},
        ]
    )


def _label_functions() -> list[LabelFunction]:
    return [
        LabelFunction(
            name="lf_tor_exit",
            func=lambda row: 1 if row.get("is_tor") else None,
            weight=1.2,
        ),
        LabelFunction(
            name="lf_chargeback",
            func=lambda row: 1 if row.get("chargeback_rate", 0.0) >= 0.5 else 0 if row.get("chargeback_rate", 0.0) <= 0.2 else None,
            weight=1.0,
        ),
        LabelFunction(
            name="lf_velocity",
            func=lambda row: 1 if row.get("velocity", 0) >= 5 else 0 if row.get("velocity", 0) == 0 else None,
            weight=1.0,
        ),
    ]


def test_label_function_metrics() -> None:
    dataset = _build_dataset()
    label_functions = _label_functions()
    matrix = apply_label_functions(label_functions, dataset)

    metrics = compute_label_metrics(matrix)

    assert metrics.coverage["lf_tor_exit"] == pytest.approx(0.4)
    assert metrics.coverage["lf_chargeback"] == pytest.approx(0.8)
    assert metrics.coverage["lf_velocity"] == pytest.approx(0.6)
    assert metrics.overall_coverage == pytest.approx(1.0)
    assert metrics.overlap_rate == pytest.approx(0.6)
    assert metrics.conflict_rate == pytest.approx(0.2)


def test_probabilistic_label_model_predictions() -> None:
    dataset = _build_dataset()
    label_functions = _label_functions()

    model = ProbabilisticLabelModel(label_functions)
    result = model.predict(dataset)

    preds = result.predictions
    assert list(preds["y_weak"]) == [1, 0, 1, 0, None]

    # First sample: strong agreement on fraud
    assert preds.loc[0, "confidence"] == pytest.approx(1.0)
    # Second sample: two negatives vs none positives
    assert preds.loc[1, "confidence"] == pytest.approx(1.0)
    # Last sample: mixed weak negatives/positives -> low confidence
    assert preds.loc[4, "confidence"] == pytest.approx(0.0)

    # Label matrix is returned for downstream analysis
    assert result.label_matrix.equals(apply_label_functions(label_functions, dataset))


def test_probabilistic_label_model_requires_functions() -> None:
    with pytest.raises(ValueError):
        ProbabilisticLabelModel([])
