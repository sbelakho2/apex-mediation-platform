import argparse
import json
import os
from collections import defaultdict, deque
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Deque, Dict, Iterable, List, Optional, Tuple

import numpy as np
import pandas as pd

DEFAULT_TIME_COLUMN = "event_time"
DEFAULT_LABEL_COLUMN = "label"
ROLLING_WINDOWS = {
    "1h": timedelta(hours=1),
    "24h": timedelta(hours=24),
    "7d": timedelta(days=7),
}


@dataclass
class RollingStatsConfig:
    key: str
    event_flag: Optional[str] = None  # event_type value or column name for indicator
    column: Optional[str] = None  # optional column containing numeric values to sum


def _load_input_frames(input_path: str) -> pd.DataFrame:
    if os.path.isdir(input_path):
        frames: List[pd.DataFrame] = []
        for root, _dirs, files in os.walk(input_path):
            for name in files:
                if name.lower().endswith(".parquet"):
                    frames.append(pd.read_parquet(os.path.join(root, name)))
        if not frames:
            raise SystemExit(f"No parquet files found under {input_path}")
        return pd.concat(frames, ignore_index=True)
    if not os.path.exists(input_path):
        raise SystemExit(f"Input path not found: {input_path}")
    return pd.read_parquet(input_path)


def _ensure_datetime(series: pd.Series) -> pd.Series:
    if pd.api.types.is_datetime64_any_dtype(series):
        return series
    return pd.to_datetime(series, errors="coerce")


def _safe_column(df: pd.DataFrame, name: str, default: float = 0.0) -> pd.Series:
    if name in df.columns:
        return df[name].fillna(default)
    return pd.Series(np.full(df.shape[0], default), index=df.index)


def _entropy(values: Iterable) -> float:
    counts = pd.Series(list(values)).value_counts()
    if counts.empty:
        return 0.0
    probs = counts / counts.sum()
    return float(-(probs * np.log2(np.clip(probs, 1e-12, None))).sum())


def _burstiness(timestamps: List[pd.Timestamp]) -> float:
    if len(timestamps) < 3:
        return 0.0
    timestamps = sorted(timestamps)
    gaps = np.diff([ts.value for ts in timestamps])
    if len(gaps) == 0:
        return 0.0
    mu = gaps.mean()
    sigma = gaps.std()
    if mu == 0 and sigma == 0:
        return 0.0
    return float((sigma - mu) / (sigma + mu + 1e-9))


def _compute_rolling_counts(
    times: pd.Series,
    keys: pd.Series,
    window: timedelta,
    weights: Optional[pd.Series] = None,
) -> np.ndarray:
    result = np.zeros(len(times), dtype=np.float32)
    buffers: Dict[str, Deque] = defaultdict(deque)
    for idx, (ts, key) in enumerate(zip(times, keys)):
        if pd.isna(ts) or key is None:
            continue
        queue = buffers[str(key)]
        queue.append((ts, weights.iloc[idx] if weights is not None else 1.0))
        cutoff = ts - window
        while queue and queue[0][0] < cutoff:
            queue.popleft()
        result[idx] = float(sum(item[1] for item in queue))
    return result


def engineer_features(
    df: pd.DataFrame,
    *,
    time_column: str = DEFAULT_TIME_COLUMN,
    label_column: str = DEFAULT_LABEL_COLUMN,
) -> Tuple[pd.DataFrame, Dict[str, object]]:
    output = pd.DataFrame(index=df.index)

    if time_column not in df.columns:
        raise SystemExit(f"Dataset must include column '{time_column}' for temporal features")

    timestamps = _ensure_datetime(df[time_column]).fillna(pd.Timestamp(0, tz="UTC"))
    output["hour_of_day"] = timestamps.dt.hour.astype(np.float32)
    output["day_of_week"] = timestamps.dt.dayofweek.astype(np.float32)
    output["is_weekend"] = timestamps.dt.dayofweek.isin([5, 6]).astype(np.float32)
    output["event_age_hours"] = (timestamps.max() - timestamps).dt.total_seconds().astype(np.float32) / 3600.0

    label_series = _safe_column(df, label_column, default=0.0)

    # Rolling aggregates for IP, ASN, device, placement
    entity_columns = {
        "ip": "ip",
        "asn": "asn",
        "device": "device_id_hash",
        "placement": "placement_id",
    }
    event_types = _safe_column(df, "event_type", default="event")

    for entity_name, column_name in entity_columns.items():
        if column_name not in df.columns:
            continue
        keys = df[column_name].fillna("unknown").astype(str)
        for window_name, window_delta in ROLLING_WINDOWS.items():
            rolling_total = _compute_rolling_counts(timestamps, keys, window_delta)
            output[f"{entity_name}_rolling_events_{window_name}"] = rolling_total

            if label_series.sum() > 0:
                weighted = _compute_rolling_counts(
                    timestamps,
                    keys,
                    window_delta,
                    weights=label_series,
                )
                rate = np.divide(
                    weighted,
                    rolling_total,
                    out=np.zeros_like(weighted),
                    where=rolling_total > 0,
                )
                output[f"{entity_name}_rolling_positive_rate_{window_name}"] = rate

        # Entropy / burstiness features
        if "placement_id" in df.columns:
            entropy_lookup = (
                pd.DataFrame({"key": keys, "placement": df["placement_id"]})
                .groupby("key", dropna=False)["placement"]
                .agg(lambda vals: _entropy(vals))
            )
            output[f"{entity_name}_entropy"] = keys.map(entropy_lookup).fillna(0.0).astype(np.float32)
        else:
            output[f"{entity_name}_entropy"] = 0.0

        burst_lookup = (
            pd.DataFrame({"key": keys, "timestamp": timestamps})
            .groupby("key", dropna=False)["timestamp"]
            .agg(lambda vals: _burstiness(list(vals)))
        )
        output[f"{entity_name}_burstiness"] = keys.map(burst_lookup).fillna(0.0).astype(np.float32)

    # Event type ratios (click / impression / install)
    if "event_type" in df.columns:
        types = event_types.astype(str).str.lower()
        for etype in ("impression", "click", "install"):
            output[f"is_{etype}"] = (types == etype).astype(np.float32)
        denom = output["is_impression"] + 1e-6
        output["ctr_event"] = output["is_click"] / denom
        output["install_rate_event"] = output["is_install"] / denom

    # CTIT heuristics
    if "ctit_seconds" in df.columns:
        ctit = _safe_column(df, "ctit_seconds")
        output["ctit_seconds"] = ctit.astype(np.float32)
        output["ctit_log_seconds"] = np.log1p(ctit).astype(np.float32)
        output["ctit_is_ultrashort"] = (ctit <= 5).astype(np.float32)
        output["ctit_is_ultralong"] = (ctit >= 86400).astype(np.float32)

    # Supply-chain / auction features
    if "seller_relationship" in df.columns:
        rel = df["seller_relationship"].astype(str).str.upper()
        output["supply_chain_is_reseller"] = rel.isin(["RESELLER", "BOTH"]).astype(np.float32)
    elif "supply_chain_relationship" in df.columns:
        rel = df["supply_chain_relationship"].astype(str).str.upper()
        output["supply_chain_is_reseller"] = rel.isin(["RESELLER", "BOTH"]).astype(np.float32)
    else:
        output["supply_chain_is_reseller"] = 0.0

    if "schain_nodes" in df.columns:
        depth = df["schain_nodes"].apply(lambda nodes: len(nodes) if isinstance(nodes, (list, tuple)) else 1)
        output["supply_chain_depth"] = depth.astype(np.float32)
    else:
        output["supply_chain_depth"] = _safe_column(df, "supply_chain_depth", default=1.0).astype(np.float32)

    if "auction_bid_count" in df.columns:
        output["auction_bid_count"] = _safe_column(df, "auction_bid_count").astype(np.float32)
    if "auction_timeout_ms" in df.columns:
        output["auction_timeout_ms"] = _safe_column(df, "auction_timeout_ms").astype(np.float32)
    if "auction_win_ecpm" in df.columns:
        output["auction_win_ecpm"] = _safe_column(df, "auction_win_ecpm").astype(np.float32)

    # OMSDK / engagement features
    if "omsdk_viewable_time_ms" in df.columns:
        output["omsdk_viewable_time_ms"] = _safe_column(df, "omsdk_viewable_time_ms").astype(np.float32)
    if "omsdk_viewable_ratio" in df.columns:
        output["omsdk_viewable_ratio"] = _safe_column(df, "omsdk_viewable_ratio").astype(np.float32)
    if "engagement_events" in df.columns:
        output["engagement_event_count"] = df["engagement_events"].apply(
            lambda events: float(len(events)) if isinstance(events, (list, tuple)) else 0.0
        )

    # Train/serve parity guard: track features requiring history
    parity = []
    for column in output.columns:
        parity.append(
            {
                "feature": column,
                "requires_history": "rolling" in column or column.endswith("_entropy") or column.endswith("_burstiness"),
                "source": "engineered",
            }
        )

    if label_column in df.columns:
        output[label_column] = label_series.astype(np.float32)

    metadata = {
        "generated_at": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
        "input_columns": list(df.columns),
        "feature_columns": [col for col in output.columns if col != label_column],
        "label_column": label_column if label_column in df.columns else None,
        "parity": parity,
        "rows": int(output.shape[0]),
    }

    return output, metadata


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Feature engineering for fraud model training")
    parser.add_argument("--input", required=True, help="Input parquet file or directory")
    parser.add_argument("--out-dir", required=True, help="Output directory for engineered features")
    parser.add_argument("--time-column", default=DEFAULT_TIME_COLUMN)
    parser.add_argument("--label-column", default=DEFAULT_LABEL_COLUMN)
    parser.add_argument(
        "--sample-size",
        type=int,
        help="Optional deterministic sample size for CI or smoke checks",
    )
    parser.add_argument(
        "--seed",
        type=int,
        default=42,
        help="Random seed used when sampling rows",
    )
    return parser


def run(argv: Optional[List[str]] = None) -> str:
    parser = build_arg_parser()
    args = parser.parse_args(argv)

    os.makedirs(args.out_dir, exist_ok=True)

    frame = _load_input_frames(args.input)
    frame = frame.sort_values(by=args.time_column)

    if args.sample_size and args.sample_size > 0 and len(frame) > args.sample_size:
        rng = np.random.default_rng(args.seed)
        sample_indices = rng.choice(len(frame), size=args.sample_size, replace=False)
        frame = frame.iloc[np.sort(sample_indices)]
        frame = frame.sort_values(by=args.time_column)

    features, metadata = engineer_features(
        frame,
        time_column=args.time_column,
        label_column=args.label_column,
    )

    features_path = os.path.join(args.out_dir, "features.parquet")
    features.to_parquet(features_path, index=False)

    metadata.update(
        {
            "sample_size": int(args.sample_size) if args.sample_size else None,
            "seed": int(args.seed),
        }
    )

    manifest_path = os.path.join(args.out_dir, "feature_manifest.json")
    with open(manifest_path, "w", encoding="utf-8") as handle:
        json.dump(metadata, handle, indent=2)

    print(f"Wrote engineered features to {features_path}")
    return features_path


def main() -> None:
    run()


if __name__ == "__main__":
    main()
