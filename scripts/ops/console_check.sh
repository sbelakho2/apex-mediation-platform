#!/usr/bin/env bash
set -euo pipefail

# Quick check for staging Console presence on the droplet
# Usage: ./scripts/ops/console_check.sh

echo "[check] docker compose services (looking for console/ui)"
if command -v docker >/dev/null 2>&1; then
  docker compose ps || true
else
  echo "[warn] docker not found in PATH"
fi

echo "[check] Nginx config snippets for console hostnames"
NGINX_DIR="infrastructure/nginx"
if [ -d "$NGINX_DIR" ]; then
  grep -RinE "server_name.*console" "$NGINX_DIR" || echo "[info] No console server_name found in $NGINX_DIR"
else
  echo "[warn] $NGINX_DIR not found"
fi

echo "[info] If console is missing, bring up stack via docker compose prod files. See Production Readiness checklist DO plan."
