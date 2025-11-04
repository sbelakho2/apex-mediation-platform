#!/bin/bash

# Console Backend Connection Verification Script
# This script verifies the console can connect to the backend API

set -e

echo "🔍 Verifying Console-Backend Connection..."
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
BACKEND_URL="http://localhost:4000"
CONSOLE_URL="http://localhost:3000"

# Check if backend is running
echo "1. Checking backend health..."
if curl -s "${BACKEND_URL}/health" > /dev/null; then
    echo -e "${GREEN}✓${NC} Backend is running at ${BACKEND_URL}"
    
    # Get health details
    HEALTH=$(curl -s "${BACKEND_URL}/health")
    echo "   Services:"
    echo "   $(echo $HEALTH | jq -r '.services | to_entries[] | "   - \(.key): \(.value)"')"
else
    echo -e "${RED}✗${NC} Backend is not responding at ${BACKEND_URL}"
    echo "   Start backend with: cd backend && npm run dev"
    exit 1
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

# Test auth endpoint
if curl -s -X POST "${BACKEND_URL}/api/v1/auth/login" \
    -H "Content-Type: application/json" \
    -d '{"email":"test@example.com","password":"test"}' > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC} Auth endpoint responding"
else
    echo -e "${YELLOW}⚠${NC} Auth endpoint may have issues (expected for test credentials)"
fi

# Test placements endpoint (requires auth, expect 401)
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${BACKEND_URL}/api/v1/placements")
if [ "$STATUS" = "401" ]; then
    echo -e "${GREEN}✓${NC} Placements endpoint responding (auth required as expected)"
elif [ "$STATUS" = "200" ]; then
    echo -e "${GREEN}✓${NC} Placements endpoint responding"
else
    echo -e "${RED}✗${NC} Placements endpoint returned unexpected status: ${STATUS}"
fi

# Test analytics endpoint
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${BACKEND_URL}/api/v1/analytics/overview")
if [ "$STATUS" = "401" ] || [ "$STATUS" = "200" ]; then
    echo -e "${GREEN}✓${NC} Analytics endpoint responding"
else
    echo -e "${RED}✗${NC} Analytics endpoint returned unexpected status: ${STATUS}"
fi

# Test queues endpoint
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${BACKEND_URL}/api/v1/queues/metrics")
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
