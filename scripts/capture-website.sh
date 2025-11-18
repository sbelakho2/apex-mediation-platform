#!/usr/bin/env bash
set -euo pipefail

# Capture full-page screenshots for the Website app using Playwright (Chromium)
# Requirements: Node.js >= 18, npm, and ability to build the Website workspace

ROOT_DIR="$(cd "$(dirname "$0")"/.. && pwd)"
WEBSITE_DIR="$ROOT_DIR/website"
BASE_URL="${WEBSITE_BASE_URL:-http://localhost:3000}"
PORT="${PORT:-3000}"
DEFAULT_ROUTES='["/","/pricing","/documentation","/about","/contact"]'
RAW_ROUTES="${ROUTES:-$DEFAULT_ROUTES}"
DRY_RUN=0
DO_INSTALL=0
ROUTES_FILE=""

print_usage(){
  cat <<USAGE
Capture Website screenshots using Playwright.

Usage:
  $(basename "$0") [--dry-run] [--install] [--routes FILE] [--base-url URL]

Env:
  WEBSITE_BASE_URL       Base URL (default http://localhost:3000)
  ROUTES                 JSON array of routes (alternative to --routes)
  CAPTURE_ROUTES         Comma/space-separated routes (converted to JSON automatically)
  CAPTURE_ROUTES_FILE    Path to newline-separated routes (same format as --routes)
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN=1; shift ;;
    --install) DO_INSTALL=1; shift ;;
    --routes) ROUTES_FILE="$2"; shift 2 ;;
    --base-url) BASE_URL="$2"; shift 2 ;;
    -h|--help) print_usage; exit 0 ;;
    *) echo "Unknown arg: $1" >&2; print_usage; exit 2 ;;
  esac
done

if [[ -n "$ROUTES_FILE" ]]; then
  if [[ ! -f "$ROUTES_FILE" ]]; then echo "Routes file not found: $ROUTES_FILE" >&2; exit 2; fi
  # Convert newline-separated to JSON array
  mapfile -t lines <"$ROUTES_FILE"
  json="["; sep=""; for r in "${lines[@]}"; do json+="$sep\"$r\""; sep=","; done; json+="]"
  RAW_ROUTES="$json"
fi

if [[ -z "$ROUTES_FILE" && -n "${CAPTURE_ROUTES_FILE:-}" ]]; then
  if [[ ! -f "$CAPTURE_ROUTES_FILE" ]]; then
    echo "Routes file not found: $CAPTURE_ROUTES_FILE" >&2
    exit 2
  fi
  mapfile -t lines <"$CAPTURE_ROUTES_FILE"
  json="["; sep=""; for r in "${lines[@]}"; do json+="$sep\"$r\""; sep=","; done; json+="]"
  RAW_ROUTES="$json"
fi

if [[ -n "${CAPTURE_ROUTES:-}" ]]; then
  RAW_ROUTES="${CAPTURE_ROUTES}"
fi

if [[ -n "${WEBSITE_CAPTURE_ROUTES:-}" ]]; then
  RAW_ROUTES="${WEBSITE_CAPTURE_ROUTES}"
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
    route=${route//"/\"}
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
  echo "[DRY-RUN] Would optionally install Playwright and start website if not running"
  exit 0
fi

echo "[1/6] Preparing dependencies (root + website)"
cd "$ROOT_DIR"

checksum() { shasum -a 256 "$1" 2>/dev/null | awk '{print $1}' || sha256sum "$1" 2>/dev/null | awk '{print $1}'; }

if [[ "$DO_INSTALL" -eq 1 ]]; then
  echo "Running npm ci at repo root (opt-in)"
  npm ci
else
  echo "Skipping npm ci at repo root (use --install to force)"
fi

cd "$WEBSITE_DIR"
if [[ "$DO_INSTALL" -eq 1 ]]; then
  if [[ -f package-lock.json ]]; then
    cur_hash=$(checksum package-lock.json)
    stamp=".capture_install.stamp"
    prev_hash=""
    [[ -f "$stamp" ]] && prev_hash=$(cat "$stamp") || true
    if [[ "$cur_hash" != "$prev_hash" ]]; then
      echo "Lockfile changed; running npm ci"
      npm ci
      echo "$cur_hash" > "$stamp"
    else
      echo "Lockfile unchanged; skipping npm ci"
    fi
  else
    npm ci
  fi
else
  echo "Skipping npm ci in website (use --install to force)"
fi

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
ROUTES="$ROUTES_JSON" \
node "$ROOT_DIR/quality/tools/capture-website-screenshots.js"

echo "✅ Done. Screenshots saved under artifacts/website-screenshots/<timestamp>"
