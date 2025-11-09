import argparse
import json
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import numpy as np
import pandas as pd

DEFAULT_OUTPUT_DIR = Path("models") / "fraud" / "monitoring"
DEFAULT_BASELINE_NAME = "shadow_baseline.json"
DEFAULT_LATEST_NAME = "shadow_monitor_latest.json"


def _histogram(scores: np.ndarray, *, bins: int = 20) -> Dict[str, object]:
    counts, edges = np.histogram(scores, bins=bins, range=(0.0, 1.0))
    total = float(counts.sum())
    percentages = counts / np.clip(total, 1e-9, None)
    return {
        "counts": counts.astype(int).tolist(),
        "percentages": percentages.tolist(),
        "bin_edges": edges.tolist(),
        "total": int(total),
        "bins": int(bins),
    }


def _psi(baseline: np.ndarray, current: np.ndarray) -> float:
    epsilon = 1e-6
    terms = (current - baseline) * np.log(np.clip(current + epsilon, epsilon, None) / np.clip(baseline + epsilon, epsilon, None))
    return float(np.sum(terms))


def _js_divergence(p: np.ndarray, q: np.ndarray) -> float:
    epsilon = 1e-6
    p = np.clip(p, epsilon, 1.0)
    q = np.clip(q, epsilon, 1.0)
    m = 0.5 * (p + q)
    kl_pm = np.sum(p * np.log(p / m))
    kl_qm = np.sum(q * np.log(q / m))
    return float(0.5 * (kl_pm + kl_qm))


def _correlation(scores: pd.Series, other: pd.Series) -> Optional[float]:
    if other.isna().all():
        return None
    if other.nunique() < 2:
        return None
    try:
        corr = np.corrcoef(scores.to_numpy(), other.to_numpy())[0, 1]
    except FloatingPointError:
        return None
    if np.isnan(corr):
        return None
    return float(corr)


def analyze_shadow_scores(
    frame: pd.DataFrame,
    *,
    window_days: int,
    baseline_histogram: Optional[Dict[str, object]] = None,
    bins: int = 20,
) -> Tuple[Dict[str, object], Dict[str, object]]:
    if frame.empty:
        raise SystemExit("Shadow score dataset is empty")

    frame = frame.copy()
    frame["generated_at"] = pd.to_datetime(frame["generated_at"], errors="coerce")
    frame = frame.dropna(subset=["generated_at", "score"])
    frame.sort_values("generated_at", inplace=True)

    scores = frame["score"].to_numpy(dtype=np.float32)
    histogram = _histogram(scores, bins=bins)

    if baseline_histogram is None:
        baseline_histogram = histogram

    recent_cutoff = frame["generated_at"].max() - timedelta(days=window_days)
    recent = frame[frame["generated_at"] >= recent_cutoff]
    recent_scores = recent["score"].to_numpy(dtype=np.float32) if not recent.empty else scores
    recent_histogram = _histogram(recent_scores, bins=bins)

    baseline_pct = np.array(baseline_histogram["percentages"], dtype=np.float64)
    current_pct = np.array(recent_histogram["percentages"], dtype=np.float64)
    if baseline_pct.shape != current_pct.shape:
        min_len = min(len(baseline_pct), len(current_pct))
        baseline_pct = baseline_pct[:min_len]
        current_pct = current_pct[:min_len]
    baseline_pct = baseline_pct / np.clip(baseline_pct.sum(), 1e-9, None)
    current_pct = current_pct / np.clip(current_pct.sum(), 1e-9, None)
    psi = _psi(baseline_pct, current_pct)
    js = _js_divergence(baseline_pct, current_pct)

    weekly = []
    for period, subset in frame.groupby(frame["generated_at"].dt.to_period("W")):
        weekly.append(
            {
                "week": str(period),
                "count": int(subset.shape[0]),
                "mean": float(subset["score"].mean()),
                "std": float(subset["score"].std(ddof=0)),
                "p10": float(subset["score"].quantile(0.10)),
                "p50": float(subset["score"].quantile(0.50)),
                "p90": float(subset["score"].quantile(0.90)),
            }
        )

    weak_corr = _correlation(frame["score"], frame["weak_label"]) if "weak_label" in frame.columns else None
    outcome_corr = _correlation(frame["score"], frame["outcome"]) if "outcome" in frame.columns else None

    alert = psi > 0.25 or js > 0.1

    payload = {
    "generated_at": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
        "window_days": int(window_days),
        "records_analyzed": int(frame.shape[0]),
        "drift": {
            "population_stability_index": psi,
            "jensen_shannon_divergence": js,
            "alert": bool(alert),
            "baseline_total": int(baseline_histogram["total"]),
            "current_total": int(recent_histogram["total"]),
        },
        "histogram": recent_histogram,
        "weekly_summary": weekly,
        "correlations": {
            "weak_label": weak_corr,
            "post_hoc_outcome": outcome_corr,
        },
        "score_summary": {
            "min": float(scores.min()),
            "max": float(scores.max()),
            "mean": float(scores.mean()),
            "std": float(scores.std()),
        },
    }

    return payload, histogram


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Analyze fraud shadow scores for drift monitoring")
    parser.add_argument("--shadow-parquet", required=True, help="Parquet file containing shadow score events")
    parser.add_argument(
        "--output-dir",
        default=str(DEFAULT_OUTPUT_DIR),
        help="Directory where monitoring artifacts will be written",
    )
    parser.add_argument(
        "--baseline",
        help="Optional explicit baseline JSON; defaults to output-dir/shadow_baseline.json",
    )
    parser.add_argument("--window-days", type=int, default=7, help="Recent window to analyze for drift")
    parser.add_argument(
        "--update-baseline",
        action="store_true",
        help="If set, update the baseline histogram with the current dataset",
    )
    parser.add_argument(
        "--bins",
        type=int,
        default=20,
        help="Histogram bins for drift calculations",
    )
    return parser


def run(argv: Optional[List[str]] = None) -> Path:
    parser = build_arg_parser()
    args = parser.parse_args(argv)

    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    frame = pd.read_parquet(args.shadow_parquet)

    baseline_path = Path(args.baseline) if args.baseline else output_dir / DEFAULT_BASELINE_NAME
    baseline_histogram: Optional[Dict[str, object]] = None
    if baseline_path.exists():
        with baseline_path.open("r", encoding="utf-8") as handle:
            baseline_histogram = json.load(handle)

    payload, histogram = analyze_shadow_scores(
        frame,
        window_days=args.window_days,
        baseline_histogram=baseline_histogram,
        bins=args.bins,
    )

    timestamp = datetime.now(UTC).strftime("%Y%m%d_%H%M%S")
    summary_path = output_dir / f"shadow_monitor_{timestamp}.json"
    with summary_path.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2)

    latest_path = output_dir / DEFAULT_LATEST_NAME
    with latest_path.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2)

    if args.update_baseline or baseline_histogram is None:
        with baseline_path.open("w", encoding="utf-8") as handle:
            json.dump(histogram, handle, indent=2)

    return summary_path


def main() -> None:
    run()


if __name__ == "__main__":
    main()
