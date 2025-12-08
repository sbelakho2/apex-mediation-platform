#!/usr/bin/env bash
set -euo pipefail

# Capture Console/API evidence for checklist 0.0.7 on staging.
# Usage:
#   RESEND_API_KEY=re_xxx \
#   ./scripts/ops/staging_console_capture.sh \
#     --base https://api.apexmediation.ee \
#     --console https://console.apexmediation.ee \
#     --app-id <SEEDED_APP_ID> \
#     --date 2025-12-06

BASE_URL="https://api.apexmediation.ee"
CONSOLE_URL="https://console.apexmediation.ee"
APP_ID=""
DATE_TAG="$(date +%F)"
OUT_DIR="evidence-${DATE_TAG}/console"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --base) BASE_URL="$2"; shift 2 ;;
    --console) CONSOLE_URL="$2"; shift 2 ;;
    --app-id) APP_ID="$2"; shift 2 ;;
    --date) DATE_TAG="$2"; OUT_DIR="evidence-${DATE_TAG}/console"; shift 2 ;;
    *) echo "[warn] Unknown arg: $1"; shift ;;
  esac
done

auto_resolve_app_id() {
  # Try to resolve a seeded app id via DATABASE_URL using the sandbox publisher
  if [[ -z "${DATABASE_URL:-}" ]]; then
    echo "[warn] DATABASE_URL not set; cannot auto-resolve app id"
    return 1
  fi
  # Attempt to read sandbox publisher id from backend/scripts/sandboxConstants.js
  local PUBLISHER_ID
  if [[ -f "backend/scripts/sandboxConstants.js" ]]; then
    PUBLISHER_ID=$(node -e "console.log(require('./backend/scripts/sandboxConstants').SANDBOX_PUBLISHER_ID)")
  fi
  if [[ -z "$PUBLISHER_ID" ]]; then
    echo "[warn] SANDBOX_PUBLISHER_ID not found in sandboxConstants.js; selecting first sandbox app"
    APP_ID=$(psql "$DATABASE_URL" -t -A -c "SELECT a.id FROM apps a ORDER BY a.created_at DESC LIMIT 1;")
  else
    APP_ID=$(psql "$DATABASE_URL" -t -A -c "SELECT a.id FROM apps a JOIN publishers p ON p.id=a.publisher_id WHERE p.id='${PUBLISHER_ID}' ORDER BY a.created_at DESC LIMIT 1;")
  fi
  if [[ -z "$APP_ID" ]]; then
    echo "[err] Failed to auto-resolve app id from database" >&2
    return 2
  fi
  echo "[info] Auto-resolved app id: $APP_ID"
}

if [[ -z "${APP_ID}" ]]; then
  echo "[info] --app-id not provided, attempting auto-resolution via DATABASE_URL"
  auto_resolve_app_id || {
    echo "[err] Could not determine app id automatically. Provide --app-id." >&2
    exit 1
  }
fi

echo "[run] Writing outputs to ${OUT_DIR}"
mkdir -p "${OUT_DIR}"

echo "[run] Capture /health and /ready"
curl -sI "${BASE_URL}/health" | tee "${OUT_DIR}/health.txt" >/dev/null
curl -s "${BASE_URL}/ready" | jq '.' | tee "${OUT_DIR}/ready.json" >/dev/null || true

echo "[run] Transparency export sample (app_id=${APP_ID}, date=${DATE_TAG})"
curl -s -G \
  --data-urlencode "app_id=${APP_ID}" \
  --data-urlencode "date=${DATE_TAG}" \
  "${BASE_URL}/api/v1/transparency/exports" \
  | tee "${OUT_DIR}/transparency-export.json" >/dev/null

if command -v jq >/dev/null 2>&1; then
  jq '.[0] | {request_id,adapter,clearing_price,auction_root,bid_commitment,gdpr_applies,tc_string_present:(has("tc_string"))}' \
    "${OUT_DIR}/transparency-export.json" | tee "${OUT_DIR}/transparency-sample.json" >/dev/null || true
fi

# Validate redaction on the export (auto-fail on suspected PII or missing fields)
if command -v node >/dev/null 2>&1; then
  if [ -f "scripts/ops/redaction_validate.js" ]; then
    echo "[run] Validating transparency export redaction"
    set +e
    node scripts/ops/redaction_validate.js "${OUT_DIR}/transparency-export.json" --out "${OUT_DIR}/transparency-validate.json"
    STATUS=$?
    set -e
    if [ $STATUS -ne 0 ]; then
      echo "[fail] Redaction validation failed. See ${OUT_DIR}/transparency-validate.json" >&2
      exit $STATUS
    else
      echo "[ok] Redaction validation passed. Report at ${OUT_DIR}/transparency-validate.json"
    fi
  else
    echo "[warn] redaction_validate.js not found; skipping validation"
  fi
else
  echo "[skip] Node.js not available; skipping redaction validation"
fi

if [[ -n "${RESEND_API_KEY:-}" ]]; then
  echo "[run] Fetch Resend emails (latest 25; key from env only)"
  curl -s -H "Authorization: Bearer ${RESEND_API_KEY}" \
    -H 'Content-Type: application/json' \
    "https://api.resend.com/emails?limit=25" \
    | tee "${OUT_DIR}/resend-emails.json" >/dev/null || true
else
  echo "[skip] RESEND_API_KEY not set; skipping Resend evidence"
fi

echo "[done] Console/API capture complete. Review ${OUT_DIR}/ for artifacts."
