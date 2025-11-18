#!/usr/bin/env bash
set -euo pipefail

# Capture full-page screenshots for the Console (admin) app using Playwright (Chromium)
# Requirements: Node.js >= 18, npm, and ability to build/start the Console workspace

ROOT_DIR="$(cd "$(dirname "$0")"/.. && pwd)"
CONSOLE_DIR="$ROOT_DIR/console"
BASE_URL="${CONSOLE_BASE_URL:-http://localhost:3001}"
PORT="${PORT:-3001}"
DEFAULT_ROUTES='["/","/billing","/billing/invoices","/settings/billing"]'
DRY_RUN=0
DO_INSTALL=0
ROUTES_FILE=""
RAW_ROUTES="${ROUTES:-$DEFAULT_ROUTES}"

usage(){ cat <<USAGE
Capture Console (admin) screenshots using Playwright.

Usage:
  $(basename "$0") [--dry-run] [--install] [--routes FILE] [--base-url URL]

Env:
  CONSOLE_BASE_URL            Base URL (default http://localhost:3001)
  ROUTES                      JSON array of routes (legacy)
  CONSOLE_CAPTURE_ROUTES      Comma/space-separated routes (converted to JSON)
  CAPTURE_ROUTES              Same as above; kept for parity with website script
  CONSOLE_CAPTURE_ROUTES_FILE Path to newline-separated routes
  CAPTURE_ROUTES_FILE         Same format; used if CLI flag not supplied
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN=1; shift ;;
    --install) DO_INSTALL=1; shift ;;
    --routes) ROUTES_FILE="$2"; shift 2 ;;
    --base-url) BASE_URL="$2"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown arg: $1" >&2; usage; exit 2 ;;
  esac
done

if [[ -n "$ROUTES_FILE" ]]; then
  if [[ ! -f "$ROUTES_FILE" ]]; then echo "Routes file not found: $ROUTES_FILE" >&2; exit 2; fi
  mapfile -t lines <"$ROUTES_FILE"
  json="["; sep=""; for r in "${lines[@]}"; do json+="$sep\"$r\""; sep=","; done; json+="]"
  RAW_ROUTES="$json"
fi

if [[ -z "$ROUTES_FILE" && -n "${CONSOLE_CAPTURE_ROUTES_FILE:-}" ]]; then
  if [[ ! -f "$CONSOLE_CAPTURE_ROUTES_FILE" ]]; then
    echo "Routes file not found: $CONSOLE_CAPTURE_ROUTES_FILE" >&2
    exit 2
  fi
  mapfile -t lines <"$CONSOLE_CAPTURE_ROUTES_FILE"
  json="["; sep=""; for r in "${lines[@]}"; do json+="$sep\"$r\""; sep=","; done; json+="]"
  RAW_ROUTES="$json"
fi

if [[ -z "$ROUTES_FILE" && -z "${CONSOLE_CAPTURE_ROUTES_FILE:-}" && -n "${CAPTURE_ROUTES_FILE:-}" ]]; then
  if [[ ! -f "$CAPTURE_ROUTES_FILE" ]]; then
    echo "Routes file not found: $CAPTURE_ROUTES_FILE" >&2
    exit 2
  fi
  mapfile -t lines <"$CAPTURE_ROUTES_FILE"
  json="["; sep=""; for r in "${lines[@]}"; do json+="$sep\"$r\""; sep=","; done; json+="]"
  RAW_ROUTES="$json"
fi

if [[ -n "${CONSOLE_CAPTURE_ROUTES:-}" ]]; then
  RAW_ROUTES="${CONSOLE_CAPTURE_ROUTES}"
elif [[ -n "${CAPTURE_ROUTES:-}" ]]; then
  RAW_ROUTES="${CAPTURE_ROUTES}"
fi

normalize_routes_json() {
  local input="$1"
  if [[ "$input" =~ ^\[.*\]$ ]]; then
    printf '%s' "$input"
    return
  fi
  local json="["
  local first=1
  while IFS= read -r route; do
    route="${route//\r/}"
    route="${route## }"
    route="${route%% }"
    [[ -z "$route" ]] && continue
    route=${route//\"/\\\"}
    if [[ $first -eq 0 ]]; then json+=","; fi
    json+="\"$route\""
    first=0
  done < <(printf '%s' "$input" | tr ',;' '\n')
  json+=']'
  printf '%s' "$json"
}

ROUTES_JSON=$(normalize_routes_json "$RAW_ROUTES")

if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "[DRY-RUN] Would capture routes: $ROUTES_JSON from $BASE_URL"
  echo "[DRY-RUN] Would optionally npm ci and start console"
  exit 0
fi

echo "[1/7] Preparing dependencies (root + console)"
cd "$ROOT_DIR"
checksum() { shasum -a 256 "$1" 2>/dev/null | awk '{print $1}' || sha256sum "$1" 2>/dev/null | awk '{print $1}'; }
if [[ "$DO_INSTALL" -eq 1 ]]; then
  if [[ -f package-lock.json ]]; then
    cur_hash=$(checksum package-lock.json)
    stamp=".capture_console_root.stamp"
    prev_hash=""; [[ -f "$stamp" ]] && prev_hash=$(cat "$stamp") || true
    if [[ "$cur_hash" != "$prev_hash" ]]; then
      npm ci
      echo "$cur_hash" > "$stamp"
    else
      echo "Root lockfile unchanged; skipping npm ci"
    fi
  else
    npm ci
  fi
else
  echo "Skipping npm ci at root (use --install)"
fi

cd "$CONSOLE_DIR"
if [[ "$DO_INSTALL" -eq 1 ]]; then
  if [[ -f package-lock.json ]]; then
    cur_hash=$(checksum package-lock.json)
    stamp=".capture_install.stamp"
    prev_hash=""; [[ -f "$stamp" ]] && prev_hash=$(cat "$stamp") || true
    if [[ "$cur_hash" != "$prev_hash" ]]; then
      npm ci
      echo "$cur_hash" > "$stamp"
    else
      echo "Lockfile unchanged; skipping npm ci"
    fi
  else
    npm ci
  fi
else
  echo "Skipping npm ci in console (use --install)"
fi

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
WEBSITE_BASE_URL="$BASE_URL" \
ROUTES="$ROUTES_JSON" \
OUT_DIR="${OUT_DIR:-artifacts/console-screenshots}" \
node "$ROOT_DIR/quality/tools/capture-website-screenshots.js"

echo "[7/7] Done. Screenshots saved under ${OUT_DIR:-artifacts/console-screenshots}/<timestamp>"
