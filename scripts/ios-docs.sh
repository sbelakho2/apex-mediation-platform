#!/usr/bin/env bash
set -euo pipefail

# Generate iOS/tvOS SDK docs (DocC if available, otherwise Jazzy) and zip them
# Usage: run from repository root or from sdk/core/ios; this script normalizes paths.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# If invoked from repo root, adjust; if already in sdk/core/ios keep it.
IOS_DIR="$REPO_ROOT/sdk/core/ios"
if [[ -f "$PWD/Package.swift" && -d "$PWD/Sources" ]]; then
  IOS_DIR="$PWD"
fi

SCHEME=""
MODULE_NAME=""
MODULE_OVERRIDE=0
MODULE_FALLBACK="RivalApexMediationSDK"

usage(){ cat <<USAGE
Generate SDK docs using DocC or Jazzy.

Usage:
  $(basename "$0") [--scheme NAME] [--module NAME]

If --scheme not provided, attempts to auto-detect from xcodebuild -list.
Module auto-detected from Package.swift (falls back to '$MODULE_FALLBACK').
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --scheme) SCHEME="$2"; shift 2 ;;
    --module) MODULE_NAME="$2"; MODULE_OVERRIDE=1; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown arg: $1" >&2; usage; exit 2 ;;
  esac
done

auto_detect_module(){
  local dir="$1"
  local detected=""
  if command -v swift >/dev/null 2>&1; then
    if json=$(cd "$dir" && swift package describe --type json 2>/dev/null); then
      detected=$(printf '%s' "$json" | python3 - <<'PY' 2>/dev/null
import json, sys
data = json.load(sys.stdin)
candidates = []
for product in data.get('products', []):
    if product.get('type') == 'library':
        name = product.get('name')
        if name:
            candidates.append(name)
if not candidates:
    for target in data.get('targets', []):
        if target.get('type') != 'test':
            name = target.get('name')
            if name:
                candidates.append(name)
if not candidates:
    name = data.get('name')
    if name:
        candidates.append(name)
print(candidates[0] if candidates else '')
PY
)
    fi
  fi
  if [[ -z "$detected" && -f "$dir/Package.swift" ]]; then
    if command -v python3 >/dev/null 2>&1; then
      detected=$(python3 - "$dir/Package.swift" <<'PY' 2>/dev/null
import re, sys
from pathlib import Path
text = Path(sys.argv[1]).read_text()
patterns = [r"\.library\s*\(.*?name:\s*\"([^\"]+)\"", r"\.target\s*\(.*?name:\s*\"([^\"]+)\""]
for pattern in patterns:
    match = re.search(pattern, text, re.S)
    if match:
        print(match.group(1))
        sys.exit(0)
print('')
PY
)
    fi
  fi
  printf '%s' "$detected"
}

cd "$IOS_DIR"

if [[ $MODULE_OVERRIDE -eq 0 ]]; then
  detected_module=$(auto_detect_module "$IOS_DIR")
  if [[ -n "$detected_module" ]]; then
    MODULE_NAME="$detected_module"
  fi
fi

if [[ -z "$MODULE_NAME" ]]; then
  MODULE_NAME="$MODULE_FALLBACK"
fi

if [[ -z "$SCHEME" ]]; then
  if command -v xcodebuild >/dev/null 2>&1; then
    # best-effort scheme detection
    set +e
    schemes=$(xcodebuild -list -json 2>/dev/null | /usr/bin/python3 -c 'import sys,json; d=json.load(sys.stdin); s=d.get("project",{}).get("schemes",[]) or d.get("workspace",{}).get("schemes",[]); print("\n".join(s))' 2>/dev/null)
    set -e || true
    if [[ -n "$schemes" ]]; then
      # prefer module name match
      while IFS= read -r sch; do
        if [[ "$sch" == "$MODULE_NAME" ]]; then SCHEME="$sch"; break; fi
        [[ -z "$SCHEME" ]] && SCHEME="$sch"
      done <<<"$schemes"
      echo "[docs] Auto-detected scheme: $SCHEME"
    else
      echo "[docs] Could not auto-detect schemes via xcodebuild; will attempt DocC by target only"
    fi
  else
    echo "[docs] xcodebuild not available; auto-detection skipped"
  fi
fi

OUT_DIR="$IOS_DIR/build/docs"
ZIP_PATH="$IOS_DIR/build/ios-docs.zip"

echo "[docs] Generating docs for module: $MODULE_NAME (scheme: ${SCHEME:-n/a})"
mkdir -p "$OUT_DIR"

DOCS_OK=0

echo "[docs] Trying Swift-DocC plugin via swift package generate-documentation..."
set +e
swift package --disable-sandbox \
  --allow-writing-to-directory "$OUT_DIR" \
  generate-documentation \
  --target "$MODULE_NAME" \
  --output-path "$OUT_DIR" \
  --transform-for-static-hosting \
  --hosting-base-path "$MODULE_NAME" >/dev/null 2>&1
DOCS_OK=$?
set -e

if [[ $DOCS_OK -ne 0 ]]; then
  echo "[docs] DocC generation failed or not available. Falling back to Jazzy..."
  if ! command -v jazzy >/dev/null 2>&1; then
    echo "[docs] Jazzy is not installed. Please install jazzy (gem install jazzy)." >&2
    exit 1
  fi
  # Clean output dir for jazzy
  rm -rf "$OUT_DIR"
  mkdir -p "$OUT_DIR"

  # Use iphonesimulator SDK to build docs for the module
  args=(--clean --output "$OUT_DIR" --module "$MODULE_NAME" --min-acl public)
  if [[ -n "$SCHEME" ]]; then
    args+=(--build-tool-arguments -scheme,"$SCHEME",-sdk,iphonesimulator)
  else
    args+=(--build-tool-arguments -scheme,"$MODULE_NAME",-sdk,iphonesimulator)
  fi
  jazzy "${args[@]}"
fi

echo "[docs] Zipping docs to $ZIP_PATH"
cd "$OUT_DIR"
zip -qr "$ZIP_PATH" .

echo "[docs] Docs generated and archived: $ZIP_PATH"
