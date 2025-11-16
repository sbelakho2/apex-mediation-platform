import json
import os
import sys
from pathlib import Path

import pytest


# Ensure we can import from ML/scripts/lib when tests run from repo root
THIS_DIR = Path(__file__).parent
SCRIPTS_DIR = THIS_DIR.parent
LIB_DIR = SCRIPTS_DIR / "lib"
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))
if str(LIB_DIR) not in sys.path:
    sys.path.insert(0, str(LIB_DIR))

from lib.manifest import (
    Manifest,
    compute_sha256,
    validate_manifest,
    refresh_manifest,
    ManifestError,
)


def write_file(p: Path, content: bytes) -> None:
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_bytes(content)


def write_manifest(p: Path, data: dict) -> None:
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(data, indent=2))


def test_validate_manifest_with_correct_checksum(tmp_path: Path) -> None:
    data_file = tmp_path / "sample.csv"
    write_file(data_file, b"a,b\n1,2\n")
    sha = compute_sha256(data_file)
    mfile = tmp_path / "sample_manifest.json"
    write_manifest(
        mfile,
        {
            "source": "unit-test",
            "path": data_file.name,
            "format": "csv",
            "sha256": sha,
        },
    )

    m = validate_manifest(mfile)
    assert m.sha256 == sha
    assert m.format == "csv"


def test_validate_manifest_raises_on_checksum_mismatch(tmp_path: Path) -> None:
    data_file = tmp_path / "data.jsonl"
    write_file(data_file, b"{\"x\":1}\n")
    wrong_sha = "0" * 64
    mfile = tmp_path / "data_manifest.json"
    write_manifest(
        mfile,
        {
            "source": "unit-test",
            "path": data_file.name,
            "format": "jsonl",
            "sha256": wrong_sha,
        },
    )

    with pytest.raises(ManifestError):
        validate_manifest(mfile)


def test_refresh_manifest_populates_sha_and_version(tmp_path: Path) -> None:
    data_file = tmp_path / "d.parquet"
    write_file(data_file, b"PAR1\x15fake")  # not a real parquet, just bytes for sha
    mfile = tmp_path / "d_manifest.json"
    write_manifest(
        mfile,
        {
            "source": "unit-test",
            "path": data_file.name,
            "format": "parquet",
        },
    )

    # Missing checksum should be allowed for refresh, and after that present
    m = refresh_manifest(mfile, version="v0-test")
    assert m.sha256 is not None and len(m.sha256) == 64
    assert m.version == "v0-test"
    assert m.updated_at is not None


def test_validate_manifest_raises_on_missing_file(tmp_path: Path) -> None:
    # Manifest points to a non-existent file
    mfile = tmp_path / "missing_manifest.json"
    mfile.write_text(
        json.dumps(
            {
                "source": "unit-test",
                "path": "does_not_exist.csv",
                "format": "csv",
                "sha256": "0" * 64,
            },
            indent=2,
        )
    )
    with pytest.raises(ManifestError):
        validate_manifest(mfile)


def test_validate_manifest_requires_sha_in_strict_mode(tmp_path: Path) -> None:
    # Create a real data file but omit sha256; strict mode should fail
    data_file = tmp_path / "data.csv"
    write_file(data_file, b"a\n1\n")
    mfile = tmp_path / "strict_missing_sha_manifest.json"
    write_manifest(
        mfile,
        {
            "source": "unit-test",
            "path": data_file.name,
            "format": "csv",
        },
    )
    with pytest.raises(ManifestError):
        validate_manifest(mfile, strict_checksum=True)
    # Allow missing checksum when strict is disabled
    _ = validate_manifest(mfile, strict_checksum=False)


def test_load_manifest_raises_on_corrupt_json(tmp_path: Path) -> None:
    # Write an invalid JSON file
    corrupt = tmp_path / "corrupt_manifest.json"
    corrupt.write_text("{" )  # incomplete JSON
    with pytest.raises(ManifestError):
        validate_manifest(corrupt)
