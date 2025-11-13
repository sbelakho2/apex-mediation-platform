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

cd "$IOS_DIR"

MODULE_NAME="RivalApexMediationSDK"
OUT_DIR="$IOS_DIR/build/docs"
ZIP_PATH="$IOS_DIR/build/ios-docs.zip"

echo "[docs] Generating docs for module: $MODULE_NAME"
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
  jazzy \
    --clean \
    --output "$OUT_DIR" \
    --module "$MODULE_NAME" \
    --build-tool-arguments -scheme,"$MODULE_NAME",-sdk,iphonesimulator \
    --min-acl public
fi

echo "[docs] Zipping docs to $ZIP_PATH"
cd "$OUT_DIR"
zip -qr "$ZIP_PATH" .

echo "[docs] Docs generated and archived: $ZIP_PATH"
