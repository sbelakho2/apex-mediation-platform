import argparse
import gzip
import io
import json
import math
import os
import zipfile
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Dict, Iterable, Iterator, List, Tuple

import pandas as pd
from tqdm.auto import tqdm

CRITEO_INT_COLS = [f"I{i}" for i in range(1, 14)]
CRITEO_CAT_COLS = [f"C{i}" for i in range(1, 27)]
CRITEO_COLUMNS = ["label", *CRITEO_INT_COLS, *CRITEO_CAT_COLS]

AVAZU_COLUMNS = [
    "ip",
    "app",
    "device",
    "os",
    "channel",
    "click_time",
    "attributed_time",
    "is_attributed",
]

TALKINGDATA_COLUMNS = AVAZU_COLUMNS

DEFAULT_EVENT_TIME_START = datetime(2025, 1, 1, tzinfo=UTC)

def _iter_criteo_chunks(path: Path, chunk_rows: int) -> Iterator[pd.DataFrame]:
    reader = pd.read_csv(
        path,
        sep="\t",
        names=CRITEO_COLUMNS,
        chunksize=chunk_rows,
        dtype={col: "float32" for col in CRITEO_INT_COLS},
        iterator=True,
    )
    try:
        for chunk in reader:
            yield chunk
    except EOFError:
        print(f"Warning: truncated gzip detected in {path}; remaining rows skipped")


def _iter_avazu_chunks(path: Path, chunk_rows: int, *, member: str) -> Iterator[pd.DataFrame]:
    with zipfile.ZipFile(path, "r") as archive:
        with archive.open(member) as raw_handle:
            if member.endswith(".gz"):
                handle = gzip.open(raw_handle, "rt")
            else:
                handle = io.TextIOWrapper(raw_handle)
            try:
                reader = pd.read_csv(
                    handle,
                    chunksize=chunk_rows,
                    dtype={
                        "ip": "int64",
                        "app": "int16",
                        "device": "int16",
                        "os": "int16",
                        "channel": "int16",
                        "is_attributed": "int8",
                    },
                    parse_dates=["click_time", "attributed_time"],
                    iterator=True,
                )
                try:
                    for chunk in reader:
                        yield chunk
                except EOFError:
                    print(f"Warning: truncated member detected in {path}::{member}; remaining rows skipped")
            finally:
                handle.close()


def _generate_event_times(base_dt: datetime, start_index: int, count: int, stride_seconds: int) -> pd.Series:
    offsets = pd.to_timedelta(range(start_index, start_index + count), unit="s")
    return pd.Series(base_dt + offsets, dtype="datetime64[ns, UTC]")


def _ensure_columns(df: pd.DataFrame, columns: Iterable[str], default) -> pd.DataFrame:
    for col in columns:
        if col not in df.columns:
            df[col] = default
    return df


def _normalize_schema(df: pd.DataFrame, *, dataset: str, base_dt: datetime, offset: int, stride_seconds: int) -> pd.DataFrame:
    rows = len(df)
    event_times = _generate_event_times(base_dt, offset, rows, stride_seconds)

    common = pd.DataFrame({
        "event_time": event_times,
        "label": 0,
        "ip": "0",
        "asn": 0,
        "device_id_hash": "0",
        "placement_id": "0",
        "partner_id": "0",
        "country": "unknown",
        "event_type": "click",
        "ctit_seconds": math.nan,
        "seller_relationship": "DIRECT",
        "schain_nodes": [[] for _ in range(rows)],
        "auction_bid_count": 0,
        "auction_timeout_ms": math.nan,
        "auction_win_ecpm": math.nan,
        "omsdk_viewable_time_ms": math.nan,
        "omsdk_viewable_ratio": math.nan,
        "engagement_events": [[] for _ in range(rows)],
    })

    if dataset == "criteo":
        common["label"] = df["label"].astype("int8")
        common["device_id_hash"] = df[CRITEO_CAT_COLS[0]].astype(str)
        common["placement_id"] = df[CRITEO_CAT_COLS[1]].astype(str)
        common["partner_id"] = df[CRITEO_CAT_COLS[2]].astype(str)
        common["asn"] = df[CRITEO_INT_COLS[0]].fillna(0).astype("int32")
        common["ip"] = df[CRITEO_INT_COLS[1]].fillna(0).astype("int32").astype(str)
    elif dataset in {"avazu", "talkingdata"}:
        common["label"] = df["is_attributed"].fillna(0).astype("int8")
        times = df["click_time"].dt.tz_localize("UTC")
        common["event_time"] = times.fillna(event_times)
        common["ip"] = df["ip"].astype(str)
        common["asn"] = df["app"].astype("int32")
        common["device_id_hash"] = df["device"].astype(str)
        common["placement_id"] = df["app"].astype(str)
        common["partner_id"] = df["channel"].astype(str)
        ctit = (df["attributed_time"] - df["click_time"]).dt.total_seconds()
        common["ctit_seconds"] = ctit.fillna(math.nan)
    else:
        raise ValueError(f"Unsupported dataset '{dataset}'")

    return common


def _process_dataset(
    root: Path,
    pattern: str,
    dataset: str,
    out_dir: Path,
    *,
    chunk_rows: int,
    base_dt: datetime,
    stride_seconds: int,
) -> Tuple[List[str], Dict[str, int]]:
    files = sorted(root.glob(pattern))
    if not files:
        raise SystemExit(f"No files matched pattern {pattern} under {root}")

    out_dir.mkdir(parents=True, exist_ok=True)
    written: List[str] = []
    global_row_offset = 0
    part = 0

    rows_written = 0
    chunk_count = 0

    for file_path in tqdm(files, desc=f"{dataset} files", unit="file"):
        if dataset == "criteo":
            chunks = _iter_criteo_chunks(file_path, chunk_rows)
        elif dataset == "avazu":
            chunks = _iter_avazu_chunks(file_path, chunk_rows, member="train.gz" if file_path.suffix == ".zip" else file_path.name)
        elif dataset == "talkingdata":
            chunks = _iter_avazu_chunks(file_path, chunk_rows, member="train.csv")
        else:
            raise ValueError(dataset)

        for chunk in tqdm(chunks, desc=f"{file_path.name} chunks", unit="chunk", leave=False):
            normalized = _normalize_schema(
                chunk,
                dataset=dataset,
                base_dt=base_dt,
                offset=global_row_offset,
                stride_seconds=stride_seconds,
            )
            out_path = out_dir / f"part_{part:06d}.parquet"
            normalized.to_parquet(out_path, index=False)
            written.append(str(out_path))
            part += 1
            rows = len(chunk)
            global_row_offset += rows
            rows_written += rows
            chunk_count += 1

    return written, {"row_count": rows_written, "chunk_count": chunk_count}


def main() -> None:
    parser = argparse.ArgumentParser(description="Normalize public datasets into training schema")
    parser.add_argument("--root", default="ML/ML Data", help="Directory containing raw datasets")
    parser.add_argument("--output", default="data/training/latest", help="Output directory for parquet shards")
    parser.add_argument("--chunk-rows", type=int, default=500_000, help="Rows per chunk for streaming")
    parser.add_argument(
        "--datasets",
        nargs="*",
        default=["criteo", "avazu", "talkingdata"],
        help="Datasets to process (subset of criteo,avazu,talkingdata)",
    )
    args = parser.parse_args()

    root = Path(args.root)
    out_root = Path(args.output)
    out_root.mkdir(parents=True, exist_ok=True)

    manifests: Dict[str, Dict[str, object]] = {}
    dataset_stats: List[Dict[str, object]] = []

    if "criteo" in args.datasets:
        written, stats = _process_dataset(
            root / "Criteo",
            "day_*.gz",
            "criteo",
            out_root / "criteo",
            chunk_rows=args.chunk_rows,
            base_dt=DEFAULT_EVENT_TIME_START,
            stride_seconds=1,
        )
        manifests["criteo"] = {"files": written, **stats}
        dataset_stats.append({"dataset": "criteo", **stats})

    if "avazu" in args.datasets:
        written, stats = _process_dataset(
            root,
            "avazu-ctr-prediction.zip",
            "avazu",
            out_root / "avazu",
            chunk_rows=args.chunk_rows,
            base_dt=DEFAULT_EVENT_TIME_START + timedelta(days=30),
            stride_seconds=1,
        )
        manifests["avazu"] = {"files": written, **stats}
        dataset_stats.append({"dataset": "avazu", **stats})

    if "talkingdata" in args.datasets:
        written, stats = _process_dataset(
            root,
            "talkingdata-adtracking-fraud-detection.zip",
            "talkingdata",
            out_root / "talkingdata",
            chunk_rows=args.chunk_rows,
            base_dt=DEFAULT_EVENT_TIME_START + timedelta(days=60),
            stride_seconds=1,
        )
        manifests["talkingdata"] = {"files": written, **stats}
        dataset_stats.append({"dataset": "talkingdata", **stats})

    if dataset_stats:
        print("Dataset write summary:")
        for entry in dataset_stats:
            print(
                f" - {entry['dataset']}: {entry['row_count']:,} rows across {entry['chunk_count']} chunks"
            )

    manifest_path = out_root / "public_datasets_manifest.json"
    with open(manifest_path, "w", encoding="utf-8") as handle:
        json.dump(
            {
                "generated_at": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
                "root": str(root.resolve()),
                "output": str(out_root.resolve()),
                "chunk_rows": args.chunk_rows,
                "datasets": manifests,
            },
            handle,
            indent=2,
        )
    print(f"Wrote manifest to {manifest_path}")


if __name__ == "__main__":
    main()
