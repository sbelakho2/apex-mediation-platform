"""Online feature calculator that mirrors offline enrichment outputs."""

from __future__ import annotations

import json
import ipaddress
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Iterable, List, Mapping, Optional, Sequence, Tuple, Union

import pandas as pd

from .base import FeatureRecord, merge_records, normalize_network


@dataclass
class LookupResult:
    features: Mapping[str, object]
    matched_networks: Sequence[str]


class OnlineFeatureCalculator:
    def __init__(self, dataset: Union[Path, pd.DataFrame, "FeatureDataset"]):
        if isinstance(dataset, Path):
            frame = pd.read_parquet(dataset)
        elif hasattr(dataset, "frame"):
            frame = getattr(dataset, "frame")
        else:
            frame = dataset  # assume DataFrame
        self._frame = frame
        self._records: List[Tuple[ipaddress._BaseNetwork, FeatureRecord]] = []
        for row in frame.to_dict(orient="records"):
            record = self._row_to_record(row)
            network = normalize_network(record.network)
            self._records.append((network, record))

    def lookup(self, ip: str) -> LookupResult:
        ip_obj = ipaddress.ip_address(ip)
        matches: List[FeatureRecord] = []
        matched_networks: List[str] = []
        for network, record in self._records:
            if ip_obj in network:
                matches.append(record)
                matched_networks.append(str(network))
        if not matches:
            return LookupResult(
                features={
                    "is_tor": False,
                    "is_cloud": False,
                    "is_vpn": False,
                    "asn": None,
                    "cloud_provider": None,
                    "scoreable": False,
                },
                matched_networks=[],
            )
        merged = merge_records(matches)
        features = self._record_to_features(merged)
        return LookupResult(features=features, matched_networks=matched_networks)

    def batch_lookup(self, ips: Iterable[str]) -> Dict[str, LookupResult]:
        return {ip: self.lookup(ip) for ip in ips}

    def _row_to_record(self, row: Mapping[str, object]) -> FeatureRecord:
        metadata = row.get("metadata")
        if isinstance(metadata, str):
            try:
                metadata = json.loads(metadata)
            except json.JSONDecodeError:
                metadata = {"raw": metadata}
        return FeatureRecord(
            network=row.get("network"),
            truncated_network=row.get("truncated_network"),
            hashed_network=row.get("hashed_network"),
            asn=row.get("asn"),
            asn_name=row.get("asn_name"),
            country_code=row.get("country_code"),
            is_cloud=bool(row.get("is_cloud")),
            is_tor=bool(row.get("is_tor")),
            is_vpn=bool(row.get("is_vpn")),
            cloud_provider=row.get("cloud_provider"),
            cloud_service=row.get("cloud_service"),
            source=row.get("source"),
            first_seen=row.get("first_seen"),
            last_updated=row.get("last_updated"),
            metadata=metadata or {},
        )

    def _record_to_features(self, record: FeatureRecord) -> Dict[str, object]:
        return {
            "hashed_network": record.hashed_network,
            "asn": record.asn,
            "country_code": record.country_code,
            "is_cloud": record.is_cloud,
            "is_tor": record.is_tor,
            "is_vpn": record.is_vpn,
            "cloud_provider": record.cloud_provider,
            "cloud_service": record.cloud_service,
            "scoreable": True,
            "metadata": record.metadata,
        }


__all__ = [
    "LookupResult",
    "OnlineFeatureCalculator",
]
