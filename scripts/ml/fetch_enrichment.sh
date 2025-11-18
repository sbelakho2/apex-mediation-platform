#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

PYTHON_BIN=${PYTHON:-python3}

usage() {
  cat <<USAGE
Fetch ML enrichment datasets.

Usage:
  $(basename "$0") [args passed to ML.scripts.fetch_enrichment]

Environment:
  PYTHON   Python interpreter to use (default: python3)
USAGE
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage; exit 0
fi

if ! command -v "$PYTHON_BIN" >/dev/null 2>&1; then
  echo "ERROR: Python interpreter not found: $PYTHON_BIN (override with PYTHON env)" >&2
  exit 2
fi

# Optional: check version >= 3.9
set +e
ver_str=$($PYTHON_BIN -c 'import sys; print("%d.%d"%sys.version_info[:2])' 2>/dev/null)
set -e
major=${ver_str%%.*}
minor=${ver_str#*.}
if [[ -n "$ver_str" && ( "$major" -lt 3 || ( "$major" -eq 3 && "$minor" -lt 9 ) ) ]]; then
  echo "WARNING: Python $ver_str detected; 3.9+ recommended for ML tooling" >&2
fi

cd "${REPO_ROOT}" >/dev/null

"${PYTHON_BIN}" -m ML.scripts.fetch_enrichment "$@"
