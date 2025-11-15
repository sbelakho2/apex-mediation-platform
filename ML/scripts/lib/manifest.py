"""
Manifest schema and helpers for dataset/enrichment inputs.

Goals (FIX-06):
- Add checksums and versioning to enrichment/weak-supervision manifests
- Provide a reusable validation routine used by data loaders
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import List, Optional, Literal, Dict, Any
import hashlib
import json
import datetime as dt


Format = Literal["csv", "jsonl", "parquet", "tsv", "json"]


@dataclass
class Manifest:
    source: str
    path: str  # file path on disk or URL
    format: Format
    columns: Optional[List[str]] = None
    row_count: Optional[int] = None
    sha256: Optional[str] = None
    version: Optional[str] = None
    updated_at: Optional[str] = None  # ISO8601

    @staticmethod
    def from_dict(d: Dict[str, Any]) -> "Manifest":
        required = ["source", "path", "format"]
        for k in required:
            if k not in d or d[k] in (None, ""):
                raise ValueError(f"Manifest missing required field: {k}")
        fmt = str(d["format"]).lower()
        if fmt not in ("csv", "jsonl", "parquet", "tsv", "json"):
            raise ValueError(f"Unsupported format: {fmt}")
        return Manifest(
            source=str(d["source"]),
            path=str(d["path"]),
            format=fmt,  # type: ignore
            columns=list(d["columns"]) if d.get("columns") else None,
            row_count=int(d["row_count"]) if d.get("row_count") is not None else None,
            sha256=str(d["sha256"]) if d.get("sha256") else None,
            version=str(d["version"]) if d.get("version") else None,
            updated_at=str(d["updated_at"]) if d.get("updated_at") else None,
        )

    def to_dict(self) -> Dict[str, Any]:
        return {
            "source": self.source,
            "path": self.path,
            "format": self.format,
            **({"columns": self.columns} if self.columns is not None else {}),
            **({"row_count": self.row_count} if self.row_count is not None else {}),
            **({"sha256": self.sha256} if self.sha256 is not None else {}),
            **({"version": self.version} if self.version is not None else {}),
            **({"updated_at": self.updated_at} if self.updated_at is not None else {}),
        }


def compute_sha256(file_path: Path, chunk_size: int = 1024 * 1024) -> str:
    h = hashlib.sha256()
    with file_path.open("rb") as f:
        while True:
            chunk = f.read(chunk_size)
            if not chunk:
                break
            h.update(chunk)
    return h.hexdigest()


class ManifestError(Exception):
    pass


def load_manifest(path: Path) -> Manifest:
    try:
        data = json.loads(path.read_text())
    except Exception as e:  # noqa: BLE001
        raise ManifestError(f"Failed to read manifest JSON: {path}: {e}")
    try:
        return Manifest.from_dict(data)
    except Exception as e:  # noqa: BLE001
        raise ManifestError(f"Invalid manifest structure: {e}")


def validate_manifest(manifest_path: Path, base_dir: Optional[Path] = None, strict_checksum: bool = True) -> Manifest:
    """
    Validate manifest fields and referenced file:
    - required fields present (source, path, format)
    - referenced file exists (for local paths)
    - sha256 matches when provided (strict by default)
    Returns the loaded Manifest (possibly with computed sha256 if missing and strict=False).
    """
    m = load_manifest(manifest_path)
    p = Path(m.path)
    if not (m.path.startswith("http://") or m.path.startswith("https://")):
        # Treat as local path (allow relative to base_dir or manifest file dir)
        resolved = (base_dir or manifest_path.parent) / p
        resolved = resolved.resolve()
        if not resolved.exists():
            raise ManifestError(f"Data file not found: {resolved}")
        if m.sha256:
            actual = compute_sha256(resolved)
            if actual != m.sha256:
                raise ManifestError(
                    f"Checksum mismatch for {resolved}: expected {m.sha256}, got {actual}"
                )
        elif strict_checksum:
            raise ManifestError("Manifest missing sha256; run manifest_tools refresh to populate.")
    return m


def refresh_manifest(manifest_path: Path, version: Optional[str] = None, base_dir: Optional[Path] = None) -> Manifest:
    """
    Compute sha256 and update version/updated_at in place for a local file.
    """
    m = load_manifest(manifest_path)
    p = Path(m.path)
    if m.path.startswith("http://") or m.path.startswith("https://"):
        # Cannot compute checksum for remote URLs here.
        now = dt.datetime.utcnow().isoformat(timespec="seconds") + "Z"
        m.version = version or m.version or now
        m.updated_at = now
    else:
        resolved = (base_dir or manifest_path.parent) / p
        resolved = resolved.resolve()
        if not resolved.exists():
            raise ManifestError(f"Data file not found: {resolved}")
        sha = compute_sha256(resolved)
        now = dt.datetime.utcnow().isoformat(timespec="seconds") + "Z"
        m.sha256 = sha
        m.version = version or m.version or now
        m.updated_at = now

    manifest_path.write_text(json.dumps(m.to_dict(), indent=2, sort_keys=True))
    return m


def scan_for_manifests(root: Path) -> List[Path]:
    manifests: List[Path] = []
    for ext in (".json",):
        for p in root.rglob(f"*{ext}"):
            # Heuristic: manifest files often named *_manifest.json or *.manifest.json
            name = p.name.lower()
            if name.endswith("manifest.json") or name.endswith("_manifest.json") or "manifest" in name:
              manifests.append(p)
    return manifests
