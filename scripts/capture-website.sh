#!/usr/bin/env bash
set -euo pipefail

# Capture full-page screenshots for the Website app using Playwright (Chromium)
# Requirements: Node.js >= 18, npm, and ability to build the Website workspace

ROOT_DIR="$(cd "$(dirname "$0")"/.. && pwd)"
WEBSITE_DIR="$ROOT_DIR/website"
BASE_URL="${WEBSITE_BASE_URL:-http://localhost:3000}"
PORT=3000

echo "[1/6] Installing dependencies (root + website)"
cd "$ROOT_DIR"
npm ci
cd "$WEBSITE_DIR"
npm ci

echo "[2/6] Building website"
npm run build

echo "[3/6] Starting website on port $PORT"
PORT=$PORT npm run start &
SITE_PID=$!
trap 'kill $SITE_PID >/dev/null 2>&1 || true' EXIT INT TERM

echo "[4/6] Waiting for server: $BASE_URL"
for i in {1..60}; do
  if curl -fsS "$BASE_URL" >/dev/null; then echo "Website is up"; break; fi
  sleep 1
  if [[ $i -eq 60 ]]; then echo "ERROR: site did not start" >&2; exit 1; fi
done

echo "[5/6] Installing Playwright (Chromium only)"
cd "$ROOT_DIR"
npx playwright install --with-deps chromium

echo "[6/6] Capturing screenshots"
WEBSITE_BASE_URL="$BASE_URL" \
ROUTES='["/","/pricing","/documentation","/about","/contact"]' \
node "$ROOT_DIR/quality/tools/capture-website-screenshots.js"

echo "✅ Done. Screenshots saved under artifacts/website-screenshots/<timestamp>"
