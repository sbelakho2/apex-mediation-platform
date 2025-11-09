"""ClickHouse → Parquet ETL for fraud model training.

The job extracts 30-day slices of impressions, clicks, installs/postbacks,
auctions, and produces a privacy-safe dataset aligned with
``docs/Internal/ML/DataContracts.md`` schema version 1.0.0.

Usage (defaults to last 30 complete days):

    python ML/scripts/etl_clickhouse.py --hash-salt "$SECRET_HEX" \
        --output-root data/training

Environment variables can override connection parameters:
`CLICKHOUSE_HOST`, `CLICKHOUSE_PORT`, `CLICKHOUSE_USER`,
`CLICKHOUSE_PASSWORD`, `CLICKHOUSE_DATABASE`.

The script is offline-friendly: unit tests can inject a fake client that
implements ``query_df(sql: str, parameters: dict) -> pandas.DataFrame``.
"""
from __future__ import annotations

import argparse
import dataclasses
import hashlib
import json
import logging
import os
from datetime import UTC, date, datetime, timedelta
from typing import Dict, Iterable, Optional, Tuple

import numpy as np
import pandas as pd

try:
    import clickhouse_connect  # type: ignore
except ImportError:  # pragma: no cover - handled gracefully in runtime code
    clickhouse_connect = None  # type: ignore

import ipaddress

LOGGER = logging.getLogger(__name__)
LOGGER.setLevel(logging.INFO)

SCHEMA_VERSION = "1.0.0"

SQL_TEMPLATES: Dict[str, str] = {
    "impressions": (
        """
        SELECT *,
               toDate(timestamp)      AS event_date,
               toHour(timestamp)      AS event_hour
        FROM impressions
        WHERE date BETWEEN %(start_date)s AND %(end_date)s
        """
    ),
    "clicks": (
        """
        SELECT *,
               toDate(timestamp) AS click_date
        FROM clicks
        WHERE date BETWEEN %(start_date)s AND %(end_date)s
        """
    ),
    "installs": (
        """
        SELECT *,
               toDate(timestamp) AS install_date
        FROM installs
        WHERE install_date BETWEEN %(start_date)s AND %(end_date)s
        """
    ),
    "auctions": (
        """
        SELECT *,
               toDate(timestamp) AS auction_date,
               toHour(timestamp) AS auction_hour
        FROM auctions
        WHERE date BETWEEN %(start_date)s AND %(end_date)s
        """
    ),
}


@dataclasses.dataclass
class ETLConfig:
    host: str
    port: int
    username: Optional[str]
    password: Optional[str]
    database: Optional[str]
    start_date: date
    end_date: date
    output_root: str
    hash_salt: bytes
    dry_run: bool = False

    def to_query_params(self) -> Dict[str, str]:
        return {
            "start_date": self.start_date.isoformat(),
            "end_date": self.end_date.isoformat(),
        }


def _get_default_dates(window_days: int = 30) -> Tuple[date, date]:
    today = datetime.now(UTC).date()
    end = today - timedelta(days=1)
    start = end - timedelta(days=window_days - 1)
    return start, end


def _ensure_client(cfg: ETLConfig):
    if clickhouse_connect is None:
        raise RuntimeError(
            "clickhouse-connect is not installed. Install ML/requirements.txt dependencies first."
        )
    LOGGER.info(
        "Connecting to ClickHouse host=%s port=%s db=%s",
        cfg.host,
        cfg.port,
        cfg.database,
    )
    return clickhouse_connect.get_client(  # type: ignore[attr-defined]
        host=cfg.host,
        port=cfg.port,
        username=cfg.username,
        password=cfg.password,
        database=cfg.database,
        settings={"use_numpy": True},
    )


def hash_identifier(value: Optional[str], salt: bytes, length: int = 16) -> Optional[str]:
    if value is None:
        return None
    value = str(value)
    if not value:
        return None
    digest = hashlib.sha256(salt + value.encode("utf-8")).hexdigest()
    return digest[:length]


def truncate_ip(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    try:
        ip_obj = ipaddress.ip_address(value)
    except ValueError:
        return None
    if isinstance(ip_obj, ipaddress.IPv4Address):
        network = ipaddress.IPv4Network(f"{ip_obj.exploded}/24", strict=False)
        return f"{network.network_address.exploded}/24"
    network6 = ipaddress.IPv6Network(f"{ip_obj.exploded}/48", strict=False)
    return f"{network6.network_address.compressed}/48"


def parse_user_agent(value: Optional[str]) -> Tuple[str, str]:
    if not value:
        return "unknown", "0"
    parts = value.split()
    for part in parts:
        if "/" in part:
            family, raw_version = part.split("/", 1)
            version_tokens = raw_version.split(".")
            major_minor = ".".join(version_tokens[:2]) if version_tokens else "0"
            return family.lower(), major_minor or "0"
    return value.split("/")[0].lower() if value else "unknown", "0"


def _fetch_table(client, name: str, cfg: ETLConfig) -> pd.DataFrame:
    sql = SQL_TEMPLATES[name]
    LOGGER.info("Fetching %s", name)
    try:
        df = client.query_df(sql, parameters=cfg.to_query_params())  # type: ignore[no-untyped-call]
    except Exception as exc:  # pragma: no cover - clickhouse client translates errors at runtime
        LOGGER.error("Failed to fetch %s: %s", name, exc)
        raise
    if df.empty:
        LOGGER.warning("%s query returned zero rows", name)
        return df
    return df


DEVICE_TYPE_MAP = {
    "phone": "phone",
    "tablet": "tablet",
    "tv": "other",
    "unknown": "other",
    1: "phone",
    2: "tablet",
    3: "other",
    4: "other",
}


DEFAULT_COLUMN_VALUES: Dict[str, object] = {
    "country_code": "",
    "device_platform": "other",
    "device_os_version": "",
    "device_type": "other",
    "device_id_hash": None,
    "ip_trunc": None,
    "asn": 0,
    "connection_type": "unknown",
    "user_agent_family": "unknown",
    "user_agent_version": "0",
    "consent_gdpr_applies": pd.NA,
    "consent_ccpa_opt_out": pd.NA,
    "att_status": pd.NA,
    "ctit_seconds": np.nan,
    "auction_timeout_ms": np.nan,
    "floor_price": np.nan,
    "auction_bid_count": 0,
    "auction_win_ecpm": np.nan,
    "adapter_error_rate_1h": 0.0,
    "adapter_latency_p95_1h": np.nan,
    "publisher_ctr_1d": 0.0,
    "ip_impression_rate_1h": 0.0,
    "ip_install_rate_1d": 0.0,
    "placement_revenue_share": np.nan,
    "omsdk_viewable_ratio": np.nan,
    "omsdk_click_inconsistency": 0,
    "flag_unauthorized_seller": 0,
    "flag_network_origin_anomaly": 0,
    "flag_ctit_short": 0,
    "flag_ctit_long": 0,
    "flag_omsdk_inconsistency": 0,
    "flag_synthetic_pattern": 0,
    "label_weak": 0,
    "label_final": pd.NA,
}

REQUIRED_COLUMNS = [
    "request_id",
    "event_time",
    "event_date",
    "event_hour",
    "placement_id",
    "network_name",
    "publisher_id",
    "country_code",
    "device_platform",
    "device_os_version",
    "device_type",
    "device_id_hash",
    "ip_trunc",
    "asn",
    "connection_type",
    "user_agent_family",
    "user_agent_version",
    "consent_gdpr_applies",
    "consent_ccpa_opt_out",
    "att_status",
    "ctit_seconds",
    "auction_timeout_ms",
    "floor_price",
    "auction_bid_count",
    "auction_win_ecpm",
    "adapter_error_rate_1h",
    "adapter_latency_p95_1h",
    "publisher_ctr_1d",
    "ip_impression_rate_1h",
    "ip_install_rate_1d",
    "placement_revenue_share",
    "omsdk_viewable_ratio",
    "omsdk_click_inconsistency",
    "flag_unauthorized_seller",
    "flag_network_origin_anomaly",
    "flag_ctit_short",
    "flag_ctit_long",
    "flag_omsdk_inconsistency",
    "flag_synthetic_pattern",
    "label_weak",
    "label_final",
]


def _series_or_default(df: pd.DataFrame, column: str, default=None) -> pd.Series:
    if column in df.columns:
        return df[column]
    return pd.Series([default] * len(df), index=df.index)


def _dedupe(df: pd.DataFrame, keys: Iterable[str], sort_key: str) -> pd.DataFrame:
    if df.empty:
        return df
    deduped = df.sort_values(sort_key).drop_duplicates(list(keys), keep="last")
    return deduped.reset_index(drop=True)


def _prepare_impressions(df: pd.DataFrame, salt: bytes) -> pd.DataFrame:
    if df.empty:
        return df
    df = _dedupe(df, keys=("event_id",), sort_key="timestamp")
    df["impression_time"] = pd.to_datetime(df["timestamp"], utc=True)
    df["event_date"] = df["impression_time"].dt.date
    df["event_hour"] = df["impression_time"].dt.hour
    df["event_time"] = df["impression_time"]
    request_source = _series_or_default(df, "request_id")
    df["request_id"] = request_source.apply(lambda x: hash_identifier(x, salt))
    device_source = _series_or_default(df, "device_id")
    df["device_id_hash"] = device_source.apply(lambda x: hash_identifier(x, salt))
    df["country_code"] = _series_or_default(df, "country", "").fillna("")
    df["device_platform"] = _series_or_default(df, "os", "other").fillna("other")
    df["device_os_version"] = _series_or_default(df, "os_version", "").fillna("")
    df["device_type"] = _series_or_default(df, "device_type").map(lambda x: DEVICE_TYPE_MAP.get(x, "other")).fillna("other")
    df["placement_id"] = _series_or_default(df, "placement_id").astype(str)
    df["publisher_id"] = _series_or_default(df, "publisher_id").astype(str)
    df["network_name"] = _series_or_default(df, "network", "unknown").fillna("unknown")
    df["floor_price"] = _series_or_default(df, "floor_price_cents", 0) / 100.0
    df["auction_win_ecpm"] = _series_or_default(df, "winning_bid_cents", 0) / 100.0
    df["auction_timeout_ms"] = _series_or_default(df, "auction_duration_ms")
    df["omsdk_viewable_ratio"] = _series_or_default(df, "viewability_percentage", np.nan) / 100.0
    df["connection_type"] = _series_or_default(df, "connection_type", "unknown").fillna("unknown")
    df["consent_gdpr_applies"] = _series_or_default(df, "consent_gdpr_applies")
    df["consent_ccpa_opt_out"] = _series_or_default(df, "consent_ccpa_opt_out")
    df["att_status"] = _series_or_default(df, "att_status")

    ua_source = _series_or_default(df, "user_agent")
    ua_df = ua_source.apply(parse_user_agent)
    if isinstance(ua_df, pd.Series):
        df["user_agent_family"] = ua_df.apply(lambda x: x[0])
        df["user_agent_version"] = ua_df.apply(lambda x: x[1])
    else:  # pragma: no cover - fallback path when apply returns DataFrame
        df = pd.concat([df, ua_df], axis=1)

    ip_column = None
    for candidate in ("ip_address", "ip", "ip_raw", "ip_hash"):
        if candidate in df.columns:
            ip_column = candidate
            break
    if ip_column:
        df["ip_trunc"] = df[ip_column].apply(truncate_ip)
        if ip_column != "ip_hash":
            df.drop(columns=[ip_column], inplace=True)
    df.drop(columns=[c for c in ("device_id", "user_agent") if c in df.columns], inplace=True, errors="ignore")
    return df


def _prepare_clicks(df: pd.DataFrame) -> pd.DataFrame:
    if df.empty:
        return df
    df = _dedupe(df, keys=("event_id",), sort_key="timestamp")
    df["click_time"] = pd.to_datetime(df["timestamp"], utc=True)
    df["click_event_id"] = df["event_id"].astype(str)
    df["impression_id"] = df.get("impression_id").astype(str)
    df["publisher_id"] = df.get("publisher_id").astype(str)
    df["click_date"] = df["click_time"].dt.date
    return df


def _prepare_installs(df: pd.DataFrame) -> pd.DataFrame:
    if df.empty:
        return df
    key = "install_id" if "install_id" in df.columns else "event_id"
    df = _dedupe(df, keys=(key,), sort_key="timestamp")
    df["install_time"] = pd.to_datetime(df["timestamp"], utc=True)
    if "click_event_id" not in df.columns and "click_id" in df.columns:
        df["click_event_id"] = df["click_id"]
    df["click_event_id"] = df.get("click_event_id").astype(str)
    df["impression_id"] = df.get("impression_id").astype(str)
    df["install_date"] = df["install_time"].dt.date
    ip_column = None
    for candidate in ("ip_address", "ip", "ip_raw", "ip_hash"):
        if candidate in df.columns:
            ip_column = candidate
            break
    if ip_column:
        df["ip_trunc"] = df[ip_column].apply(truncate_ip)
        if ip_column != "ip_hash":
            df.drop(columns=[ip_column], inplace=True)
    return df


def _prepare_auctions(df: pd.DataFrame) -> pd.DataFrame:
    if df.empty:
        return df
    df = _dedupe(df, keys=("auction_id",), sort_key="timestamp")
    df["auction_time"] = pd.to_datetime(df["timestamp"], utc=True)
    df["auction_hour_bucket"] = df["auction_time"].dt.floor("h")
    df["auction_network"] = df.get("winning_network", df.get("network", "unknown")).fillna("unknown")
    df["auction_bid_count"] = df.get("bids_received", 0)
    df["auction_error_count"] = df.get("error_count", 0)
    df["auction_latency_ms"] = df.get("total_duration_ms", df.get("auction_duration_ms", np.nan))
    return df


def _compute_ctit(clicks: pd.DataFrame, installs: pd.DataFrame) -> pd.DataFrame:
    if clicks.empty or installs.empty:
        return pd.DataFrame(columns=["impression_id", "ctit_seconds"])
    join_df = installs.merge(
        clicks[["click_event_id", "impression_id", "click_time"]],
        on="click_event_id",
        how="left",
        suffixes=("_install", "_click"),
    )
    join_df["ctit_seconds"] = (join_df["install_time"] - join_df["click_time"]).dt.total_seconds()
    join_df["ctit_seconds"] = join_df["ctit_seconds"].clip(lower=0)
    if "impression_id_install" in join_df.columns:
        join_df.rename(columns={"impression_id_install": "impression_id"}, inplace=True)
    agg = (
        join_df.dropna(subset=["ctit_seconds", "impression_id"])
        .groupby("impression_id")
        ["ctit_seconds"]
        .min()
        .reset_index()
    )
    return agg


def _compute_publisher_ctr(impressions: pd.DataFrame, clicks: pd.DataFrame) -> pd.DataFrame:
    if impressions.empty:
        return pd.DataFrame(columns=["publisher_id", "event_date", "publisher_ctr_1d"])
    impression_counts = (
        impressions.groupby(["publisher_id", "event_date"])  # type: ignore[arg-type]
        .size()
        .rename("impressions")
        .reset_index()
    )
    if clicks.empty:
        impression_counts["publisher_ctr_1d"] = 0.0
        return impression_counts[["publisher_id", "event_date", "publisher_ctr_1d"]]
    click_counts = (
        clicks.groupby(["publisher_id", "click_date"])  # type: ignore[arg-type]
        .size()
        .rename("clicks")
        .reset_index()
        .rename(columns={"click_date": "event_date"})
    )
    ctr = impression_counts.merge(click_counts, how="left", on=["publisher_id", "event_date"])
    ctr["clicks"] = ctr["clicks"].fillna(0)
    ctr["publisher_ctr_1d"] = ctr.apply(
        lambda row: float(row["clicks"]) / row["impressions"] if row["impressions"] > 0 else 0.0,
        axis=1,
    )
    return ctr[["publisher_id", "event_date", "publisher_ctr_1d"]]


def _compute_ip_rates(impressions: pd.DataFrame, installs: pd.DataFrame) -> Tuple[pd.DataFrame, pd.DataFrame]:
    if impressions.empty:
        return (
            pd.DataFrame(columns=["ip_trunc", "event_hour", "event_date", "ip_impression_rate_1h"]),
            pd.DataFrame(columns=["ip_trunc", "event_date", "ip_install_rate_1d"]),
        )
    imp_rates = (
        impressions.dropna(subset=["ip_trunc"])
        .groupby(["ip_trunc", "event_date", "event_hour"])
        .size()
        .rename("ip_impression_rate_1h")
        .reset_index()
    )
    if installs.empty or "ip_trunc" not in installs.columns:
        inst_rates = pd.DataFrame(columns=["ip_trunc", "event_date", "ip_install_rate_1d"])
    else:
        installs = installs.dropna(subset=["ip_trunc"])
        if installs.empty:
            inst_rates = pd.DataFrame(columns=["ip_trunc", "event_date", "ip_install_rate_1d"])
        else:
            installs["install_date"] = installs["install_time"].dt.date
            inst_rates = (
                installs.groupby(["ip_trunc", "install_date"]).size().rename("ip_install_rate_1d").reset_index()
            )
            inst_rates.rename(columns={"install_date": "event_date"}, inplace=True)
    return imp_rates, inst_rates


def _explode_bid_latencies(auctions: pd.DataFrame) -> pd.DataFrame:
    if auctions.empty or "bids" not in auctions.columns:
        return pd.DataFrame(columns=["auction_network", "auction_hour_bucket", "latency_ms"])
    exploded_rows = []
    for _, row in auctions.iterrows():
        bids = row.get("bids", []) or []
        for bid in bids:
            if not isinstance(bid, (tuple, list, dict)):
                continue
            if isinstance(bid, dict):
                network = bid.get("network", row["auction_network"])
                latency = bid.get("response_time_ms")
            else:
                # ClickHouse tuple: (network, bid_cents, response_time_ms)
                if len(bid) >= 3:
                    network, _value, latency = bid[:3]
                elif len(bid) == 2:
                    network, latency = bid
                else:
                    continue
            if latency is None:
                continue
            exploded_rows.append(
                {
                    "auction_network": network or row["auction_network"],
                    "auction_hour_bucket": row["auction_hour_bucket"],
                    "latency_ms": float(latency),
                }
            )
    return pd.DataFrame(exploded_rows)


def _compute_adapter_stats(auctions: pd.DataFrame) -> Tuple[pd.DataFrame, pd.DataFrame]:
    if auctions.empty:
        empty = pd.DataFrame(columns=["auction_network", "auction_hour_bucket", "adapter_error_rate_1h"])
        return empty, empty
    error_stats = (
        auctions.groupby(["auction_network", "auction_hour_bucket"])[["auction_error_count", "auction_bid_count"]]
        .sum()
        .reset_index()
    )
    if not error_stats.empty:
        error_stats["adapter_error_rate_1h"] = error_stats.apply(
            lambda row: float(row["auction_error_count"]) / row["auction_bid_count"]
            if row["auction_bid_count"]
            else 0.0,
            axis=1,
        )
    latencies_df = _explode_bid_latencies(auctions)
    if latencies_df.empty:
        latency_stats = pd.DataFrame(columns=["auction_network", "auction_hour_bucket", "adapter_latency_p95_1h"])
    else:
        latency_stats = (
            latencies_df.groupby(["auction_network", "auction_hour_bucket"])
            ["latency_ms"]
            .quantile(0.95)
            .reset_index()
            .rename(columns={"latency_ms": "adapter_latency_p95_1h"})
        )
    return error_stats, latency_stats


def _apply_aggregates(
    impressions: pd.DataFrame,
    clicks: pd.DataFrame,
    installs: pd.DataFrame,
    auctions: pd.DataFrame,
) -> pd.DataFrame:
    impressions = impressions.copy()
    impressions["auction_bid_count"] = _series_or_default(impressions, "auction_bid_count", np.nan)
    impressions["floor_price"] = _series_or_default(impressions, "floor_price", np.nan)
    impressions["auction_timeout_ms"] = _series_or_default(impressions, "auction_timeout_ms", np.nan)
    impressions["auction_win_ecpm"] = _series_or_default(impressions, "auction_win_ecpm", np.nan)
    if not impressions.empty and "impression_time" in impressions.columns:
        impressions["hour_bucket"] = impressions["impression_time"].dt.floor("h")
    ctit = _compute_ctit(clicks, installs)
    if not ctit.empty:
        impressions = impressions.merge(ctit, how="left", left_on="event_id", right_on="impression_id")
        impressions.drop(columns=["impression_id"], inplace=True, errors="ignore")
    if not auctions.empty and "auction_id" in impressions.columns:
        available_cols = [
            col
            for col in (
                "auction_id",
                "auction_bid_count",
                "auction_latency_ms",
                "floor_price_cents",
                "winning_bid_cents",
            )
            if col in auctions.columns
        ]
        if available_cols:
            auction_cols = auctions[available_cols].copy()
            impressions = impressions.merge(auction_cols, how="left", on="auction_id", suffixes=("", "_auction"))
            impressions["auction_bid_count"] = impressions["auction_bid_count"].fillna(
                impressions.get("auction_bid_count_auction")
            )
            impressions["auction_timeout_ms"] = impressions["auction_timeout_ms"].fillna(
                impressions.get("auction_latency_ms")
            )
            impressions["floor_price"] = impressions["floor_price"].fillna(
                impressions.get("floor_price_cents", 0) / 100.0
            )
            impressions["auction_win_ecpm"] = impressions["auction_win_ecpm"].fillna(
                impressions.get("winning_bid_cents", 0) / 100.0
            )
            impressions.drop(
                columns=[
                    c
                    for c in (
                        "auction_bid_count_auction",
                        "auction_latency_ms",
                        "floor_price_cents",
                        "winning_bid_cents",
                    )
                    if c in impressions.columns
                ],
                inplace=True,
            )
    publisher_ctr = _compute_publisher_ctr(impressions, clicks)
    if not publisher_ctr.empty:
        impressions = impressions.merge(
            publisher_ctr,
            how="left",
            on=["publisher_id", "event_date"],
        )
    ip_imp, ip_inst = _compute_ip_rates(impressions, installs)
    if not ip_imp.empty:
        impressions = impressions.merge(
            ip_imp,
            how="left",
            on=["ip_trunc", "event_date", "event_hour"],
        )
    if not ip_inst.empty:
        impressions = impressions.merge(
            ip_inst,
            how="left",
            on=["ip_trunc", "event_date"],
        )
    adapter_errors, adapter_latencies = _compute_adapter_stats(auctions)
    if not adapter_errors.empty:
        impressions = impressions.merge(
            adapter_errors[["auction_network", "auction_hour_bucket", "adapter_error_rate_1h"]],
            how="left",
            left_on=["network_name", "hour_bucket"],
            right_on=["auction_network", "auction_hour_bucket"],
        )
        impressions.drop(columns=[c for c in ("auction_network", "auction_hour_bucket") if c in impressions.columns], inplace=True)
    if not adapter_latencies.empty:
        impressions = impressions.merge(
            adapter_latencies,
            how="left",
            left_on=["network_name", "hour_bucket"],
            right_on=["auction_network", "auction_hour_bucket"],
        )
        impressions.drop(columns=[c for c in ("auction_network", "auction_hour_bucket") if c in impressions.columns], inplace=True)
    impressions.rename(
        columns={
            "ctit_seconds_x": "ctit_seconds",
            "ctit_seconds_y": "ctit_seconds",
        },
        inplace=True,
    )
    impressions.drop(columns=[c for c in ("hour_bucket",) if c in impressions.columns], inplace=True)
    return impressions


def _finalize_columns(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df = df[~df["request_id"].isna()]  # drop rows without hashed request_id
    df.drop_duplicates(subset=["request_id", "event_time"], keep="last", inplace=True)
    for column, default in DEFAULT_COLUMN_VALUES.items():
        if column not in df.columns:
            df[column] = default
        else:
            if default is None or default is pd.NA or (isinstance(default, float) and np.isnan(default)):
                continue
            df[column] = df[column].fillna(default)
    for column in REQUIRED_COLUMNS:
        if column not in df.columns:
            df[column] = DEFAULT_COLUMN_VALUES.get(column, np.nan)
    df["event_hour"] = df["event_hour"].astype(int)
    df["event_date"] = pd.to_datetime(df["event_date"]).dt.normalize()
    df["event_time"] = pd.to_datetime(df["event_time"], utc=True)
    df["request_id"] = df["request_id"].astype(str)
    if "device_id_hash" in df.columns:
        df["device_id_hash"] = df["device_id_hash"].where(df["device_id_hash"].notna(), None)
    df = df[REQUIRED_COLUMNS]
    df.sort_values(["event_date", "event_hour", "request_id"], inplace=True)
    df.reset_index(drop=True, inplace=True)
    return df


def _write_dataset(df: pd.DataFrame, output_root: str) -> Dict[str, object]:
    os.makedirs(output_root, exist_ok=True)
    try:
        import fastparquet  # type: ignore  # noqa: F401  # verify dependency availability
    except ImportError as exc:  # pragma: no cover - defensive guard for misconfigured envs
        raise RuntimeError(
            "fastparquet is required for parquet export; install ML/requirements.txt dependencies first."
        ) from exc
    engine = "fastparquet"

    grouped = df.groupby(["event_date", "event_hour"], sort=True)
    for (event_date, event_hour), partition in grouped:
        event_date_str = pd.Timestamp(event_date).strftime("%Y-%m-%d")
        part_dir = os.path.join(
            output_root,
            f"event_date={event_date_str}",
            f"event_hour={event_hour}",
        )
        os.makedirs(part_dir, exist_ok=True)
        part_path = os.path.join(part_dir, "data.parquet")
        partition.to_parquet(part_path, index=False, engine=engine)
    metadata_path = os.path.join(output_root, "metadata.json")
    metadata = {
        "schema_version": SCHEMA_VERSION,
        "generated_at": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
        "row_count": int(df.shape[0]),
        "column_count": int(df.shape[1]),
        "columns": list(df.columns),
    }
    with open(metadata_path, "w", encoding="utf-8") as handle:
        json.dump(metadata, handle, indent=2)
    return metadata


def run_etl(cfg: ETLConfig, client=None) -> Dict[str, object]:
    LOGGER.info(
        "Starting ETL from %s to %s (dry_run=%s)", cfg.start_date, cfg.end_date, cfg.dry_run
    )
    client = client or _ensure_client(cfg)
    impressions = _prepare_impressions(_fetch_table(client, "impressions", cfg), cfg.hash_salt)
    clicks = _prepare_clicks(_fetch_table(client, "clicks", cfg))
    installs = _prepare_installs(_fetch_table(client, "installs", cfg))
    auctions = _prepare_auctions(_fetch_table(client, "auctions", cfg))

    combined = _apply_aggregates(impressions, clicks, installs, auctions)
    final_df = _finalize_columns(combined)

    summary = {
        "dry_run": cfg.dry_run,
        "rows": int(final_df.shape[0]),
        "start_date": cfg.start_date.isoformat(),
        "end_date": cfg.end_date.isoformat(),
        "schema_version": SCHEMA_VERSION,
    }
    if cfg.dry_run:
        LOGGER.info("Dry run complete: %s", summary)
        return summary
    metadata = _write_dataset(final_df, cfg.output_root)
    summary.update(metadata)
    LOGGER.info("ETL finished: %s", summary)
    return summary


def parse_args() -> argparse.Namespace:
    start_default, end_default = _get_default_dates()
    parser = argparse.ArgumentParser(description="ClickHouse → Parquet ETL for fraud training")
    parser.add_argument("--host", default=os.environ.get("CLICKHOUSE_HOST", "localhost"))
    parser.add_argument("--port", default=int(os.environ.get("CLICKHOUSE_PORT", "8123")))
    parser.add_argument("--user", default=os.environ.get("CLICKHOUSE_USER"))
    parser.add_argument("--password", default=os.environ.get("CLICKHOUSE_PASSWORD"))
    parser.add_argument("--database", default=os.environ.get("CLICKHOUSE_DATABASE"))
    parser.add_argument(
        "--start-date",
        dest="start_date",
        default=os.environ.get("ML_ETL_START_DATE", start_default.isoformat()),
        help="Inclusive start date (YYYY-MM-DD)",
    )
    parser.add_argument(
        "--end-date",
        dest="end_date",
        default=os.environ.get("ML_ETL_END_DATE", end_default.isoformat()),
        help="Inclusive end date (YYYY-MM-DD)",
    )
    parser.add_argument(
        "--output-root",
        default=os.environ.get("ML_ETL_OUTPUT", os.path.join("data", "training")),
        help="Root directory for partitioned parquet output",
    )
    parser.add_argument(
        "--hash-salt",
        dest="hash_salt",
        default=os.environ.get("ML_HASH_SALT"),
        help="Hex or plain-text salt used for hashing stable identifiers",
    )
    parser.add_argument(
        "--dry-run",
        dest="dry_run",
        action="store_true",
        help="Run extraction without writing parquet files",
    )
    return parser.parse_args()


def _coerce_hash_salt(raw: Optional[str]) -> bytes:
    if not raw:
        raise ValueError("Hash salt is required (pass --hash-salt or set ML_HASH_SALT)")
    try:
        return bytes.fromhex(raw)
    except ValueError:
        return raw.encode("utf-8")


def main() -> None:
    args = parse_args()
    cfg = ETLConfig(
        host=args.host,
        port=int(args.port),
        username=args.user,
        password=args.password,
        database=args.database,
        start_date=datetime.fromisoformat(str(args.start_date)).date(),
        end_date=datetime.fromisoformat(str(args.end_date)).date(),
        output_root=args.output_root,
        hash_salt=_coerce_hash_salt(args.hash_salt),
        dry_run=args.dry_run,
    )
    run_etl(cfg)


if __name__ == "__main__":  # pragma: no cover
    main()
