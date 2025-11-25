#!/usr/bin/env sh
# VRA Canary Smoke Script (read-only)
# Accepts API_URL; if not provided, falls back to STAGING_API_URL, then localhost.

if [ -z "$API_URL" ]; then
  if [ -n "$STAGING_API_URL" ]; then
    API_URL="$STAGING_API_URL"
  else
    API_URL="http://localhost:3000"
  fi
fi
# VRA Canary Smoke Script (read-only)
#
# Validates that the canary surfaces are healthy under shadow mode:
#  - GET /api/v1/recon/overview → 200
#  - GET /api/v1/recon/deltas.csv → 200 and header present
#  - /metrics contains vra_coverage_percent and vra_variance_percent after an Overview call
#
# Inputs via env:
#   API_URL    — Base API URL (default: http://localhost:3000)
#   AUTH_TOKEN — Optional Bearer token (omit header if empty)
#   FROM       — Optional ISO timestamp for window start
#   TO         — Optional ISO timestamp for window end
#
# Exit codes:
#   0 — All checks passed
#   1 — Overview failed
#   2 — CSV failed or header missing
#   3 — Metrics missing gauges
#   4 — Usage / precondition error

set -eu

API_URL="${API_URL:-http://localhost:3000}"
AUTH_TOKEN="${AUTH_TOKEN:-}"
FROM_Q="${FROM:-}"
TO_Q="${TO:-}"

if [ -z "$API_URL" ]; then
  echo "[VRA Canary] Missing API_URL env" >&2
  exit 4
fi

header_auth()
{
  if [ -n "$AUTH_TOKEN" ]; then
    printf 'Authorization: Bearer %s' "$AUTH_TOKEN"
  else
    # empty
    printf ''
  fi
}

# Compose query string
qs()
{
  qs_=""
  if [ -n "$FROM_Q" ]; then
    if [ -n "$qs_" ]; then qs_="$qs_&"; fi
    qs_="${qs_}from=$(printf %s "$FROM_Q" | sed 's/+/%2B/g')"
  fi
  if [ -n "$TO_Q" ]; then
    if [ -n "$qs_" ]; then qs_="$qs_&"; fi
    qs_="${qs_}to=$(printf %s "$TO_Q" | sed 's/+/%2B/g')"
  fi
  printf %s "$qs_"
}

OV_PATH="/api/v1/recon/overview"
CSV_PATH="/api/v1/recon/deltas.csv"
METRICS_PATH="/metrics"
CSV_HEADER_EXPECTED='kind,amount,currency,reason_code,window_start,window_end,evidence_id,confidence'

QS="$(qs)"
OV_URL="$API_URL$OV_PATH"
CSV_URL="$API_URL$CSV_PATH"
METRICS_URL="$API_URL$METRICS_PATH"
if [ -n "$QS" ]; then
  OV_URL="$OV_URL?$QS"
  CSV_URL="$CSV_URL?$QS"
fi

AUTH_H="$(header_auth)"

echo "[VRA Canary] Overview: $OV_URL"
OV_CODE=$(curl -sS -o /dev/null -w "%{http_code}" -H "Content-Type: application/json" ${AUTH_H:+-H "$AUTH_H"} "$OV_URL")
echo "[VRA Canary] Overview HTTP $OV_CODE"
if [ "$OV_CODE" -ne 200 ]; then
  echo "[VRA Canary] FAIL: Overview returned HTTP $OV_CODE" >&2
  exit 1
fi

echo "[VRA Canary] Deltas CSV: $CSV_URL"
CSV_CODE=$(curl -sS -o /dev/null -w "%{http_code}" ${AUTH_H:+-H "$AUTH_H"} "$CSV_URL")
if [ "$CSV_CODE" -ne 200 ]; then
  echo "[VRA Canary] FAIL: Deltas CSV returned HTTP $CSV_CODE" >&2
  exit 2
fi

# Fetch one copy for header validation
CSV_BODY=$(curl -sS ${AUTH_H:+-H "$AUTH_H"} "$CSV_URL")
CSV_FIRST_LINE=$(printf "%s" "$CSV_BODY" | awk 'NR==1 {print; exit}')
echo "[VRA Canary] CSV header: $CSV_FIRST_LINE"
if [ "$CSV_FIRST_LINE" != "$CSV_HEADER_EXPECTED" ]; then
  echo "[VRA Canary] FAIL: CSV header mismatch" >&2
  echo "[VRA Canary] Expected: $CSV_HEADER_EXPECTED" >&2
  exit 2
fi

# After Overview, metrics should include gauges
echo "[VRA Canary] Metrics: $METRICS_URL"
METRICS_BODY=$(curl -sS ${AUTH_H:+-H "$AUTH_H"} "$METRICS_URL") || METRICS_BODY=""
echo "$METRICS_BODY" | grep -q '^# HELP vra_coverage_percent' || {
  echo "[VRA Canary] FAIL: vra_coverage_percent not found in /metrics" >&2
  exit 3
}
echo "$METRICS_BODY" | grep -q '^# HELP vra_variance_percent' || {
  echo "[VRA Canary] FAIL: vra_variance_percent not found in /metrics" >&2
  exit 3
}

echo "[VRA Canary] SUCCESS: overview=200 csv=200 gauges=present"
exit 0
