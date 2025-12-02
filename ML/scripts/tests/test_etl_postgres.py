import json
from datetime import date
from pathlib import Path

import pandas as pd
import pytest  # type: ignore

from ML.scripts import etl_postgres


class FakeClient:
    def __init__(self, frames):
        self.frames = frames
        self.queries = []

    def query_df(self, sql: str, parameters):
        self.queries.append((sql.strip(), parameters))
        sql_lower = sql.lower()
        if "analytics_impressions" in sql_lower:
            return self.frames["impressions"].copy()
        if "analytics_clicks" in sql_lower:
            return self.frames["clicks"].copy()
        if "analytics_installs" in sql_lower:
            return self.frames["installs"].copy()
        if "transparency_auctions" in sql_lower:
            return self.frames["auctions"].copy()
        raise AssertionError(f"Unexpected SQL: {sql}")


@pytest.fixture
def sample_frames():
    impressions = pd.DataFrame(
        [
            {
                "event_id": "imp-1",
                "observed_at": pd.Timestamp("2025-11-01T00:14:00Z"),
                "publisher_id": "pub-1",
                "placement_id": "plc-1",
                "network_name": "admob",
                "request_id": "req-1-old",
                "country_code": "US",
                "device_type": "phone",
                "os": "android",
                "os_version": "13.4",
                "latency_ms": 120,
                "device_id": "device-1",
                "ip_address": "203.0.113.10",
                "user_agent": "Chrome/120.0 Mobile",
                "viewability_percentage": "80",
                "floor_price_cents": "500",
                "winning_bid_cents": "1200",
                "auction_timeout_ms": "150",
                "auction_bid_count": "3",
                "auction_id": "auc-1",
                "placement_revenue_share": "0.45",
                "omsdk_click_inconsistency": "0",
            },
            {
                # duplicate event to exercise dedupe + hashing
                "event_id": "imp-1",
                "observed_at": pd.Timestamp("2025-11-01T00:15:00Z"),
                "publisher_id": "pub-1",
                "placement_id": "plc-1",
                "network_name": "admob",
                "request_id": "req-1",
                "country_code": "US",
                "device_type": "phone",
                "os": "android",
                "os_version": "13.4",
                "latency_ms": 150,
                "device_id": "device-1",
                "ip_address": "203.0.113.10",
                "user_agent": "Chrome/120.0 Mobile",
                "viewability_percentage": "80",
                "floor_price_cents": "500",
                "winning_bid_cents": "1200",
                "auction_timeout_ms": "150",
                "auction_bid_count": "3",
                "auction_id": "auc-1",
                "placement_revenue_share": "0.45",
                "omsdk_click_inconsistency": "0",
            },
        ]
    )

    clicks = pd.DataFrame(
        [
            {
                "event_id": "clk-1",
                "observed_at": pd.Timestamp("2025-11-01T00:16:00Z"),
                "impression_id": "imp-1",
                "publisher_id": "pub-1",
                "network_name": "admob",
                "request_id": "req-1",
            }
        ]
    )

    installs = pd.DataFrame(
        [
            {
                "install_id": "inst-1",
                "observed_at": pd.Timestamp("2025-11-01T00:20:00Z"),
                "click_event_id": "clk-1",
                "impression_id": "imp-1",
                "device_id": "device-1",
                "ip_address": "203.0.113.99",
            }
        ]
    )

    auctions = pd.DataFrame(
        [
            {
                "auction_id": "auc-1",
                "observed_at": pd.Timestamp("2025-11-01T00:14:30Z"),
                "auction_network": "admob",
                "auction_bid_count": 3,
                "auction_error_count": 1,
                "auction_latency_ms": 110,
                "winning_bid_ecpm": 12.0,
                "bids": [
                    {"network": "admob", "response_time_ms": 100},
                    {"network": "admob", "response_time_ms": 120},
                    {"network": "meta", "response_time_ms": 140},
                ],
            }
        ]
    )

    return {
        "impressions": impressions,
        "clicks": clicks,
        "installs": installs,
        "auctions": auctions,
    }


def test_etl_happy_path(tmp_path, sample_frames):
    salt = b"testsalt"
    cfg = etl_postgres.ETLConfig(
        database_url="postgresql://localhost/apexmediation",
        start_date=date(2025, 11, 1),
        end_date=date(2025, 11, 1),
        output_root=str(tmp_path / "out"),
        hash_salt=salt,
        dry_run=False,
    )
    client = FakeClient(sample_frames)

    summary = etl_postgres.run_etl(cfg, client=client)

    assert summary["schema_version"] == etl_postgres.SCHEMA_VERSION
    assert summary["row_count"] == 1
    assert len(client.queries) == 4
    for _sql, params in client.queries:
        assert "start_ts" in params and "end_ts" in params

    parquet_files = list(Path(cfg.output_root).rglob("*.parquet"))
    assert parquet_files, "Expected parquet output"
    df = pd.read_parquet(parquet_files[0])
    assert set(etl_postgres.REQUIRED_COLUMNS).issubset(df.columns)
    hashed_request = etl_postgres.hash_identifier("req-1", salt)
    hashed_device = etl_postgres.hash_identifier("device-1", salt)
    assert df.loc[0, "request_id"] == hashed_request
    assert df.loc[0, "device_id_hash"] == hashed_device
    assert df.loc[0, "ctit_seconds"] == pytest.approx(240.0)
    assert df.loc[0, "floor_price"] == pytest.approx(5.0)
    assert df.loc[0, "auction_win_ecpm"] == pytest.approx(12.0)
    assert df.loc[0, "auction_bid_count"] == 3
    assert df.loc[0, "auction_timeout_ms"] == 150
    assert df.loc[0, "publisher_ctr_1d"] == pytest.approx(1.0)
    assert df.loc[0, "ip_impression_rate_1h"] == 1
    assert df.loc[0, "ip_install_rate_1d"] == 1
    assert df.loc[0, "ip_trunc"] == "203.0.113.0/24"
    assert df.loc[0, "adapter_error_rate_1h"] == pytest.approx(1 / 3)
    assert df.loc[0, "omsdk_viewable_ratio"] == pytest.approx(0.8)

    metadata_path = Path(cfg.output_root) / "metadata.json"
    with metadata_path.open("r", encoding="utf-8") as handle:
        metadata = json.load(handle)
    assert metadata["row_count"] == 1
    assert metadata["schema_version"] == etl_postgres.SCHEMA_VERSION


def test_etl_dry_run(tmp_path, sample_frames):
    cfg = etl_postgres.ETLConfig(
        database_url="postgresql://localhost/apexmediation",
        start_date=date(2025, 11, 1),
        end_date=date(2025, 11, 1),
        output_root=str(tmp_path / "dry"),
        hash_salt=b"salt",
        dry_run=True,
    )
    client = FakeClient(sample_frames)

    summary = etl_postgres.run_etl(cfg, client=client)

    assert summary["dry_run"] is True
    assert not Path(cfg.output_root).exists()