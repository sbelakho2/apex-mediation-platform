#!/usr/bin/env bash

# Console Backend Connection Verification Script
# Verifies the console can connect to the backend API.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")"/.. && pwd)"
cd "$ROOT_DIR"

DRY_RUN=0
TIMEOUT=10
CREDENTIALS_FILE="${CONSOLE_CREDENTIALS_FILE:-}"

print_usage() {
  cat <<USAGE
Verify Console ↔ Backend connectivity and configuration.

Usage:
  $(basename "$0") [--dry-run] [--timeout SEC] [--credentials FILE]

Environment:
  BACKEND_URL           Backend base (default http://localhost:4000)
  CONSOLE_URL           Console base (default http://localhost:3000)
  CONSOLE_TOKEN         Optional bearer token to probe authed endpoints [sensitive]
  CONSOLE_ADMIN_EMAIL   Optional email for login smoke (fallback when token absent) [sensitive]
  CONSOLE_ADMIN_PASSWORD Optional password for login smoke [sensitive]
  CONSOLE_CREDENTIALS_FILE Path to env-style file containing CONSOLE_ADMIN_EMAIL/PASSWORD

Exit codes:
  0 OK; 10 auth failed; 11 network/backend down; 2 usage error.
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN=1; shift ;;
    --timeout) TIMEOUT="${2:-10}"; shift 2 ;;
    --credentials) CREDENTIALS_FILE="$2"; shift 2 ;;
    -h|--help) print_usage; exit 0 ;;
    *) echo "Unknown arg: $1" >&2; print_usage; exit 2 ;;
  esac
done

if [[ -n "$CREDENTIALS_FILE" ]]; then
  if [[ -f "$CREDENTIALS_FILE" ]]; then
    set -a
    # shellcheck disable=SC1090
    source "$CREDENTIALS_FILE"
    set +a
    echo "Loaded console credentials from $CREDENTIALS_FILE"
  else
    echo "⚠️  Credential file not found: $CREDENTIALS_FILE" >&2
  fi
fi

echo "🔍 Verifying Console-Backend Connection..."
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
BACKEND_URL="${BACKEND_URL:-http://localhost:4000}"
CONSOLE_URL="${CONSOLE_URL:-http://localhost:3000}"
LOGIN_EMAIL="${CONSOLE_ADMIN_EMAIL:-}"
LOGIN_PASSWORD="${CONSOLE_ADMIN_PASSWORD:-}"
TOKEN="${CONSOLE_TOKEN:-}"

# Check if backend is running
if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "[DRY-RUN] Would GET $BACKEND_URL/health"
  echo "[DRY-RUN] Would read console/.env.local and check NEXT_PUBLIC_*"
  echo "[DRY-RUN] Would probe selected endpoints with token=${TOKEN:+******}"
  exit 0
fi

echo "1. Checking backend health..."
if curl -s --max-time "$TIMEOUT" "${BACKEND_URL}/health" > /dev/null; then
    echo -e "${GREEN}✓${NC} Backend is running at ${BACKEND_URL}"
    
    # Get health details
    HEALTH=$(curl -s --max-time "$TIMEOUT" "${BACKEND_URL}/health")
    echo "   Services:"
    echo "   $(echo $HEALTH | jq -r '.services | to_entries[] | "   - \(.key): \(.value)"')"
else
    echo -e "${RED}✗${NC} Backend is not responding at ${BACKEND_URL}"
    echo "   Start backend with: cd backend && npm run dev"
    exit 11
fi
echo ""

# Check console environment configuration
echo "2. Checking console configuration..."
if [ ! -f "console/.env.local" ]; then
    echo -e "${RED}✗${NC} console/.env.local not found"
    echo "   Copy console/.env.local.example to console/.env.local"
    exit 1
fi

# Check if mock API is disabled
MOCK_API=$(grep "NEXT_PUBLIC_USE_MOCK_API" console/.env.local | cut -d= -f2)
if [ "$MOCK_API" = "false" ]; then
    echo -e "${GREEN}✓${NC} Mock API is disabled (using real backend)"
else
    echo -e "${YELLOW}⚠${NC} Mock API is enabled (set NEXT_PUBLIC_USE_MOCK_API=false to use real backend)"
fi

# Check API URL
API_URL=$(grep "NEXT_PUBLIC_API_URL" console/.env.local | cut -d= -f2)
if [ "$API_URL" = "http://localhost:4000/api/v1" ]; then
    echo -e "${GREEN}✓${NC} API URL is correctly configured: ${API_URL}"
else
    echo -e "${YELLOW}⚠${NC} API URL may be incorrect: ${API_URL}"
    echo "   Expected: http://localhost:4000/api/v1"
fi
echo ""

# Check if console dependencies are installed
echo "3. Checking console dependencies..."
if [ -d "console/node_modules" ]; then
    echo -e "${GREEN}✓${NC} Console dependencies installed"
else
    echo -e "${RED}✗${NC} Console dependencies not installed"
    echo "   Run: cd console && npm install"
    exit 1
fi
echo ""

# Test API endpoints
echo "4. Testing API endpoints..."

# Prefer bearer token if provided
AUTH_HEADER=()
if [[ -n "$TOKEN" ]]; then
  AUTH_HEADER=(-H "Authorization: Bearer $TOKEN")
  echo "Using bearer token: ******"
elif [[ -n "$LOGIN_EMAIL" && -n "$LOGIN_PASSWORD" ]]; then
  echo "No token provided; attempting login with provided email/password (not printed)"
  LOGIN_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "${BACKEND_URL}/api/v1/auth/login" \
        -H "Content-Type: application/json" \
        -d "{\"email\":\"$LOGIN_EMAIL\",\"password\":\"$LOGIN_PASSWORD\"}")
  if [[ "$LOGIN_STATUS" != "200" && "$LOGIN_STATUS" != "204" ]]; then
    echo -e "${RED}✗${NC} Auth endpoint login failed (status $LOGIN_STATUS)"; exit 10
  else
    echo -e "${GREEN}✓${NC} Auth endpoint responded using provided credentials"
  fi
else
  echo -e "${YELLOW}⚠${NC} Skipping auth login test (set CONSOLE_TOKEN or CONSOLE_ADMIN_EMAIL/CONSOLE_ADMIN_PASSWORD)"
fi

# Test placements endpoint (requires auth, expect 401)
STATUS=$(curl -s "${AUTH_HEADER[@]}" -o /dev/null -w "%{http_code}" "${BACKEND_URL}/api/v1/placements")
if [ "$STATUS" = "401" ]; then
    echo -e "${GREEN}✓${NC} Placements endpoint responding (auth required as expected)"
elif [ "$STATUS" = "200" ]; then
    echo -e "${GREEN}✓${NC} Placements endpoint responding"
else
    echo -e "${RED}✗${NC} Placements endpoint returned unexpected status: ${STATUS}"
fi

# Test analytics endpoint
STATUS=$(curl -s "${AUTH_HEADER[@]}" -o /dev/null -w "%{http_code}" "${BACKEND_URL}/api/v1/analytics/overview")
if [ "$STATUS" = "401" ] || [ "$STATUS" = "200" ]; then
    echo -e "${GREEN}✓${NC} Analytics endpoint responding"
else
    echo -e "${RED}✗${NC} Analytics endpoint returned unexpected status: ${STATUS}"
fi

# Test queues endpoint
STATUS=$(curl -s "${AUTH_HEADER[@]}" -o /dev/null -w "%{http_code}" "${BACKEND_URL}/api/v1/queues/metrics")
if [ "$STATUS" = "401" ] || [ "$STATUS" = "200" ]; then
    echo -e "${GREEN}✓${NC} Queues endpoint responding"
else
    echo -e "${RED}✗${NC} Queues endpoint returned unexpected status: ${STATUS}"
fi
echo ""

# Check if console is running
echo "5. Checking console status..."
if curl -s "${CONSOLE_URL}" > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC} Console is running at ${CONSOLE_URL}"
else
    echo -e "${YELLOW}⚠${NC} Console is not running"
    echo "   Start console with: cd console && npm run dev"
fi
echo ""

# Summary
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${GREEN}✓${NC} Backend-Console connection verified!"
echo ""
echo "Next steps:"
echo "1. Ensure backend is running: cd backend && npm run dev"
echo "2. Ensure console is running: cd console && npm run dev"
echo "3. Open browser to ${CONSOLE_URL}"
echo "4. Login and verify data loads from backend"
echo ""
echo "For troubleshooting, see: console/BACKEND_INTEGRATION.md"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
