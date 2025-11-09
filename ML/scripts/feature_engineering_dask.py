import argparse
import json
from datetime import UTC, datetime
from functools import partial
from pathlib import Path
from typing import List, Tuple

import dask.dataframe as dd
import pandas as pd

from ML.scripts import feature_engineering
from tqdm.auto import tqdm


def _engineer_partition(pdf: pd.DataFrame, *, time_column: str, label_column: str) -> pd.DataFrame:
    if time_column not in pdf.columns:
        raise SystemExit(f"Input partition missing time column '{time_column}'")
    pdf_sorted = pdf.sort_values(by=time_column)
    features, _ = feature_engineering.engineer_features(
        pdf_sorted,
        time_column=time_column,
        label_column=label_column,
    )
    return features


def _collect_metadata(sample: pd.DataFrame, *, time_column: str, label_column: str) -> Tuple[dict, pd.DataFrame]:
    features, metadata = feature_engineering.engineer_features(
        sample,
        time_column=time_column,
        label_column=label_column,
    )
    metadata["sample_preview_rows"] = int(features.shape[0])
    return metadata, features.iloc[0:0]


def main() -> None:
    parser = argparse.ArgumentParser(description="Distributed feature engineering using Dask")
    parser.add_argument("--input", required=True, help="Input directory with normalized parquet shards")
    parser.add_argument("--out", required=True, help="Output directory for engineered features")
    parser.add_argument("--time-column", default=feature_engineering.DEFAULT_TIME_COLUMN)
    parser.add_argument("--label-column", default=feature_engineering.DEFAULT_LABEL_COLUMN)
    parser.add_argument("--overlap", default="7d", help="Time overlap per partition to maintain rolling windows")
    parser.add_argument("--npartitions", type=int, default=64, help="Number of Dask partitions")
    parser.add_argument("--sample-rows", type=int, default=5000, help="Rows to sample for metadata blueprint")
    args = parser.parse_args()

    input_path = Path(args.input)
    output_path = Path(args.out)
    output_path.mkdir(parents=True, exist_ok=True)

    parquet_glob = str(input_path / "**" / "*.parquet")
    ddf = dd.read_parquet(parquet_glob, engine="pyarrow")
    if args.time_column not in ddf.columns:
        raise SystemExit(f"Column '{args.time_column}' not present in dataset {input_path}")

    ddf = ddf.map_partitions(lambda pdf: pdf.sort_values(by=args.time_column))
    ddf = ddf.set_index(args.time_column, sorted=False, drop=False)
    ddf = ddf.repartition(npartitions=args.npartitions)

    sample = ddf.head(args.sample_rows, compute=True)
    if sample.empty:
        raise SystemExit("Input dataset is empty")

    metadata, meta_template = _collect_metadata(
        sample,
        time_column=args.time_column,
        label_column=args.label_column,
    )

    engineered = ddf.map_overlap(
        partial(
            _engineer_partition,
            time_column=args.time_column,
            label_column=args.label_column,
        ),
        before=args.overlap,
        after="0s",
        trim=True,
        meta=meta_template,
    )

    delayed_parts = engineered.to_delayed()
    if isinstance(delayed_parts, list):
        flat_parts: List = []
        for part in delayed_parts:
            if isinstance(part, list):
                flat_parts.extend(part)
            else:
                flat_parts.append(part)
    else:
        flat_parts = [delayed_parts]

    features_path = output_path
    row_count = 0
    for idx, delayed_part in enumerate(tqdm(flat_parts, desc="Feature partitions", unit="partition")):
        partition_df = delayed_part.compute()
        rows = len(partition_df)
        row_count += rows
        out_path = features_path / f"part_{idx:06d}.parquet"
        partition_df.to_parquet(out_path, engine="pyarrow", index=False)

    partition_total = len(flat_parts)

    metadata.update(
        {
            "generated_at": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
            "input": str(input_path.resolve()),
            "rows": int(row_count),
            "partitions": int(partition_total),
        }
    )

    manifest_path = output_path / "feature_manifest.json"
    with open(manifest_path, "w", encoding="utf-8") as handle:
        json.dump(metadata, handle, indent=2)

    print(f"Wrote engineered features to {features_path} ({row_count:,} rows, {partition_total} partitions)")


if __name__ == "__main__":
    main()
