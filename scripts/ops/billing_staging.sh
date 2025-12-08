#!/usr/bin/env bash
set -euo pipefail

# Billing & Stripe staging helper (0.0.9)
# Generates synthetic usage for tiers, runs aggregation, and collects logs into evidence folder.
# Usage:
#   ./scripts/ops/billing_staging.sh 2025-12-08

DATE_TAG="${1:-$(date +%F)}"
EVIDENCE_DIR="evidence-${DATE_TAG}/billing"
mkdir -p "${EVIDENCE_DIR}"

ROOT_DIR=$(cd "$(dirname "$0")/../.." && pwd)
pushd "${ROOT_DIR}/backend" >/dev/null

echo "[run] Generating synthetic usage for Starter/Growth/Scale on ${DATE_TAG}"
set +e
npm run sandbox:revenue:starter -- --date "${DATE_TAG}" | tee "${ROOT_DIR}/${EVIDENCE_DIR}/usage-starter.log"
npm run sandbox:revenue:growth  -- --date "${DATE_TAG}" | tee "${ROOT_DIR}/${EVIDENCE_DIR}/usage-growth.log"
npm run sandbox:revenue:scale   -- --date "${DATE_TAG}" | tee "${ROOT_DIR}/${EVIDENCE_DIR}/usage-scale.log"
set -e

if [ -f "dist/scripts/aggregateUsage.js" ]; then
  echo "[run] Running usage aggregation"
  node dist/scripts/aggregateUsage.js | tee "${ROOT_DIR}/${EVIDENCE_DIR}/aggregate.log"
else
  echo "[warn] aggregateUsage.js not found; ensure backend is built or script path updated" | tee -a "${ROOT_DIR}/${EVIDENCE_DIR}/aggregate.log"
fi

echo "[run] Collecting Stripe webhook logs if present"
cp -v logs/stripe-*.log "${ROOT_DIR}/${EVIDENCE_DIR}/" 2>/dev/null || echo "[info] No stripe logs to copy"

# Optional: Use Stripe CLI to capture recent invoices in test mode if available
if command -v stripe >/dev/null 2>&1; then
  echo "[run] Capturing Stripe invoices (latest 10) via Stripe CLI"
  set +e
  stripe invoices list -l 10 --status open   > "${ROOT_DIR}/${EVIDENCE_DIR}/stripe-invoices-open.json" 2>/dev/null
  stripe invoices list -l 10 --status paid   > "${ROOT_DIR}/${EVIDENCE_DIR}/stripe-invoices-paid.json" 2>/dev/null
  stripe events list  -l 25                  > "${ROOT_DIR}/${EVIDENCE_DIR}/stripe-events.json" 2>/dev/null
  set -e
else
  echo "[skip] Stripe CLI not installed; skipping invoice/event capture"
fi

# Optional: Extract billing-related emails from Resend (requires RESEND_API_KEY in env)
if [ -n "${RESEND_API_KEY:-}" ]; then
  echo "[run] Fetching latest emails from Resend for billing previews"
  curl -s -H "Authorization: Bearer ${RESEND_API_KEY}" \
    -H 'Content-Type: application/json' \
    "https://api.resend.com/emails?limit=25" \
    | tee "${ROOT_DIR}/${EVIDENCE_DIR}/resend-latest.json" >/dev/null || true
else
  echo "[skip] RESEND_API_KEY not set; skipping email preview capture"
fi

popd >/dev/null
echo "[done] Billing staging helper complete. Evidence at ${EVIDENCE_DIR}"
