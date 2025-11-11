"""Offline feature builder that materialises enrichment data into model-ready parquet."""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Dict, Iterable, List, Mapping, MutableMapping, Optional

import pandas as pd

from .base import FeatureRecord, hash_identifier, merge_records, normalize_network, record_to_dict, truncate_network


@dataclass
class FeatureDataset:
    frame: pd.DataFrame
    output_dir: Path
    manifest_path: Path
    schema_path: Path


class OfflineFeatureBuilder:
    def __init__(self, enrichment_root: Path):
        self.enrichment_root = enrichment_root
        self.version_dir = enrichment_root / "v1"

    def build(self, output_dir: Path, *, retention_days: int = 365) -> FeatureDataset:
        manifests = self._load_latest_manifests()
        records = self._generate_records(manifests)
        merged = self._merge_by_network(records)

        frame = pd.DataFrame([record_to_dict(rec) for rec in merged])
        frame.sort_values(by=["network", "source"], inplace=True)
        frame["metadata"] = frame["metadata"].apply(lambda value: json.dumps(value, sort_keys=True))

        output_dir.mkdir(parents=True, exist_ok=True)
        parquet_path = output_dir / "ip_enrichment.parquet"
        csv_path = output_dir / "ip_enrichment.csv"
        manifest_path = output_dir / "manifest.json"
        schema_path = output_dir / "schema.json"

        frame.to_parquet(parquet_path, index=False)
        frame.to_csv(csv_path, index=False)

        manifest_payload = {
            "generatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "records": len(frame),
            "sources": {
                name: {
                    "runDate": manifest["runDate"],
                    "entryCount": len(manifest["entries"]),
                    "manifest": str(path.relative_to(self.enrichment_root.parent)),
                }
                for name, (path, manifest) in manifests.items()
            },
        }
        manifest_path.write_text(json.dumps(manifest_payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")

        schema = {
            "version": 1,
            "generatedAt": manifest_payload["generatedAt"],
            "fields": [
                {"name": "network", "type": "string", "description": "Original network or IP"},
                {"name": "truncated_network", "type": "string", "description": "Privacy-preserving truncated network"},
                {"name": "hashed_network", "type": "string", "description": "SHA256 hash (first 12 chars) with salt"},
                {"name": "asn", "type": "string", "description": "Autonomous system number if available"},
                {"name": "asn_name", "type": "string", "description": "Autonomous system organization"},
                {"name": "country_code", "type": "string", "description": "Country code from enrichment source"},
                {"name": "is_cloud", "type": "bool", "description": "True if IP belongs to known cloud range"},
                {"name": "is_tor", "type": "bool", "description": "True if IP seen in Tor exit lists"},
                {"name": "is_vpn", "type": "bool", "description": "True if IP present in VPN allow/block lists"},
                {"name": "cloud_provider", "type": "string", "description": "Cloud provider identifier"},
                {"name": "cloud_service", "type": "string", "description": "Cloud service scope if available"},
                {"name": "source", "type": "string", "description": "Comma separated list of contributing sources"},
                {"name": "first_seen", "type": "string", "description": "ISO timestamp of first observation"},
                {"name": "last_updated", "type": "string", "description": "ISO timestamp of latest observation"},
                {"name": "metadata", "type": "object", "description": "Source specific metadata"},
            ],
        }
        schema_path.write_text(json.dumps(schema, indent=2, sort_keys=True) + "\n", encoding="utf-8")

        self._prune_old_runs(retention_days)

        return FeatureDataset(frame=frame, output_dir=output_dir, manifest_path=manifest_path, schema_path=schema_path)

    # ------------------------------------------------------------------
    # Manifest handling helpers

    def _load_latest_manifests(self) -> Dict[str, tuple[Path, Mapping[str, object]]]:
        manifests: Dict[str, tuple[Path, Mapping[str, object]]] = {}
        if not self.version_dir.exists():
            return manifests

        for source_dir in self.version_dir.iterdir():
            if not source_dir.is_dir() or source_dir.name == "cache":
                continue
            run_dirs = sorted([d for d in source_dir.iterdir() if d.is_dir()], reverse=True)
            if not run_dirs:
                continue
            latest = run_dirs[0]
            manifest_path = latest / "manifest.json"
            if not manifest_path.exists():
                continue
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            manifests[source_dir.name] = (manifest_path, manifest)
        return manifests

    # ------------------------------------------------------------------
    # Record building helpers

    def _generate_records(self, manifests: Mapping[str, tuple[Path, Mapping[str, object]]]) -> List[FeatureRecord]:
        records: List[FeatureRecord] = []
        for source_name, (manifest_path, manifest) in manifests.items():
            entries = manifest.get("entries", [])
            for entry in entries:
                entry_file = manifest_path.parent / entry["file"]
                if not entry_file.exists():
                    continue
                method = getattr(self, f"_from_{source_name}", None)
                if method is None:
                    continue
                records.extend(method(entry, entry_file, manifest))
        return records

    def _merge_by_network(self, records: Iterable[FeatureRecord]) -> List[FeatureRecord]:
        grouped: MutableMapping[str, List[FeatureRecord]] = {}
        for record in records:
            grouped.setdefault(record.hashed_network, []).append(record)
        return [merge_records(group) for group in grouped.values()]

    # ------------------------------------------------------------------
    # Source specific parsers

    def _from_tor(self, entry: Mapping[str, object], path: Path, manifest: Mapping[str, object]) -> List[FeatureRecord]:
        fetched_at = entry.get("fetched_at", manifest.get("generatedAt", manifest.get("runDate", "")))
        records: List[FeatureRecord] = []
        if entry.get("name") == "torbulkexitlist":
            for line in path.read_text(encoding="utf-8").splitlines():
                line = line.strip()
                if not line:
                    continue
                network = normalize_network(line)
                records.append(self._record_from_network(network, "tor", fetched_at, fetched_at, is_tor=True))
        elif entry.get("name") == "onionoo-details":
            payload = json.loads(path.read_text(encoding="utf-8"))
            for relay in payload.get("relays", []):
                asn = relay.get("as_number")
                asn_name = relay.get("as_name")
                country = relay.get("country")
                for address in relay.get("exit_addresses", relay.get("or_addresses", [])):
                    try:
                        ip = address.split(":")[0]
                        network = normalize_network(ip)
                    except ValueError:
                        continue
                    record = self._record_from_network(
                        network,
                        "tor",
                        fetched_at,
                        fetched_at,
                        is_tor=True,
                        asn=str(asn) if asn is not None else None,
                        asn_name=asn_name,
                        country_code=country,
                    )
                    records.append(record)
        return records

    def _from_cloud(self, entry: Mapping[str, object], path: Path, manifest: Mapping[str, object]) -> List[FeatureRecord]:
        fetched_at = entry.get("fetched_at", manifest.get("generatedAt", manifest.get("runDate", "")))
        payload = json.loads(path.read_text(encoding="utf-8"))
        records: List[FeatureRecord] = []
        if entry.get("name") == "aws-ip-ranges":
            for prefix in payload.get("prefixes", []):
                cidr = prefix.get("ip_prefix")
                if not cidr:
                    continue
                network = normalize_network(cidr)
                records.append(
                    self._record_from_network(
                        network,
                        "cloud",
                        fetched_at,
                        fetched_at,
                        is_cloud=True,
                        cloud_provider="aws",
                        cloud_service=prefix.get("service"),
                        country_code=prefix.get("region"),
                    )
                )
            for prefix in payload.get("ipv6_prefixes", []):
                cidr = prefix.get("ipv6_prefix")
                if not cidr:
                    continue
                network = normalize_network(cidr)
                records.append(
                    self._record_from_network(
                        network,
                        "cloud",
                        fetched_at,
                        fetched_at,
                        is_cloud=True,
                        cloud_provider="aws",
                        cloud_service=prefix.get("service"),
                        country_code=prefix.get("region"),
                    )
                )
        elif entry.get("name") == "gcp-cloud-ranges":
            for prefix in payload.get("prefixes", []):
                cidr = prefix.get("ipv4Prefix") or prefix.get("ipv6Prefix")
                if not cidr:
                    continue
                network = normalize_network(cidr)
                records.append(
                    self._record_from_network(
                        network,
                        "cloud",
                        fetched_at,
                        fetched_at,
                        is_cloud=True,
                        cloud_provider="gcp",
                        cloud_service=prefix.get("service"),
                        country_code=prefix.get("scope"),
                    )
                )
        elif entry.get("name") == "azure-service-tags":
            for service in payload.get("values", []):
                service_name = service.get("name")
                properties = service.get("properties", {})
                region = properties.get("region") or properties.get("regionId")
                for cidr in properties.get("addressPrefixes", []):
                    try:
                        network = normalize_network(cidr)
                    except ValueError:
                        continue
                    records.append(
                        self._record_from_network(
                            network,
                            "cloud",
                            fetched_at,
                            fetched_at,
                            is_cloud=True,
                            cloud_provider="azure",
                            cloud_service=service_name,
                            country_code=region,
                        )
                    )
        return records

    def _from_ripe(self, entry: Mapping[str, object], path: Path, manifest: Mapping[str, object]) -> List[FeatureRecord]:
        fetched_at = entry.get("fetched_at", manifest.get("generatedAt", manifest.get("runDate", "")))
        payload = json.loads(path.read_text(encoding="utf-8"))
        prefixes = payload.get("data", {}).get("prefixes", [])
        records: List[FeatureRecord] = []
        for prefix in prefixes:
            cidr = prefix.get("prefix")
            if not cidr:
                continue
            try:
                network = normalize_network(cidr)
            except ValueError:
                continue
            records.append(
                self._record_from_network(
                    network,
                    "ripe",
                    fetched_at,
                    fetched_at,
                    asn=prefix.get("asn"),
                    asn_name=prefix.get("name"),
                    country_code=prefix.get("cc"),
                )
            )
        return records

    def _from_vpn(self, entry: Mapping[str, object], path: Path, manifest: Mapping[str, object]) -> List[FeatureRecord]:
        fetched_at = entry.get("fetched_at", manifest.get("generatedAt", manifest.get("runDate", "")))
        records: List[FeatureRecord] = []
        for line in path.read_text(encoding="utf-8").splitlines():
            value = line.strip()
            if not value or value.startswith("#"):
                continue
            try:
                network = normalize_network(value)
            except ValueError:
                continue
            records.append(self._record_from_network(network, "vpn", fetched_at, fetched_at, is_vpn=True))
        return records

    # ------------------------------------------------------------------

    def _record_from_network(
        self,
        network,
        source: str,
        first_seen: str,
        last_updated: str,
        *,
        is_tor: bool = False,
        is_cloud: bool = False,
        is_vpn: bool = False,
        asn: Optional[str] = None,
        asn_name: Optional[str] = None,
        country_code: Optional[str] = None,
        cloud_provider: Optional[str] = None,
        cloud_service: Optional[str] = None,
    ) -> FeatureRecord:
        truncated = truncate_network(network)
        hashed = hash_identifier(str(network))
        return FeatureRecord(
            network=str(network),
            truncated_network=truncated,
            hashed_network=hashed,
            asn=asn,
            asn_name=asn_name,
            country_code=country_code,
            is_cloud=is_cloud,
            is_tor=is_tor,
            is_vpn=is_vpn,
            cloud_provider=cloud_provider,
            cloud_service=cloud_service,
            source=source,
            first_seen=first_seen,
            last_updated=last_updated,
            metadata={},
        )

    # ------------------------------------------------------------------

    def _prune_old_runs(self, retention_days: int) -> None:
        if retention_days <= 0 or not self.version_dir.exists():
            return
        cutoff = datetime.now(timezone.utc) - timedelta(days=retention_days)
        for source_dir in self.version_dir.iterdir():
            if not source_dir.is_dir():
                continue
            for run_dir in source_dir.iterdir():
                if not run_dir.is_dir():
                    continue
                try:
                    run_date = datetime.strptime(run_dir.name, "%Y-%m-%d").replace(tzinfo=timezone.utc)
                except ValueError:
                    continue
                if run_date < cutoff:
                    for child in run_dir.iterdir():
                        if child.is_file():
                            child.unlink()
                    try:
                        run_dir.rmdir()
                    except OSError:
                        continue


__all__ = [
    "FeatureDataset",
    "OfflineFeatureBuilder",
]
