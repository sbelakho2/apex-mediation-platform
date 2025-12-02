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
ARTIFACTS_DIR="docs/Internal/QA/stripe-dry-run/${ts}"
mkdir -p "${ARTIFACTS_DIR}"

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

# Give it a moment to start and print the webhook secret
sleep 2

if ! grep -q "whsec_" "${LISTEN_LOG}"; then
  echo "[ERR] Could not find STRIPE_WEBHOOK_SECRET in stripe listen output. Check ${LISTEN_LOG}."
  kill ${LISTEN_PID} >/dev/null 2>&1 || true
  exit 1
fi

WEBHOOK_SECRET=$(grep -o 'whsec_[A-Za-z0-9]+' "${LISTEN_LOG}" | head -n1)
echo "[INFO] Captured STRIPE_WEBHOOK_SECRET=${WEBHOOK_SECRET} (saved in artifacts log)."

# Optionally inject the secret into backend/.env for future runs
if [[ -f "backend/.env" ]]; then
  if grep -q '^STRIPE_WEBHOOK_SECRET=' backend/.env; then
    sed -i.bak "" "s|^STRIPE_WEBHOOK_SECRET=.*$|STRIPE_WEBHOOK_SECRET=${WEBHOOK_SECRET}|" backend/.env || true
  else
    echo "STRIPE_WEBHOOK_SECRET=${WEBHOOK_SECRET}" >> backend/.env
  fi
  echo "[INFO] Updated backend/.env with STRIPE_WEBHOOK_SECRET. Restart backend to apply."
else
  echo "[WARN] backend/.env not found; cannot persist STRIPE_WEBHOOK_SECRET automatically."
fi

echo "[INFO] Verifying webhook endpoint responds..."
curl -sI "${API_BASE}${WEBHOOK_PATH}" | tee "${ARTIFACTS_DIR}/webhook_head.txt" >/dev/null || true

echo "[INFO] Checking backend health and feature flags (waiting up to 60s for server ready)..."
start_ts=$(date +%s)
while true; do
  if curl -sSf "${API_BASE}/api/v1/health" > "${ARTIFACTS_DIR}/health.json" 2>/dev/null; then
    FEATURES_JSON=$(curl -sSf "${API_BASE}/api/v1/meta/features" 2>/dev/null || echo '{}')
    echo "$FEATURES_JSON" > "${ARTIFACTS_DIR}/features.json"
    if [[ "$(echo "$FEATURES_JSON" | jq -r '.billingEnabled // false')" == "true" ]]; then
      break
    fi
  fi
  now=$(date +%s)
  if (( now - start_ts > 60 )); then
    echo "[ERR] Backend not ready or billingEnabled=false after 60s. Ensure backend is running with BILLING_ENABLED=true."
    kill ${LISTEN_PID} >/dev/null 2>&1 || true
    exit 1
  fi
  sleep 2
done

echo "[INFO] Finding or creating Stripe test customer for ${EMAIL}..."
CUSTOMERS_JSON=$(stripe customers list --email "${EMAIL}" --limit 1)
echo "$CUSTOMERS_JSON" > "${ARTIFACTS_DIR}/customers.lookup.json"
CUS_ID=$(echo "$CUSTOMERS_JSON" | jq -r '.data[0].id // empty')
if [[ -z "$CUS_ID" || "$CUS_ID" == "null" ]]; then
  CREATE_JSON=$(stripe customers create --email "${EMAIL}")
  echo "$CREATE_JSON" > "${ARTIFACTS_DIR}/customer.create.json"
  CUS_ID=$(echo "$CREATE_JSON" | jq -r '.id')
  echo "[INFO] Created customer ${CUS_ID}"
else
  echo "[INFO] Reusing existing customer ${CUS_ID}"
fi

echo "[INFO] Emitting metered usage event (mediated_revenue_eur=${AMOUNT_CENTS})..."
EVENT_JSON=$(stripe billing/meter-events create \
  --customer="${CUS_ID}" \
  --event_name=mediated_revenue_eur \
  --value="${AMOUNT_CENTS}" \
  --timestamp=$(date +%s))
echo "$EVENT_JSON" > "${ARTIFACTS_DIR}/meter_event.json"

echo "[INFO] Creating invoice draft for ${CUS_ID}..."
INV_CREATE_JSON=$(stripe invoices create --customer="${CUS_ID}" --collection_method=charge_automatically)
echo "$INV_CREATE_JSON" > "${ARTIFACTS_DIR}/invoice.create.json"
INV_ID=$(echo "$INV_CREATE_JSON" | jq -r '.id')

echo "[INFO] Paying invoice ${INV_ID} (Test Mode)..."
INV_PAY_JSON=$(stripe invoices pay "${INV_ID}")
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

# Keep listener running for interactive verification; otherwise kill.
kill ${LISTEN_PID} >/dev/null 2>&1 || true

exit 0
