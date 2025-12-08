#!/usr/bin/env bash
set -euo pipefail

# Zip evidence folder for sign-off (0.0.13)
# Usage: ./scripts/ops/zip_evidence.sh 2025-12-08

DATE_TAG="${1:-$(date +%F)}"
DIR="evidence-${DATE_TAG}"

if [ ! -d "$DIR" ]; then
  echo "[err] Directory $DIR not found" >&2
  exit 1
fi

ZIP="${DIR}.zip"
echo "[run] Zipping ${DIR} -> ${ZIP}"
rm -f "$ZIP"
zip -r -q "$ZIP" "$DIR"
echo "[done] Created $ZIP"
