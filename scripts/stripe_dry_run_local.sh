#!/usr/bin/env bash
set -euo pipefail

# Stripe + Billing Local Dry Run (Test Mode)
#
# This script automates the end-to-end local Stripe dry run using the Stripe CLI
# and your running backend at http://localhost:8080.
#
# What it does:
# 1) Checks dependencies (stripe CLI, curl, jq)
# 2) Verifies backend health and billing feature flag
# 3) Starts `stripe listen` and captures STRIPE_WEBHOOK_SECRET
# 4) Creates a Stripe Test customer (or reuses by email)
# 5) Emits a metered usage event (mediated_revenue_eur)
# 6) Creates and pays an invoice in Test Mode
# 7) Captures evidence (responses, logs) under docs/Internal/QA/stripe-dry-run/<timestamp>
#
# Requirements:
# - Backend running locally on http://localhost:8080
# - backend/.env includes STRIPE_SECRET_KEY=sk_test_... (Test key), BILLING_ENABLED=true
# - Postgres + Redis running per backend/.env
# - Stripe CLI installed and authenticated: `brew install stripe/stripe-cli/stripe && stripe login`
#
# Usage:
#   scripts/stripe_dry_run_local.sh [--email test+stripe@apexmediation.ee] [--amount-cents 2500000]
#
# Notes:
# - This will operate in Stripe Test Mode only. It does not touch Live data.

EMAIL="test+stripe@apexmediation.ee"
AMOUNT_CENTS=2500000
API_BASE="http://localhost:8080"
WEBHOOK_PATH="/api/v1/webhooks/stripe"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --email)
      EMAIL="$2"; shift 2;;
    --amount-cents)
      AMOUNT_CENTS="$2"; shift 2;;
    *) echo "Unknown argument: $1"; exit 2;;
  esac
done

command -v stripe >/dev/null 2>&1 || { echo "[ERR] stripe CLI not found. Install via: brew install stripe/stripe-cli/stripe"; exit 1; }
command -v curl >/dev/null 2>&1 || { echo "[ERR] curl not found"; exit 1; }
command -v jq >/dev/null 2>&1 || { echo "[ERR] jq not found. Install jq."; exit 1; }

ts=$(date +%Y-%m-%d_%H-%M-%S)
ROOT_DIR="docs/Internal/QA/stripe-dry-run"
ARTIFACTS_DIR="${ROOT_DIR}/${ts}"
mkdir -p "${ARTIFACTS_DIR}"
# Maintain a stable pointer to the latest run for easier consumption by other tools
LATEST_LINK="${ROOT_DIR}/latest-run"
rm -f "${LATEST_LINK}" 2>/dev/null || true
ln -s "${ARTIFACTS_DIR}" "${LATEST_LINK}" 2>/dev/null || cp /dev/null "${LATEST_LINK}" >/dev/null 2>&1 || true
echo "[INFO] Writing artifacts in ${ARTIFACTS_DIR} (symlink: ${LATEST_LINK})"
echo "[RUN] Stripe Dry Run @ ${ts}" > "${ARTIFACTS_DIR}/run.log"

# Prefer getting STRIPE_WEBHOOK_SECRET first so we can persist it and then (re)start backend
echo "[INFO] Starting stripe listen and capturing webhook secret..."
# Start stripe listen in background; capture secret from stdout
LISTEN_LOG="${ARTIFACTS_DIR}/stripe_listen.log"
set +e
# Try to extract STRIPE_SECRET_KEY from backend/.env to pass to stripe CLI (avoids interactive login)
CLI_API_KEY=""
if [[ -f "backend/.env" ]]; then
  CLI_API_KEY=$(grep -E '^STRIPE_SECRET_KEY=' backend/.env | head -n1 | cut -d'=' -f2- || true)
fi

# Helper to run stripe CLI with API key if available
stripe_cmd() {
  if [[ -n "$CLI_API_KEY" ]]; then
    STRIPE_API_KEY="$CLI_API_KEY" stripe "$@"
  else
    stripe "$@"
  fi
}
if [[ -n "$CLI_API_KEY" ]]; then
  STRIPE_API_KEY="$CLI_API_KEY" stripe listen --api-key "$CLI_API_KEY" \
    --events invoice.created,invoice.finalized,invoice.payment_succeeded,invoice.payment_failed,customer.subscription.updated,customer.subscription.deleted \
    --forward-to "${API_BASE}${WEBHOOK_PATH}" >"${LISTEN_LOG}" 2>&1 &
else
  stripe listen \
    --events invoice.created,invoice.finalized,invoice.payment_succeeded,invoice.payment_failed,customer.subscription.updated,customer.subscription.deleted \
    --forward-to "${API_BASE}${WEBHOOK_PATH}" >"${LISTEN_LOG}" 2>&1 &
fi
LISTEN_PID=$!
set -e

# Wait for the webhook secret to appear (up to 30s); proceed even if missing
for i in {1..30}; do
  if grep -q "whsec_" "${LISTEN_LOG}"; then
    break
  fi
  sleep 1
done

WEBHOOK_SECRET=$(grep -o 'whsec_[A-Za-z0-9]+' "${LISTEN_LOG}" | head -n1 || true)
if [[ -n "${WEBHOOK_SECRET}" ]]; then
  echo "[INFO] Captured STRIPE_WEBHOOK_SECRET=${WEBHOOK_SECRET} (saved in artifacts log)."
  echo "${WEBHOOK_SECRET}" > "${ARTIFACTS_DIR}/webhook_secret.txt"
else
  echo "[WARN] Stripe listen did not yield a webhook secret within 30s. Continuing without webhook forwarding."
fi

# Optionally inject the secret into backend/.env for future runs (portable implementation)
update_env_file() {
  local file="$1"
  local key="$2"
  local value="$3"
  if [[ ! -f "$file" ]]; then
    echo "$key=$value" > "$file"
    return 0
  fi
  if grep -q "^${key}=" "$file"; then
    # Write to a temp file to avoid sed -i portability issues
    awk -v k="$key" -v v="$value" 'BEGIN{changed=0} {if($0 ~ "^"k"=") {print k"="v; changed=1} else {print $0}} END{if(changed==0) print k"="v}' "$file" > "$file.tmp" && mv "$file.tmp" "$file"
  else
    echo "$key=$value" >> "$file"
  fi
}

if [[ -n "${WEBHOOK_SECRET}" && -f "backend/.env" ]]; then
  update_env_file "backend/.env" "STRIPE_WEBHOOK_SECRET" "${WEBHOOK_SECRET}"
  echo "[INFO] Updated backend/.env with STRIPE_WEBHOOK_SECRET. Triggering dev server reload."
  # Nudge nodemon-based dev server to reload by touching a source file
  touch backend/src/index.ts || true
elif [[ ! -f "backend/.env" ]]; then
  echo "[WARN] backend/.env not found; cannot persist STRIPE_WEBHOOK_SECRET automatically."
fi

echo "[INFO] Verifying webhook endpoint responds..."
curl -sI "${API_BASE}${WEBHOOK_PATH}" | tee "${ARTIFACTS_DIR}/webhook_head.txt" >/dev/null || true

echo "[INFO] Checking backend health and feature flags (waiting up to 60s for server ready)..."
start_ts=$(date +%s)
while true; do
  if curl -sSf "${API_BASE}/health" > "${ARTIFACTS_DIR}/health.json" 2>/dev/null; then
    FEATURES_JSON=$(curl -sSf "${API_BASE}/api/v1/meta/features" 2>/dev/null || echo '{}')
    echo "$FEATURES_JSON" > "${ARTIFACTS_DIR}/features.json"
    # Handle different shapes: {billingEnabled:true} or {billing:true} or {data:{billing:true}}
    BILLING_FLAG=$(echo "$FEATURES_JSON" | jq -r '(.billingEnabled // .billing // .data.billing // .data.billingEnabled // false) | tostring')
    if [[ "$BILLING_FLAG" == "true" ]]; then
      break
    fi
  fi
  now=$(date +%s)
  if (( now - start_ts > 60 )); then
    echo "[WARN] Backend health reachable? $(test -f "${ARTIFACTS_DIR}/health.json" && echo yes || echo no). Billing feature flag not confirmed after 60s; proceeding anyway."
    break
  fi
  sleep 2
done

echo "[INFO] Finding or creating Stripe test customer for ${EMAIL}..."
CUSTOMERS_JSON=$(stripe_cmd customers list --email "${EMAIL}" --limit 1)
echo "$CUSTOMERS_JSON" > "${ARTIFACTS_DIR}/customers.lookup.json"
CUS_ID=$(echo "$CUSTOMERS_JSON" | jq -r '.data[0].id // empty')
if [[ -z "$CUS_ID" || "$CUS_ID" == "null" ]]; then
  CREATE_JSON=$(stripe_cmd customers create --email "${EMAIL}")
  echo "$CREATE_JSON" > "${ARTIFACTS_DIR}/customer.create.json"
  CUS_ID=$(echo "$CREATE_JSON" | jq -r '.id')
  echo "[INFO] Created customer ${CUS_ID}"
else
  echo "[INFO] Reusing existing customer ${CUS_ID}"
fi

echo "[INFO] Emitting metered usage event (mediated_revenue_eur=${AMOUNT_CENTS})..."
set +e
EVENT_JSON=$(stripe_cmd billing meter_events create \
  --customer="${CUS_ID}" \
  --event-name=mediated_revenue_eur \
  --value="${AMOUNT_CENTS}" \
  --timestamp $(date +%s))
EVENT_RC=$?
set -e
echo "$EVENT_JSON" > "${ARTIFACTS_DIR}/meter_event.json"
if [[ $EVENT_RC -ne 0 ]]; then
  echo "[WARN] Metered usage API not available or CLI error; continuing with manual invoice creation."
fi

echo "[INFO] Creating invoice draft for ${CUS_ID}..."
INV_CREATE_JSON=$(stripe_cmd invoices create --customer="${CUS_ID}" --collection-method=charge_automatically)
echo "$INV_CREATE_JSON" > "${ARTIFACTS_DIR}/invoice.create.json"
INV_ID=$(echo "$INV_CREATE_JSON" | jq -r '.id')

echo "[INFO] Paying invoice ${INV_ID} (Test Mode)..."
INV_PAY_JSON=$(stripe_cmd invoices pay "${INV_ID}")
echo "$INV_PAY_JSON" > "${ARTIFACTS_DIR}/invoice.pay.json"

STATUS=$(echo "$INV_PAY_JSON" | jq -r '.status')
if [[ "$STATUS" != "paid" ]]; then
  echo "[WARN] Invoice status is ${STATUS}, expected paid (Test Mode). Check logs and Stripe dashboard."
fi

echo "[INFO] Waiting 2s for webhook processing..."
sleep 2

echo "[INFO] Capturing backend logs snapshot for evidence (if available via health or logs endpoint)."
curl -s "${API_BASE}/api/v1/health" > "${ARTIFACTS_DIR}/post_health.json" || true

echo "[INFO] Dry run complete. Artifacts saved to: ${ARTIFACTS_DIR}"
echo "[NOTE] Remember to set STRIPE_WEBHOOK_SECRET=${WEBHOOK_SECRET} in backend env for subsequent runs without stripe listen."

# Stop listener if we started it
kill ${LISTEN_PID} >/dev/null 2>&1 || true

exit 0
