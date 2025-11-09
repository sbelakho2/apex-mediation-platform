import numpy as np
import pandas as pd

from ML.scripts.monitor_shadow_scores import analyze_shadow_scores


def test_analyze_shadow_scores_outputs_expected_keys():
    timestamps = pd.date_range("2025-10-01", periods=200, freq="D")
    scores = np.clip(np.linspace(0.05, 0.95, num=200) + np.random.default_rng(42).normal(0, 0.05, 200), 0.0, 1.0)
    weak_labels = (scores > 0.6).astype(int)
    outcomes = (scores > 0.65).astype(int)

    frame = pd.DataFrame(
        {
            "generated_at": timestamps,
            "score": scores,
            "weak_label": weak_labels,
            "outcome": outcomes,
        }
    )

    payload, baseline = analyze_shadow_scores(frame, window_days=30, bins=10)

    assert "drift" in payload
    assert "weekly_summary" in payload and payload["weekly_summary"]
    assert "correlations" in payload and payload["correlations"]["weak_label"] is not None
    assert baseline["counts"] and len(baseline["counts"]) == 10
