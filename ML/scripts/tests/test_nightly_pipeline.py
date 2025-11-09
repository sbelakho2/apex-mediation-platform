from pathlib import Path

from ML.scripts.nightly_pipeline import _build_steps, _compute_fingerprint


def test_build_steps_includes_sampling_flags_when_enabled():
    steps = _build_steps(small_sample=True, sample_size=100)
    feature_step = next(step for step in steps if step["name"] == "feature_engineering")
    command = feature_step["command"]
    assert "--sample-size" in command
    assert "100" in command


def test_compute_fingerprint_changes_with_file(tmp_path):
    sample_file = tmp_path / "data.parquet"
    sample_file.write_text("one", encoding="utf-8")

    first = _compute_fingerprint(sample_file)
    assert first is not None

    sample_file.write_text("two", encoding="utf-8")
    second = _compute_fingerprint(sample_file)

    assert first != second
    assert len(first) == 64 and len(second) == 64
