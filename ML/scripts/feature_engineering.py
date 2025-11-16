import argparse
import json
import os
from collections import defaultdict, deque
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Deque, Dict, Iterable, List, Optional, Tuple

# Optional local import of streaming loaders (FIX-06)
try:
    # Allow running directly from repo without installing as a package
    import sys as _sys
    from pathlib import Path as _P
    _THIS = _P(__file__).resolve()
    _LIB_DIR = _THIS.parent / "lib"
    if str(_LIB_DIR) not in _sys.path:
        _sys.path.insert(0, str(_LIB_DIR))
    from lib.loader import iter_parquet, iter_csv, iter_jsonl  # type: ignore
except Exception:  # pragma: no cover - loader is optional for non-streaming runs
    iter_parquet = iter_csv = iter_jsonl = None  # type: ignore

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
    include_history: bool = True,
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

    # Rolling aggregates and history-dependent features (guarded for streaming mode)
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

        if include_history:
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
    parser.add_argument("--input", required=True, help="Input file or directory (parquet by default)")
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
    # Streaming mode (FIX-06)
    parser.add_argument(
        "--stream",
        action="store_true",
        help="Enable streaming mode to process large inputs in chunks (history-dependent features disabled)",
    )
    parser.add_argument(
        "--input-format",
        choices=["parquet", "csv", "jsonl"],
        default="parquet",
        help="Input format for streaming mode",
    )
    parser.add_argument(
        "--output",
        default=None,
        help="Optional explicit output parquet file path (defaults to <out-dir>/features.parquet)",
    )
    # Validation (FIX-06)
    parser.add_argument(
        "--validate-in",
        action="store_true",
        help="Validate a sample of the input dataset against the fraud schema before processing",
    )
    parser.add_argument(
        "--validate-out",
        action="store_true",
        help="Validate a sample of the engineered features (output) against the fraud schema",
    )
    parser.add_argument(
        "--validate-limit",
        type=int,
        default=10000,
        help="Number of rows to sample for validation (default: 10000)",
    )
    return parser


def run(argv: Optional[List[str]] = None) -> str:
    parser = build_arg_parser()
    args = parser.parse_args(argv)

    os.makedirs(args.out_dir, exist_ok=True)

    features_path = args.output or os.path.join(args.out_dir, "features.parquet")

    # Optional input validation (preflight) — fraud schema by default
    if args.validate_in:
        try:
            # Lazy import to avoid hard dependency when flag not used
            import sys as _sys
            from pathlib import Path as _P
            _THIS = _P(__file__).resolve()
            _LIB_DIR = _THIS.parent / "lib"
            if str(_LIB_DIR) not in _sys.path:
                _sys.path.insert(0, str(_LIB_DIR))
            from lib.loader import iter_parquet as _iter_parquet, iter_csv as _iter_csv, iter_jsonl as _iter_jsonl  # type: ignore
            from lib.schema import iter_validate_rows as _iter_validate_rows, diagnostics as _diagnostics  # type: ignore
            import pandas as _pd  # type: ignore
        except Exception as e:  # pragma: no cover
            raise SystemExit(f"Validation libraries unavailable: {e}")

        # Read a sample
        limit = max(1, int(args.validate_limit))
        total = 0
        frames: List['_pd.DataFrame'] = []
        it = _iter_parquet(args.input) if args.input_format == 'parquet' else (_iter_csv(args.input) if args.input_format == 'csv' else _iter_jsonl(args.input))
        for ch in it:
            need = limit - total
            if need <= 0:
                break
            if ch.shape[0] > need:
                ch = ch.iloc[:need]
            frames.append(ch)
            total += ch.shape[0]
            if total >= limit:
                break
        sample = _pd.concat(frames, ignore_index=True) if frames else _pd.DataFrame()
        errs = sum(1 for _idx, err in _iter_validate_rows(sample, schema='fraud', limit=len(sample)) if err is not None)
        diag = _diagnostics(sample) if not sample.empty else {}
        # Write adjacent report next to out-dir
        report_path = os.path.join(args.out_dir, 'input.validation.json')
        with open(report_path, 'w', encoding='utf-8') as fh:
            json.dump({
                'schema': 'fraud',
                'format': args.input_format,
                'path': args.input,
                'sampled_rows': int(len(sample)),
                'error_count': int(errs),
                'diagnostics': diag,
            }, fh, indent=2)
        if errs > 0:
            print(f"[WARN] Input validation reported {errs} errors in sample; see {report_path}")

    if args.stream:
        if iter_parquet is None:
            raise SystemExit("Streaming loaders are unavailable; ensure ML/scripts/lib/loader.py is present")

        # Prepare Parquet writer
        try:
            import pyarrow as pa  # type: ignore
            import pyarrow.parquet as pq  # type: ignore
        except Exception as e:
            raise SystemExit(f"pyarrow is required for streaming output: {e}")

        writer: Optional[pq.ParquetWriter] = None  # type: ignore
        total_rows = 0
        first_schema = None

        def _write_chunk(df_chunk: pd.DataFrame) -> None:
            nonlocal writer, first_schema, total_rows
            table = pa.Table.from_pandas(df_chunk, preserve_index=False)
            if writer is None:
                first_schema = table.schema
                writer = pq.ParquetWriter(features_path, first_schema)
            writer.write_table(table)
            total_rows += df_chunk.shape[0]

        # Iterate input by format
        if args.input_format == "parquet":
            iterator = iter_parquet(args.input)
        elif args.input_format == "csv":
            iterator = iter_csv(args.input)
        else:
            iterator = iter_jsonl(args.input)

        for chunk in iterator:
            # Ensure time sort per chunk for deterministic feature engineering
            if args.time_column in chunk.columns:
                chunk = chunk.sort_values(by=args.time_column)
            # Optional subsample on chunk (best-effort) for CI
            if args.sample_size and args.sample_size > 0:
                remaining = max(0, args.sample_size - total_rows)
                if remaining <= 0:
                    break
                if chunk.shape[0] > remaining:
                    chunk = chunk.iloc[:remaining]
            feats, _meta = engineer_features(
                chunk,
                time_column=args.time_column,
                label_column=args.label_column,
                include_history=False,  # history features disabled in streaming mode
            )
            _write_chunk(feats)

        if writer is not None:
            writer.close()
        else:
            # No data encountered
            pd.DataFrame().to_parquet(features_path, index=False)

        features = None  # not held in memory
        metadata = {
            "generated_at": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
            "input_path": args.input,
            "feature_columns": None,
            "label_column": args.label_column,
            "rows": int(total_rows),
            "streaming": True,
            "history_features_included": False,
        }
    else:
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
            include_history=True,
        )
        # Write once
        pd.DataFrame(features).to_parquet(features_path, index=False)

    metadata.update(
        {
            "sample_size": int(args.sample_size) if args.sample_size else None,
            "seed": int(args.seed),
        }
    )

    manifest_path = os.path.join(args.out_dir, "feature_manifest.json")
    with open(manifest_path, "w", encoding="utf-8") as handle:
        json.dump(metadata, handle, indent=2)

    # Optional output validation
    if args.validate_out:
        try:
            import sys as _sys
            from pathlib import Path as _P
            _THIS = _P(__file__).resolve()
            _LIB_DIR = _THIS.parent / "lib"
            if str(_LIB_DIR) not in _sys.path:
                _sys.path.insert(0, str(_LIB_DIR))
            from lib.loader import iter_parquet as _iter_parquet  # type: ignore
            from lib.schema import iter_validate_rows as _iter_validate_rows, diagnostics as _diagnostics  # type: ignore
            import pandas as _pd  # type: ignore
        except Exception as e:  # pragma: no cover
            raise SystemExit(f"Validation libraries unavailable: {e}")

        limit = max(1, int(args.validate_limit))
        total = 0
        frames: List['_pd.DataFrame'] = []
        for ch in _iter_parquet(features_path):
            need = limit - total
            if need <= 0:
                break
            if ch.shape[0] > need:
                ch = ch.iloc[:need]
            frames.append(ch)
            total += ch.shape[0]
            if total >= limit:
                break
        sample = _pd.concat(frames, ignore_index=True) if frames else _pd.DataFrame()
        errs = sum(1 for _idx, err in _iter_validate_rows(sample, schema='fraud', limit=len(sample)) if err is not None)
        diag = _diagnostics(sample) if not sample.empty else {}
        report_path = os.path.join(args.out_dir, 'features.validation.json')
        with open(report_path, 'w', encoding='utf-8') as fh:
            json.dump({
                'schema': 'fraud',
                'format': 'parquet',
                'path': features_path,
                'sampled_rows': int(len(sample)),
                'error_count': int(errs),
                'diagnostics': diag,
            }, fh, indent=2)
        if errs > 0:
            print(f"[WARN] Output validation reported {errs} errors in sample; see {report_path}")

    print(f"Wrote engineered features to {features_path}")
    return features_path


def main() -> None:
    run()


if __name__ == "__main__":
    main()
