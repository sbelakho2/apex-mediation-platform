#!/usr/bin/env bash
set -euo pipefail

# Soak test wrapper for checklist 0.0.12.
# Runs k6 against BASE_URL and captures Prometheus/Grafana snapshots if configured.
#
# Usage:
#   BASE_URL=https://api.apexmediation.ee \
#   VUS=5 DURATION=60m SLEEP=0.2 \
#   PROM_URL=http://localhost:9090 \
#   GRAFANA_URL=https://grafana.example.com GRAFANA_API_TOKEN=glsa_xxx DASHBOARD_UID=abcd PANEL_IDS=2,4,6 \
#   ./scripts/ops/run_soak.sh 2025-12-08

DATE_TAG="${1:-$(date +%F)}"
EVIDENCE_DIR="evidence-${DATE_TAG}/soak"
mkdir -p "${EVIDENCE_DIR}"

if ! command -v k6 >/dev/null 2>&1; then
  echo "[err] k6 not found in PATH. Install k6 or run this on a runner with k6 available." >&2
  exit 2
fi

echo "[run] k6 soak BASE_URL=${BASE_URL:-unset} VUS=${VUS:-5} DURATION=${DURATION:-60m} SLEEP=${SLEEP:-0.2}"
set +e
BASE_URL="${BASE_URL:-}" VUS="${VUS:-}" DURATION="${DURATION:-}" SLEEP="${SLEEP:-}" \
  k6 run scripts/ops/k6/load.js | tee "${EVIDENCE_DIR}/k6-report.txt"
K6_STATUS=$?
set -e
if [ $K6_STATUS -ne 0 ]; then
  echo "[warn] k6 exited with status $K6_STATUS (check ${EVIDENCE_DIR}/k6-report.txt)"
fi

# Optional metrics snapshots
if [ -n "${PROM_URL:-}" ] || { [ -n "${GRAFANA_URL:-}" ] && [ -n "${GRAFANA_API_TOKEN:-}" ] && [ -n "${DASHBOARD_UID:-}" ] && [ -n "${PANEL_IDS:-}" ]; }; then
  echo "[run] Capturing metrics snapshots"
  DATE_TAG="${DATE_TAG}" PROM_URL="${PROM_URL:-}" GRAFANA_URL="${GRAFANA_URL:-}" GRAFANA_API_TOKEN="${GRAFANA_API_TOKEN:-}" DASHBOARD_UID="${DASHBOARD_UID:-}" PANEL_IDS="${PANEL_IDS:-}" \
    bash scripts/ops/metrics_snapshot.sh "${DATE_TAG}"
else
  echo "[info] Metrics snapshots not configured; set PROM_URL or Grafana vars to enable."
fi

echo "[done] Soak evidence at ${EVIDENCE_DIR}"
