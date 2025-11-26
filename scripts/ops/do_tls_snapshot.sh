#!/usr/bin/env bash
set -euo pipefail

# do_tls_snapshot.sh — Collect HTTPS/TLS evidence from a public host
# Usage: bash scripts/ops/do_tls_snapshot.sh api.apexmediation.ee
# Optional env:
#   TARGET_PATH: override evidence dir (default: docs/Internal/Deployment/do-readiness-YYYY-MM-DD)

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <host>" 1>&2
  exit 2
fi

HOST="$1"
DATE_DIR="do-readiness-$(date +%F)"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
EVID_DIR="${TARGET_PATH:-$ROOT_DIR/docs/Internal/Deployment/${DATE_DIR}}"

mkdir -p "$EVID_DIR"

echo "[INFO] Writing evidence to: $EVID_DIR" | tee -a "$EVID_DIR/summary.txt"

echo "[STEP] HTTP→HTTPS redirect headers (http://$HOST)" | tee "$EVID_DIR/verify-redirects.txt"
curl -Ik "http://$HOST/health" | tee -a "$EVID_DIR/verify-redirects.txt" || true

echo "[STEP] HTTPS headers (https://$HOST)" | tee "$EVID_DIR/verify-tls.txt"
curl -Ik --http2-prior-knowledge "https://$HOST/health" | tee -a "$EVID_DIR/verify-tls.txt" || true

echo "[STEP] Server certificate (openssl s_client)" | tee -a "$EVID_DIR/verify-tls.txt"
echo | openssl s_client -servername "$HOST" -connect "$HOST:443" 2>/dev/null | openssl x509 -noout -issuer -subject -dates -fingerprint -sha256 | tee -a "$EVID_DIR/verify-tls.txt" || true

echo "[STEP] Root path headers (Strict-Transport-Security expected after gate)" | tee "$EVID_DIR/verify-hsts.txt"
curl -Is "https://$HOST/" | tee -a "$EVID_DIR/verify-hsts.txt" || true

echo "[DONE] TLS snapshot complete: $EVID_DIR" 1>&2
