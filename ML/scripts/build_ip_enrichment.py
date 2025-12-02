"""Aggregate IP intelligence feeds into a local enrichment bundle.

The script ingests AbuseIPDB CSV exports, Tor exit node lists, and cloud
provider range dumps (AWS/GCP/Azure style) and produces:

- ip_enrichment.csv  => canonical CIDR ranges with source labels
- ip_enrichment_metadata.json => counts + Bloom filter metadata for
downstream fast membership tests

Usage example (PowerShell):

    python ML/scripts/build_ip_enrichment.py \
        --abuseipdb data/enrichment/raw/abuseipdb.csv \
        --tor data/enrichment/raw/tor-exits.txt \
        --cloud data/enrichment/raw/aws-ip-ranges.json \
        --output-dir data/enrichment/cache

All inputs are treated as local files; no network access is performed.
"""
from __future__ import annotations

import argparse
import base64
import csv
import gzip
import hashlib
import json
import math
import os
from collections import Counter
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Iterable, Iterator, List, Sequence
import ipaddress

# FIX-06: optional manifest validation preflight
from lib.manifest import validate_manifest, scan_for_manifests, ManifestError


@dataclass(frozen=True)
class NetworkEntry:
    cidr: str
    source: str

    def key(self) -> str:
        return f"{self.cidr}|{self.source}"


class BloomFilter:
    """Tiny Bloom filter implementation stored as a bytearray."""

    def __init__(self, capacity: int, error_rate: float = 0.001) -> None:
        if capacity <= 0:
            raise ValueError("capacity must be positive")
        if not (0 < error_rate < 1):
            raise ValueError("error_rate must be in (0, 1)")
        self.capacity = capacity
        self.error_rate = error_rate
        self.size_bits = math.ceil(
            -(capacity * math.log(error_rate)) / (math.log(2) ** 2)
        )
        self.hash_count = max(1, int(round((self.size_bits / capacity) * math.log(2))))
        self.byte_length = (self.size_bits + 7) // 8
        self._bits = bytearray(self.byte_length)

    def _hashes(self, value: bytes) -> Iterator[int]:
        digest = hashlib.sha256(value).digest()
        needed = self.hash_count
        idx = 0
        while needed > 0:
            start = (idx * 4) % len(digest)
            chunk = digest[start : start + 4]
            if len(chunk) < 4:
                chunk = (chunk + digest)[:4]
            position = int.from_bytes(chunk, "big") % self.size_bits
            yield position
            idx += 1
            needed -= 1

    def add(self, item: str) -> None:
        encoded = item.encode("utf-8")
        for position in self._hashes(encoded):
            self._bits[position // 8] |= 1 << (position % 8)

    def __contains__(self, item: str) -> bool:
        encoded = item.encode("utf-8")
        for position in self._hashes(encoded):
            if not (self._bits[position // 8] >> (position % 8)) & 1:
                return False
        return True

    def to_dict(self) -> dict:
        return {
            "error_rate": self.error_rate,
            "hash_count": self.hash_count,
            "size_bits": self.size_bits,
            "capacity": self.capacity,
            "data_b64": base64.b64encode(bytes(self._bits)).decode("ascii"),
        }

    @classmethod
    def from_dict(cls, payload: dict) -> "BloomFilter":
        capacity = int(payload.get("capacity") or payload.get("size_bits") or 1)
        error_rate = float(payload.get("error_rate", 0.001))
        bloom = cls(capacity=max(1, capacity), error_rate=error_rate)
        bloom.hash_count = int(payload.get("hash_count", bloom.hash_count))
        stored_size_bits = int(payload.get("size_bits", bloom.size_bits))
        bloom.size_bits = max(1, stored_size_bits)
        bloom.byte_length = (bloom.size_bits + 7) // 8
        data = base64.b64decode(payload.get("data_b64", ""), validate=True)
        if data:
            if len(data) < bloom.byte_length:
                data = data + b"\x00" * (bloom.byte_length - len(data))
            bloom._bits = bytearray(data[: bloom.byte_length])
        return bloom


@contextmanager
def _open_text(path: Path):
    if path.suffix in {".gz", ".gzip"}:
        with gzip.open(path, "rt", encoding="utf-8", errors="ignore") as handle:
            yield handle
    else:
        with path.open("r", encoding="utf-8", errors="ignore") as handle:
            yield handle


def _as_network(value: str) -> ipaddress._BaseNetwork:
    value = value.strip()
    if not value:
        raise ValueError("empty network string")
    try:
        return ipaddress.ip_network(value, strict=False)
    except ValueError:
        # treat single IP
        addr = ipaddress.ip_address(value)
        prefix = 32 if isinstance(addr, ipaddress.IPv4Address) else 128
        return ipaddress.ip_network(f"{addr}/{prefix}")


def load_abuseipdb(paths: Sequence[Path]) -> List[NetworkEntry]:
    entries: List[NetworkEntry] = []
    for path in paths:
        with _open_text(path) as handle:
            reader = csv.DictReader(handle)
            column = None
            headers = {h.lower(): h for h in reader.fieldnames or []}
            for candidate in ("ipaddress", "ip", "address"):
                if candidate in headers:
                    column = headers[candidate]
                    break
            if column is None:
                raise ValueError(f"{path} missing ip column")
            for row in reader:
                raw = row.get(column) or ""
                if not raw.strip():
                    continue
                network = _as_network(raw)
                entries.append(NetworkEntry(cidr=network.with_prefixlen, source="abuseipdb"))
    return entries


def load_tor_exits(paths: Sequence[Path]) -> List[NetworkEntry]:
    entries: List[NetworkEntry] = []
    for path in paths:
        with _open_text(path) as handle:
            for line in handle:
                stripped = line.strip()
                if not stripped or stripped.startswith("#"):
                    continue
                if stripped.lower().startswith("exitaddress"):
                    parts = stripped.split()
                    if len(parts) >= 2:
                        stripped = parts[1]
                try:
                    network = _as_network(stripped)
                except ValueError:
                    continue
                entries.append(NetworkEntry(cidr=network.with_prefixlen, source="tor"))
    return entries


def load_cloud_ranges(paths: Sequence[Path]) -> List[NetworkEntry]:
    entries: List[NetworkEntry] = []
    for path in paths:
        with _open_text(path) as handle:
            payload = json.load(handle)
        prefixes = payload.get("prefixes", []) + payload.get("ipv6_prefixes", [])
        for item in prefixes:
            network_value = item.get("ip_prefix") or item.get("ipv6_prefix")
            if not network_value:
                continue
            network = _as_network(network_value)
            provider = item.get("service") or payload.get("service") or "cloud"
            entries.append(NetworkEntry(cidr=network.with_prefixlen, source=f"cloud:{provider.lower()}"))
    return entries


def dedupe_entries(entries: Iterable[NetworkEntry]) -> List[NetworkEntry]:
    seen = {}
    for entry in entries:
        seen[entry.key()] = entry
    return sorted(seen.values(), key=lambda e: (e.cidr, e.source))


def write_outputs(entries: List[NetworkEntry], output_dir: Path, error_rate: float) -> dict:
    output_dir.mkdir(parents=True, exist_ok=True)
    counts = Counter(entry.source for entry in entries)
    csv_path = output_dir / "ip_enrichment.csv"
    with csv_path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerow(["cidr", "source"])
        for entry in entries:
            writer.writerow([entry.cidr, entry.source])

    bloom = BloomFilter(capacity=max(1, len(entries)), error_rate=error_rate)
    for entry in entries:
        bloom.add(entry.cidr)

    metadata = {
        "generated_at": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
        "total_networks": len(entries),
        "sources": counts,
        "bloom": bloom.to_dict(),
    }
    metadata_path = output_dir / "ip_enrichment_metadata.json"
    with metadata_path.open("w", encoding="utf-8") as handle:
        json.dump(metadata, handle, indent=2)
    return metadata


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build local IP enrichment artifacts")
    parser.add_argument("--abuseipdb", type=Path, action="append", default=[], help="Path(s) to AbuseIPDB CSV exports")
    parser.add_argument("--tor", type=Path, action="append", default=[], help="Path(s) to Tor exit node lists")
    parser.add_argument("--cloud", type=Path, action="append", default=[], help="Path(s) to cloud provider range dumps (JSON or JSON.GZ)")
    parser.add_argument("--output-dir", type=Path, required=True, help="Destination directory for generated artifacts")
    parser.add_argument("--error-rate", type=float, default=0.001, help="Bloom filter target false-positive rate (default: 0.001)")
    parser.add_argument(
        "--validate-manifests",
        action="store_true",
        help=(
            "Validate manifest JSON files before processing inputs. "
            "If --manifest-dir is provided, scans that directory; otherwise attempts to validate "
            "manifest files adjacent to the provided inputs."
        ),
    )
    parser.add_argument(
        "--manifest-dir",
        type=Path,
        default=None,
        help="Directory that contains manifest JSON files to validate prior to processing",
    )
    return parser.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> None:
    args = parse_args(argv)

    # Optional manifest preflight validation (strict checksum by default)
    if args.validate_manifests:
        try:
            to_validate: List[Path] = []
            if args.manifest_dir:
                to_validate = scan_for_manifests(args.manifest_dir)
            else:
                # Attempt to find companion manifests next to input files
                inputs: List[Path] = []
                for seq in (args.abuseipdb or []), (args.tor or []), (args.cloud or []):
                    inputs.extend([Path(p) for p in seq])
                for inp in inputs:
                    parent = inp.parent
                    # heuristics: *_manifest.json, *.manifest.json, or contains 'manifest'
                    for cand in parent.glob("*manifest.json"):
                        to_validate.append(cand)
                    for cand in parent.glob("*.manifest.json"):
                        to_validate.append(cand)
                # de-dup
                to_validate = sorted(set(p.resolve() for p in to_validate))

            if not to_validate:
                print("[WARN] No manifest files discovered for validation.")
            for mpath in to_validate:
                validate_manifest(mpath)
                print(f"[OK] manifest: {mpath}")
        except ManifestError as e:
            raise SystemExit(f"[ERROR] manifest invalid: {e}")

    entries: List[NetworkEntry] = []
    if args.abuseipdb:
        entries.extend(load_abuseipdb(args.abuseipdb))
    if args.tor:
        entries.extend(load_tor_exits(args.tor))
    if args.cloud:
        entries.extend(load_cloud_ranges(args.cloud))
    if not entries:
        raise SystemExit("No input files provided; specify at least one feed")

    unique_entries = dedupe_entries(entries)
    metadata = write_outputs(unique_entries, args.output_dir, args.error_rate)
    print(
        f"Generated enrichment bundle with {metadata['total_networks']} networks "
        f"across {len(metadata['sources'])} sources -> {args.output_dir}"
    )


if __name__ == "__main__":  # pragma: no cover - CLI entry
    main()
