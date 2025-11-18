#!/usr/bin/env bash
# Billing Platform Test Validation Report (Sections 7.1-7.5)

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")"/.. && pwd)"
LIST_ONLY=0
UPDATE_MANIFEST=""

print_usage() {
  cat <<USAGE
Validate Billing Platform test wiring and documentation references.

Usage:
  $(basename "$0") [--root PATH] [--list] [--update FILE]

Options:
  --root PATH   Override repository root (default: auto-detected)
  --list        Print discovered billing-related test files and exit
  --update FILE Write discovered billing-related test files to FILE (JSON)
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --root)
      ROOT_DIR="$2"
      shift 2
      ;;
    --list)
      LIST_ONLY=1
      shift
      ;;
    --update)
      UPDATE_MANIFEST="$2"
      shift 2
      ;;
    -h|--help)
      print_usage
      exit 0
      ;;
    *)
      echo "Unknown arg: $1" >&2
      print_usage
      exit 2
      ;;
  esac
done

cd "$ROOT_DIR"

BLUE='\033[0;34m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

discover_tests() {
  local pattern='(billing|invoice|payout|subscription)'
  if command -v git >/dev/null 2>&1; then
    git ls-files \
      | grep -Ei "$pattern" \
      | grep -E '\\.(ts|tsx|js|mjs|cjs|sh|py)$' \
      | sort -u
  else
    find . -type f \
      \( -name '*billing*' -o -name '*invoice*' -o -name '*payout*' -o -name '*subscription*' \) \
      \( -name '*.ts' -o -name '*.tsx' -o -name '*.js' -o -name '*.mjs' -o -name '*.cjs' -o -name '*.sh' -o -name '*.py' \) \
      | sed 's|^\./||' \
      | sort -u
  fi
}

mapfile -t BILLING_TEST_FILES < <(discover_tests)

if [[ -n "$UPDATE_MANIFEST" ]]; then
  {
    printf "[\n"
    for idx in "${!BILLING_TEST_FILES[@]}"; do
      file="${BILLING_TEST_FILES[$idx]}"
      printf "  \"%s\"" "$file"
      if [[ $idx -lt $((${#BILLING_TEST_FILES[@]} - 1)) ]]; then
        printf ","
      fi
      printf "\n"
    done
    printf "]\n"
  } >"$UPDATE_MANIFEST"
  echo "Updated manifest: $UPDATE_MANIFEST"
fi

if [[ $LIST_ONLY -eq 1 ]]; then
  printf '%s\n' "${BILLING_TEST_FILES[@]}"
  exit 0
fi

sections=(
  "7.1|Console Navigation & Feature Flags|console/src/components/Breadcrumbs.tsx,console/src/lib/hooks/useQueryState.ts,console/src/lib/hooks/useQueryParamsState.ts,backend/src/routes/meta.routes.ts"
  "7.2|Billing Backend APIs|backend/src/openapi/billing.yaml,backend/src/routes/billing.routes.ts,backend/src/controllers/billing.controller.ts"
  "7.3|Usage Metering & Limits|backend/scripts/hourly-usage-limiter.ts,backend/scripts/stripe-daily-usage-sync.ts,backend/analytics/queries/usage_summary.sql"
  "7.4|Invoicing & Reconciliation|backend/src/services/invoiceService.ts,backend/src/services/reconciliationService.ts,backend/src/routes/webhooks.routes.ts"
  "7.5|Console Billing UI|console/src/app/billing/usage/page.tsx,console/src/app/billing/invoices/page.tsx,console/src/app/billing/settings/page.tsx,console/src/app/billing/usage/page.a11y.test.tsx,console/src/app/billing/invoices/page.a11y.test.tsx,console/src/app/billing/invoices/[id]/page.a11y.test.tsx,console/src/app/billing/settings/page.a11y.test.tsx,console/src/app/billing/invoices/page.test.tsx,console/src/lib/__tests__/billing.test.ts,console/src/i18n/index.ts,console/src/i18n/messages/en.json"
)

SECTION_RESULTS=()

print_section() {
  local id="$1"
  local title="$2"
  local files_csv="$3"
  echo ""
  echo -e "${BLUE}=== Section ${id}: ${title} ===${NC}"
  echo ""
  IFS=',' read -r -a paths <<<"$files_csv"
  local total=0
  local ok=0
  for path in "${paths[@]}"; do
    [[ -z "$path" ]] && continue
    ((total++))
    if [[ -f "$path" ]]; then
      ((ok++))
      local lines
      lines=$(wc -l <"$path" 2>/dev/null || echo "?")
      echo -e "  ${GREEN}[OK]${NC} $path (${lines} lines)"
    else
      echo -e "  ${RED}[MISS]${NC} $path"
    fi
  done
  SECTION_RESULTS+=("$id|$title|$ok|$total")
}

for entry in "${sections[@]}"; do
  IFS='|' read -r sec_id sec_title sec_files <<<"$entry"
  print_section "$sec_id" "$sec_title" "$sec_files"
done

echo ""
echo "======================================================================"
echo -e "${GREEN}  VALIDATION SUMMARY${NC}"
echo "======================================================================"
echo ""

for summary in "${SECTION_RESULTS[@]}"; do
  IFS='|' read -r sec_id sec_title ok total <<<"$summary"
  icon="[WARN]"
  icon_color="${YELLOW}"
  if [[ "$ok" -eq "$total" ]]; then
    icon="[OK]"
    icon_color="${GREEN}"
  fi
  echo -e "Section ${sec_id} (${sec_title}): ${icon_color}${icon}${NC} ${ok}/${total} files present"
done

echo ""
echo "Billing test discovery"
echo "-----------------------"
echo "Tracked files: ${#BILLING_TEST_FILES[@]}"

if [[ ${#BILLING_TEST_FILES[@]} -gt 0 ]]; then
  total_lines=0
  missing_paths=0
  for file in "${BILLING_TEST_FILES[@]}"; do
    if [[ -f "$file" ]]; then
      lines=$(wc -l <"$file" 2>/dev/null || echo 0)
      total_lines=$((total_lines + lines))
    else
      ((missing_paths++))
    fi
  done
  echo "Total lines of code (approx): $total_lines"
  if [[ $missing_paths -gt 0 ]]; then
    echo "Missing paths (rerun after syncing repo): $missing_paths"
  fi
  echo "Use --list to print every tracked path or --update <file> to snapshot them."
else
  echo "No billing-related files found via discovery pattern."
fi

echo ""
echo "======================================================================"
echo -e "${GREEN}  [OK] Billing platform validation completed${NC}"
echo "======================================================================"
