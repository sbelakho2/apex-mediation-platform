#!/usr/bin/env bash
# Verify all billing platform imports and wiring
# Sections 7.1-7.5

set -euo pipefail

DRY_RUN=${DRY_RUN:-0}
API_BASE_URL=${API_BASE_URL:-}
API_TOKEN=${API_TOKEN:-${BILLING_API_TOKEN:-}}

echo "======================================================================"
echo "  BILLING PLATFORM WIRING VERIFICATION"
echo "  Checking all imports and path resolution"
echo "  (optional) Live API probe: ${API_BASE_URL:+enabled}${API_BASE_URL:-(disabled)}"
echo "======================================================================"
echo ""

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

errors=0
warns=0

# Check 1: Backend services exist
echo "=== Backend Services ==="
if [ -f "backend/services/billing/UsageMeteringService.ts" ]; then
    echo -e "  ${GREEN}✓${NC} UsageMeteringService.ts exists"
else
    echo -e "  ${RED}✗${NC} UsageMeteringService.ts MISSING"
    ((errors++))
fi

if [ -f "backend/src/services/invoiceService.ts" ]; then
    echo -e "  ${GREEN}✓${NC} invoiceService.ts exists"
else
    echo -e "  ${RED}✗${NC} invoiceService.ts MISSING"
    ((errors++))
fi

if [ -f "backend/src/services/reconciliationService.ts" ]; then
    echo -e "  ${GREEN}✓${NC} reconciliationService.ts exists"
else
    echo -e "  ${RED}✗${NC} reconciliationService.ts MISSING"
    ((errors++))
fi

# Check 2: Controller imports
echo ""
echo "=== Controller Imports ==="
if grep -q "from '../../services/billing/UsageMeteringService'" backend/src/controllers/billing.controller.ts; then
    echo -e "  ${GREEN}✓${NC} UsageMeteringService import path correct"
else
    echo -e "  ${RED}✗${NC} UsageMeteringService import path incorrect"
    ((errors++))
fi

if grep -q "from '../services/invoiceService'" backend/src/controllers/billing.controller.ts; then
    echo -e "  ${GREEN}✓${NC} invoiceService import path correct"
else
    echo -e "  ${RED}✗${NC} invoiceService import path incorrect"
    ((errors++))
fi

if grep -q "from '../services/reconciliationService'" backend/src/controllers/billing.controller.ts; then
    echo -e "  ${GREEN}✓${NC} reconciliationService import path correct"
else
    echo -e "  ${RED}✗${NC} reconciliationService import path incorrect"
    ((errors++))
fi

# Check 3: Routes registration
echo ""
echo "=== Routes Registration ==="
if grep -q "billingRoutes from './billing.routes'" backend/src/routes/index.ts; then
    echo -e "  ${GREEN}✓${NC} billingRoutes imported in index.ts"
else
    echo -e "  ${RED}✗${NC} billingRoutes NOT imported"
    ((errors++))
fi

if grep -q "router.use('/billing', billingRoutes)" backend/src/routes/index.ts; then
    echo -e "  ${GREEN}✓${NC} billingRoutes mounted at /billing"
else
    echo -e "  ${RED}✗${NC} billingRoutes NOT mounted"
    ((errors++))
fi

if grep -q "metaRoutes from './meta.routes'" backend/src/routes/index.ts; then
    echo -e "  ${GREEN}✓${NC} metaRoutes imported in index.ts"
else
    echo -e "  ${RED}✗${NC} metaRoutes NOT imported"
    ((errors++))
fi

if grep -q "router.use('/meta', metaRoutes)" backend/src/routes/index.ts; then
    echo -e "  ${GREEN}✓${NC} metaRoutes mounted at /meta"
else
    echo -e "  ${RED}✗${NC} metaRoutes NOT mounted"
    ((errors++))
fi

if grep -q "webhooksRoutes from './webhooks.routes'" backend/src/routes/index.ts; then
    echo -e "  ${GREEN}✓${NC} webhooksRoutes imported in index.ts"
else
    echo -e "  ${RED}✗${NC} webhooksRoutes NOT imported"
    ((errors++))
fi

if grep -q "router.use('/webhooks', webhooksRoutes)" backend/src/routes/index.ts; then
    echo -e "  ${GREEN}✓${NC} webhooksRoutes mounted at /webhooks"
else
    echo -e "  ${RED}✗${NC} webhooksRoutes NOT mounted"
    ((errors++))
fi

# Check 4: Feature flags
echo ""
echo "=== Feature Flags ==="
if grep -q "billingEnabled" backend/src/utils/featureFlags.ts; then
    echo -e "  ${GREEN}✓${NC} billingEnabled flag defined"
else
    echo -e "  ${RED}✗${NC} billingEnabled flag MISSING"
    ((errors++))
fi

if grep -q "requireFeature.*billingEnabled" backend/src/routes/billing.routes.ts; then
    echo -e "  ${GREEN}✓${NC} Billing routes protected by feature flag"
else
    echo -e "  ${YELLOW}⚠${NC} Billing routes NOT protected by feature flag"
fi

# Check 5: Service exports
echo ""
echo "=== Service Exports ==="
if grep -q "export const usageMeteringService" backend/services/billing/UsageMeteringService.ts; then
    echo -e "  ${GREEN}✓${NC} usageMeteringService exported"
else
    echo -e "  ${RED}✗${NC} usageMeteringService NOT exported"
    ((errors++))
fi

if grep -q "export const invoiceService" backend/src/services/invoiceService.ts; then
    echo -e "  ${GREEN}✓${NC} invoiceService exported"
else
    echo -e "  ${RED}✗${NC} invoiceService NOT exported"
    ((errors++))
fi

if grep -q "export const reconciliationService" backend/src/services/reconciliationService.ts; then
    echo -e "  ${GREEN}✓${NC} reconciliationService exported"
else
    echo -e "  ${RED}✗${NC} reconciliationService NOT exported"
    ((errors++))
fi

# Check 6: TypeScript types
echo ""
echo "=== TypeScript Types ==="
if [ -f "backend/src/types/express.d.ts" ]; then
    echo -e "  ${GREEN}✓${NC} express.d.ts type declarations exist"
else
    echo -e "  ${RED}✗${NC} express.d.ts type declarations MISSING"
    ((errors++))
fi

# Check 7: Cron scripts
echo ""
echo "=== Cron Scripts ==="
if [ -f "backend/scripts/hourly-usage-limiter.ts" ]; then
    echo -e "  ${GREEN}✓${NC} hourly-usage-limiter.ts exists"
else
    echo -e "  ${RED}✗${NC} hourly-usage-limiter.ts MISSING"
    ((errors++))
fi

if [ -f "backend/scripts/stripe-daily-usage-sync.ts" ]; then
    echo -e "  ${GREEN}✓${NC} stripe-daily-usage-sync.ts exists"
else
    echo -e "  ${RED}✗${NC} stripe-daily-usage-sync.ts MISSING"
    ((errors++))
fi

# Check 8: API endpoints defined
echo ""
echo "=== API Endpoints ==="
if grep -q "router.get('/usage/current'" backend/src/routes/billing.routes.ts; then
    echo -e "  ${GREEN}✓${NC} GET /billing/usage/current defined"
else
    echo -e "  ${RED}✗${NC} GET /billing/usage/current MISSING"
    ((errors++))
fi

if grep -q "router.get('/invoices'" backend/src/routes/billing.routes.ts; then
    echo -e "  ${GREEN}✓${NC} GET /billing/invoices defined"
else
    echo -e "  ${RED}✗${NC} GET /billing/invoices MISSING"
    ((errors++))
fi

if grep -q "router.get('/invoices/:id/pdf'" backend/src/routes/billing.routes.ts; then
    echo -e "  ${GREEN}✓${NC} GET /billing/invoices/:id/pdf defined"
else
    echo -e "  ${RED}✗${NC} GET /billing/invoices/:id/pdf MISSING"
    ((errors++))
fi

if grep -q "'/reconcile'" backend/src/routes/billing.routes.ts; then
    echo -e "  ${GREEN}✓${NC} POST /billing/reconcile defined"
else
    echo -e "  ${RED}✗${NC} POST /billing/reconcile MISSING"
    ((errors++))
fi

if grep -q "router.get('/features'" backend/src/routes/meta.routes.ts; then
    echo -e "  ${GREEN}✓${NC} GET /meta/features defined"
else
    echo -e "  ${RED}✗${NC} GET /meta/features MISSING"
    ((errors++))
fi

# Check 9: Console API client
echo ""
echo "=== Console API Client ==="
if [ -f "console/src/lib/billing.ts" ]; then
    echo -e "  ${GREEN}✓${NC} console/src/lib/billing.ts exists"
    if grep -q "getCurrentUsage" console/src/lib/billing.ts; then
        echo -e "  ${GREEN}✓${NC} getCurrentUsage method defined"
    fi
    if grep -q "listInvoices" console/src/lib/billing.ts; then
        echo -e "  ${GREEN}✓${NC} listInvoices method defined"
    fi
    if grep -q "getFeatureFlags" console/src/lib/billing.ts; then
        echo -e "  ${GREEN}✓${NC} getFeatureFlags method defined"
    fi
else
    echo -e "  ${RED}✗${NC} console/src/lib/billing.ts MISSING"
    ((errors++))
fi

# Summary
echo ""
echo "======================================================================"
probe_endpoint() {
    local method="$1"
    local path="$2"
    local mode="$3"
    local label="$4"
    local base="${API_BASE_URL%/}"
    local url="$base$path"
    local curl_args=(-s -o /dev/null -w "%{http_code}" -X "$method")
    local headers=()
    local ok_status=()

    case "$mode" in
        health)
            ok_status=(200 204)
            ;;
        optional)
            ok_status=(200 401)
            [[ -n "$API_TOKEN" ]] && headers=(-H "Authorization: Bearer $API_TOKEN")
            ;;
        auth)
            if [[ -z "$API_TOKEN" ]]; then
                echo -e "  ${YELLOW}⚠${NC} Skipping $label (requires API_TOKEN)"
                ((warns++))
                return
            fi
            ok_status=(200)
            headers=(-H "Authorization: Bearer $API_TOKEN")
            ;;
        *)
            ok_status=(200)
            ;;
    esac

    local status
    status=$(curl "${curl_args[@]}" "${headers[@]}" "$url" 2>/dev/null) || status=0
    local match=1
    for code in "${ok_status[@]}"; do
        if [[ "$status" == "$code" ]]; then
            match=0
            break
        fi
    done
    if [[ $match -eq 0 ]]; then
        echo -e "  ${GREEN}✓${NC} $label OK (status $status)"
    else
        echo -e "  ${RED}✗${NC} $label unexpected status $status from $url"
        ((errors++))
    fi
}

if [[ -n "$API_BASE_URL" ]]; then
  echo ""
  echo "=== Optional Live API Probes ==="
  if [[ $DRY_RUN -eq 1 ]]; then
    echo "[DRY-RUN] Would probe $API_BASE_URL/health and billing endpoints"
  else
        probe_endpoint GET /health health "Health endpoint"
        probe_endpoint GET /api/v1/billing/usage/current optional "Billing usage"
        probe_endpoint GET /api/v1/billing/invoices optional "Billing invoices"
        probe_endpoint GET /api/v1/meta/features optional "Meta features"
  fi
fi

if [ $errors -eq 0 ]; then
  if [[ $warns -gt 0 ]]; then
    echo -e "${YELLOW}  ⚠ WARNINGS: ${warns}${NC}"
  else
    echo -e "${GREEN}  ✅ ALL WIRING VERIFIED - NO ERRORS${NC}"
  fi
  echo "======================================================================"
  echo ""
  echo "API Endpoints (expected):"
  echo "  - GET  /api/v1/billing/usage/current"
  echo "  - GET  /api/v1/billing/invoices"
  echo "  - GET  /api/v1/billing/invoices/:id"
  echo "  - GET  /api/v1/billing/invoices/:id/pdf"
  echo "  - POST /api/v1/billing/reconcile"
  echo "  - GET  /api/v1/meta/features"
  echo "  - POST /api/v1/webhooks/stripe"
  exit 0
else
  echo -e "${RED}  ✗ WIRING ERRORS FOUND: ${errors}${NC}"
  echo "======================================================================"
  exit 1
fi
