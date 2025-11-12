#!/usr/bin/env bash
set -euo pipefail

# Capture full-page screenshots for the Console (admin) app using Playwright (Chromium)
# Requirements: Node.js >= 18, npm, and ability to build/start the Console workspace

ROOT_DIR="$(cd "$(dirname "$0")"/.. && pwd)"
CONSOLE_DIR="$ROOT_DIR/console"
BASE_URL="${CONSOLE_BASE_URL:-http://localhost:3001}"
PORT="${PORT:-3001}"

echo "[1/7] Installing dependencies (root + console)"
cd "$ROOT_DIR"
npm ci
cd "$CONSOLE_DIR"
npm ci

echo "[2/7] Building console"
npm run build || npm run build --if-present

echo "[3/7] Starting console on port $PORT"
PORT=$PORT npm run start &
APP_PID=$!
trap 'kill $APP_PID >/dev/null 2>&1 || true' EXIT INT TERM

echo "[4/7] Waiting for server: $BASE_URL"
for i in {1..60}; do
  if curl -fsS "$BASE_URL" >/dev/null; then echo "Console is up"; break; fi
  sleep 1
  if [[ $i -eq 60 ]]; then echo "ERROR: console did not start" >&2; exit 1; fi
done

echo "[5/7] Installing Playwright (Chromium only)"
cd "$ROOT_DIR"
npx playwright install --with-deps chromium

echo "[6/7] Capturing screenshots (admin routes)"
DEFAULT_ROUTES='["/","/billing","/billing/invoices","/settings/billing"]'
WEBSITE_BASE_URL="$BASE_URL" \
ROUTES="${ROUTES:-$DEFAULT_ROUTES}" \
OUT_DIR="${OUT_DIR:-artifacts/console-screenshots}" \
node "$ROOT_DIR/quality/tools/capture-website-screenshots.js"

echo "[7/7] Done. Screenshots saved under ${OUT_DIR:-artifacts/console-screenshots}/<timestamp>"
