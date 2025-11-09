import json
from pathlib import Path

import pytest

from ML.scripts import build_ip_enrichment


def write_text(path: Path, content: str) -> None:
    path.write_text(content, encoding="utf-8")


def test_build_ip_enrichment_end_to_end(tmp_path: Path) -> None:
    raw_dir = tmp_path / "raw"
    raw_dir.mkdir()
    abuse_path = raw_dir / "abuse.csv"
    write_text(
        abuse_path,
        "ipAddress,confidence\n203.0.113.10,80\n203.0.113.10,90\n",
    )
    tor_path = raw_dir / "tor.txt"
    write_text(tor_path, "ExitAddress 198.51.100.5 2025-11-01 00:00:00\n")
    cloud_path = raw_dir / "cloud.json"
    write_text(
        cloud_path,
        json.dumps(
            {
                "prefixes": [
                    {"ip_prefix": "3.5.0.0/16", "service": "AMAZON"},
                ],
                "ipv6_prefixes": [
                    {"ipv6_prefix": "2001:db8::/48", "service": "AMAZON"},
                ],
            }
        ),
    )

    output_dir = tmp_path / "out"
    build_ip_enrichment.main(
        [
            "--abuseipdb",
            str(abuse_path),
            "--tor",
            str(tor_path),
            "--cloud",
            str(cloud_path),
            "--output-dir",
            str(output_dir),
            "--error-rate",
            "0.01",
        ]
    )

    metadata_path = output_dir / "ip_enrichment_metadata.json"
    assert metadata_path.exists()
    with metadata_path.open("r", encoding="utf-8") as handle:
        metadata = json.load(handle)

    assert metadata["total_networks"] == 4
    assert metadata["sources"]["abuseipdb"] == 1
    assert metadata["sources"]["tor"] == 1
    assert metadata["sources"]["cloud:amazon"] == 2

    bloom = build_ip_enrichment.BloomFilter.from_dict(metadata["bloom"])
    assert "203.0.113.10/32" in bloom
    assert "198.51.100.5/32" in bloom
    assert "3.5.0.0/16" in bloom
    assert "2001:db8::/48" in bloom

    csv_path = output_dir / "ip_enrichment.csv"
    rows = csv_path.read_text(encoding="utf-8").splitlines()
    # Header + 4 entries
    assert len(rows) == 5
    assert rows[0] == "cidr,source"


def test_no_inputs_raises(tmp_path: Path) -> None:
    with pytest.raises(SystemExit):
        build_ip_enrichment.main(["--output-dir", str(tmp_path)])
