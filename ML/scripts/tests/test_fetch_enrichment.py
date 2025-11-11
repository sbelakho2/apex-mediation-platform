from __future__ import annotations

import json
from pathlib import Path

import pytest
import responses

from ml_pipelines.enrichment import fetch_sources


@pytest.fixture()
def base_dir(tmp_path: Path) -> Path:
    root = tmp_path / "enrichment"
    root.mkdir()
    return root


@responses.activate
def test_fetch_enrichment_downloads_and_generates_manifest(base_dir: Path) -> None:
    responses.add(
        responses.GET,
        "https://check.torproject.org/torbulkexitlist",
        body="1.1.1.1\n2.2.2.2\n",
        status=200,
        content_type="text/plain",
    )
    responses.add(
        responses.GET,
        "https://onionoo.torproject.org/details?type=relay&flag=Exit",
        json={"relays": [{"fingerprint": "abc"}, {"fingerprint": "def"}]},
        status=200,
        content_type="application/json",
    )

    result = fetch_sources(base_dir, sources=["tor"], include_vpn_lists=False, force=False)
    run = result["tor"]
    manifest = json.loads(run.manifest_path.read_text(encoding="utf-8"))

    assert manifest["source"] == "tor"
    assert manifest["version"] == "v1"
    assert len(manifest["entries"]) == 2
    entry_names = {entry["name"] for entry in manifest["entries"]}
    assert entry_names == {"torbulkexitlist", "onionoo-details"}

    tor_file = run.manifest_path.parent / "torbulkexitlist.txt"
    assert tor_file.exists()
    assert tor_file.read_text(encoding="utf-8").startswith("1.1.1.1")

    root_manifest = json.loads((base_dir / "v1" / "manifest.json").read_text(encoding="utf-8"))
    assert root_manifest["version"] == "v1"
    assert "tor" in root_manifest["latestRuns"]


@responses.activate
def test_fetch_enrichment_is_idempotent_without_force(base_dir: Path) -> None:
    responses.add(
        responses.GET,
        "https://check.torproject.org/torbulkexitlist",
        body="1.1.1.1\n",
        status=200,
        content_type="text/plain",
    )
    responses.add(
        responses.GET,
        "https://onionoo.torproject.org/details?type=relay&flag=Exit",
        json={"relays": []},
        status=200,
        content_type="application/json",
    )

    fetch_sources(base_dir, sources=["tor"], include_vpn_lists=False, force=False)
    call_count_after_first = len(responses.calls)

    fetch_sources(base_dir, sources=["tor"], include_vpn_lists=False, force=False)
    call_count_after_second = len(responses.calls)

    assert call_count_after_first == 2
    assert call_count_after_second == call_count_after_first


@responses.activate
def test_vpn_lists_require_explicit_opt_in(base_dir: Path) -> None:
    # Provide minimal responses for required sources
    responses.add(
        responses.GET,
        "https://ip-ranges.amazonaws.com/ip-ranges.json",
        json={"prefixes": [], "ipv6_prefixes": []},
        status=200,
    )
    responses.add(
        responses.GET,
        "https://www.gstatic.com/ipranges/cloud.json",
        json={"prefixes": []},
        status=200,
    )
    responses.add(
        responses.GET,
        "https://download.microsoft.com/download/2/1/5/2158C934-979C-4B40-8C4D-9BEF7F24863F/ServiceTags_Public.json",
        json={"values": []},
        status=200,
    )

    fetch_sources(base_dir, sources=["cloud", "vpn"], include_vpn_lists=False, force=False)

    vpn_dir = base_dir / "v1" / "vpn"
    assert not vpn_dir.exists()

    responses.add(
        responses.GET,
        "https://raw.githubusercontent.com/X4BNet/lists_vpn/main/output/vpn_hosts.txt",
        body="1.2.3.4\n",
        status=200,
        content_type="text/plain",
    )
    responses.add(
        responses.GET,
        "https://raw.githubusercontent.com/ejrv/VPNs/master/vpn-ipv4.txt",
        body="5.6.7.8\n",
        status=200,
        content_type="text/plain",
    )

    fetch_sources(base_dir, sources=["vpn"], include_vpn_lists=True, force=False)
    assert (base_dir / "v1" / "vpn").exists()
