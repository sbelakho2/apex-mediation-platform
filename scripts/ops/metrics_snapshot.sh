#!/usr/bin/env bash
set -euo pipefail

# Export Prometheus/Grafana snapshots for soak evidence (0.0.12)
# Usage:
#   PROM_URL=http://localhost:9090 \
#   GRAFANA_URL=https://grafana.example.com \
#   GRAFANA_API_TOKEN=glsa_xxx \
#   DASHBOARD_UID=abcd1234 \
#   PANEL_IDS=2,4,6 \
#   ./scripts/ops/metrics_snapshot.sh 2025-12-08

DATE_TAG="${1:-$(date +%F)}"
EVIDENCE_DIR="evidence-${DATE_TAG}/soak"
mkdir -p "${EVIDENCE_DIR}"

PROM_URL="${PROM_URL:-}"
GRAFANA_URL="${GRAFANA_URL:-}"
GRAFANA_API_TOKEN="${GRAFANA_API_TOKEN:-}"
DASHBOARD_UID="${DASHBOARD_UID:-}"
PANEL_IDS="${PANEL_IDS:-}"

q() { local Q="$1"; echo "${PROM_URL}/api/v1/query?query=$(python - <<PY
import urllib.parse as u, sys
print(u.quote(sys.argv[1]))
PY
"$Q")"; }

if [ -n "$PROM_URL" ]; then
  echo "[run] Querying Prometheus at $PROM_URL"
  curl -s "$(q 'histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket[5m])) by (le))')" \
    | tee "${EVIDENCE_DIR}/prom_p95_latency.json" >/dev/null || true
  curl -s "$(q 'sum(rate(http_requests_total{status=~"5.."}[5m])) / sum(rate(http_requests_total[5m]))')" \
    | tee "${EVIDENCE_DIR}/prom_error_rate.json" >/dev/null || true
  curl -s "$(q 'sum(rate(process_cpu_seconds_total[5m]))')" \
    | tee "${EVIDENCE_DIR}/prom_cpu.json" >/dev/null || true
  curl -s "$(q 'sum(process_resident_memory_bytes)')" \
    | tee "${EVIDENCE_DIR}/prom_memory.json" >/dev/null || true
else
  echo "[skip] PROM_URL not set; skipping Prometheus snapshot"
fi

if [ -n "$GRAFANA_URL" ] && [ -n "$GRAFANA_API_TOKEN" ] && [ -n "$DASHBOARD_UID" ] && [ -n "$PANEL_IDS" ]; then
  echo "[run] Exporting Grafana panels from $GRAFANA_URL for dashboard $DASHBOARD_UID"
  IFS=',' read -r -a panels <<< "$PANEL_IDS"
  for id in "${panels[@]}"; do
    outfile="${EVIDENCE_DIR}/grafana-panel-${id}.png"
    echo "[run] Panel ${id} -> ${outfile}"
    curl -s -H "Authorization: Bearer ${GRAFANA_API_TOKEN}" \
      "${GRAFANA_URL%/}/render/d-solo/${DASHBOARD_UID}?orgId=1&panelId=${id}&from=now-1h&to=now&width=1280&height=640&tz=UTC" \
      --output "$outfile" || echo "[warn] Failed to export panel ${id}"
  done
else
  echo "[skip] Grafana export not configured; set GRAFANA_URL, GRAFANA_API_TOKEN, DASHBOARD_UID, and PANEL_IDS"
fi

echo "[done] Metrics snapshots saved under ${EVIDENCE_DIR}"
