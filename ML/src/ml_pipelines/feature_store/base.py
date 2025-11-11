"""Common structures for feature store builders and calculators."""

from __future__ import annotations

import ipaddress
import os
from dataclasses import dataclass
from typing import Dict, Iterable, List, Optional

HASH_SALT = os.getenv("ENRICHMENT_HASH_SALT", "apexml-salt")


@dataclass(slots=True)
class FeatureRecord:
    network: str
    truncated_network: str
    hashed_network: str
    asn: Optional[str]
    asn_name: Optional[str]
    country_code: Optional[str]
    is_cloud: bool
    is_tor: bool
    is_vpn: bool
    cloud_provider: Optional[str]
    cloud_service: Optional[str]
    source: str
    first_seen: str
    last_updated: str
    metadata: Dict[str, str]


def normalize_network(value: str) -> ipaddress._BaseNetwork:
    value = value.strip()
    if "/" not in value:
        try:
            addr = ipaddress.ip_address(value)
            prefix = 32 if isinstance(addr, ipaddress.IPv4Address) else 128
            return ipaddress.ip_network(f"{value}/{prefix}", strict=False)
        except ValueError as exc:  # pragma: no cover - user input validation
            raise ValueError(f"Invalid IP address: {value}") from exc
    try:
        return ipaddress.ip_network(value, strict=False)
    except ValueError as exc:  # pragma: no cover
        raise ValueError(f"Invalid network: {value}") from exc


def truncate_network(network: ipaddress._BaseNetwork) -> str:
    if isinstance(network, ipaddress.IPv4Network):
        target_prefix = 24 if network.prefixlen > 24 else network.prefixlen
    else:
        target_prefix = 48 if network.prefixlen > 48 else network.prefixlen
    truncated = network.supernet(new_prefix=target_prefix) if target_prefix < network.prefixlen else network
    return str(truncated)


def hash_identifier(value: str, length: int = 12) -> str:
    import hashlib

    digest = hashlib.sha256((HASH_SALT + value).encode("utf-8")).hexdigest()
    return digest[:length]


def merge_records(records: Iterable[FeatureRecord]) -> FeatureRecord:
    records = list(records)
    if not records:
        raise ValueError("No records to merge")

    primary = records[0]
    merged = FeatureRecord(
        network=primary.network,
        truncated_network=primary.truncated_network,
        hashed_network=primary.hashed_network,
        asn=primary.asn,
        asn_name=primary.asn_name,
        country_code=primary.country_code,
        is_cloud=any(r.is_cloud for r in records),
        is_tor=any(r.is_tor for r in records),
        is_vpn=any(r.is_vpn for r in records),
        cloud_provider=primary.cloud_provider,
        cloud_service=primary.cloud_service,
        source=",".join(sorted({r.source for r in records})),
        first_seen=min(r.first_seen for r in records),
        last_updated=max(r.last_updated for r in records),
        metadata={}
    )

    metadata: Dict[str, str] = {}
    for record in records:
        metadata.update({f"{record.source}:{k}": str(v) for k, v in record.metadata.items()})
    merged.metadata = metadata
    return merged


def record_to_dict(record: FeatureRecord) -> Dict[str, object]:
    payload: Dict[str, object] = {
        "network": record.network,
        "truncated_network": record.truncated_network,
        "hashed_network": record.hashed_network,
        "asn": record.asn,
        "asn_name": record.asn_name,
        "country_code": record.country_code,
        "is_cloud": record.is_cloud,
        "is_tor": record.is_tor,
        "is_vpn": record.is_vpn,
        "cloud_provider": record.cloud_provider,
        "cloud_service": record.cloud_service,
        "source": record.source,
        "first_seen": record.first_seen,
        "last_updated": record.last_updated,
        "metadata": record.metadata,
    }
    return payload


__all__ = [
    "FeatureRecord",
    "HASH_SALT",
    "hash_identifier",
    "merge_records",
    "normalize_network",
    "record_to_dict",
    "truncate_network",
]
