import argparse
import json
import math
import os
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Iterable, Iterator, List, Optional

import zipfile

import pandas as pd

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


@dataclass
class DatasetSpec:
    name: str
    pattern: str
    is_zip: bool
    base_dt: datetime
    timezone: Optional[str] = None
    day_stride_seconds: int = 24 * 3600


def _iter_criteo_chunks(path: Path, chunk_rows: int) -> Iterator[pd.DataFrame]:
    reader = pd.read_csv(
        path,
        sep="\t",
        names=CRITEO_COLUMNS,
        chunksize=chunk_rows,
        dtype={col: "float32" for col in CRITEO_INT_COLS},
        iterator=True,
    )
    for chunk in reader:
        yield chunk


def _iter_avazu_chunks(path: Path, chunk_rows: int, *, member: str) -> Iterator[pd.DataFrame]:
    with zipfile.ZipFile(path, "r") as archive:
        with archive.open(member) as handle:
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
            for chunk in reader:
                yield chunk


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
) -> List[str]:
    files = sorted(root.glob(pattern))
    if not files:
        raise SystemExit(f"No files matched pattern {pattern} under {root}")

    out_dir.mkdir(parents=True, exist_ok=True)
    written: List[str] = []
    global_row_offset = 0
    part = 0

    for file_path in files:
        if dataset == "criteo":
            chunks = _iter_criteo_chunks(file_path, chunk_rows)
        elif dataset == "avazu":
            chunks = _iter_avazu_chunks(file_path, chunk_rows, member="train.gz" if file_path.suffix == ".zip" else file_path.name)
        elif dataset == "talkingdata":
            chunks = _iter_avazu_chunks(file_path, chunk_rows, member="train.csv")
        else:
            raise ValueError(dataset)

        for chunk in chunks:
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
            global_row_offset += len(chunk)

    return written


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

    manifests = {}

    if "criteo" in args.datasets:
        written = _process_dataset(
            root / "Criteo",
            "day_*.gz",
            "criteo",
            out_root / "criteo",
            chunk_rows=args.chunk_rows,
            base_dt=DEFAULT_EVENT_TIME_START,
            stride_seconds=1,
        )
        manifests["criteo"] = written

    if "avazu" in args.datasets:
        written = _process_dataset(
            root,
            "avazu-ctr-prediction.zip",
            "avazu",
            out_root / "avazu",
            chunk_rows=args.chunk_rows,
            base_dt=DEFAULT_EVENT_TIME_START + timedelta(days=30),
            stride_seconds=1,
        )
        manifests["avazu"] = written

    if "talkingdata" in args.datasets:
        written = _process_dataset(
            root,
            "talkingdata-adtracking-fraud-detection.zip",
            "talkingdata",
            out_root / "talkingdata",
            chunk_rows=args.chunk_rows,
            base_dt=DEFAULT_EVENT_TIME_START + timedelta(days=60),
            stride_seconds=1,
        )
        manifests["talkingdata"] = written

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
