#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PACKAGE_DIR="$ROOT_DIR"
MAX_SIZE_KB=100

actual_size=$(du -sk "$PACKAGE_DIR/Runtime" | awk '{print $1}')
if [[ "$actual_size" -gt "$MAX_SIZE_KB" ]]; then
  echo "Runtime folder exceeds ${MAX_SIZE_KB}KB budget (actual ${actual_size}KB)"
  exit 1
fi

echo "Runtime size check OK (${actual_size}KB <= ${MAX_SIZE_KB}KB)"

pushd "$ROOT_DIR/Tests" >/dev/null
 dotnet test
popd >/dev/null

echo "Unity SDK constraints satisfied."
