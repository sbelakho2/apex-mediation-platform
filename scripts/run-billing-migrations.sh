#!/usr/bin/env bash

# Billing Platform Migration Script
# Runs all billing-related database migrations (pattern-based)

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")"/.. && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
MIGRATIONS_DIR="$BACKEND_DIR/migrations"
KEYWORD_SOURCE="${BILLING_MIGRATION_KEYWORDS:-billing,stripe,invoice,payout,subscription,payment}"

print_usage(){ cat <<USAGE
Run billing migrations with optional planning and range selection.

Usage:
  $(basename "$0") [--plan] [--from NAME] [--to NAME] [--migrations-path PATH] [--keywords kw1,kw2]

Env:
  DATABASE_URL   Postgres URL (required)
USAGE
}

PLAN=0
FROM_NAME=""
TO_NAME=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --plan) PLAN=1; shift ;;
    --from) FROM_NAME="$2"; shift 2 ;;
    --to|--target) TO_NAME="$2"; shift 2 ;;
    --migrations-path) MIGRATIONS_DIR="$2"; shift 2 ;;
    --keywords) KEYWORD_SOURCE="$2"; shift 2 ;;
    -h|--help) print_usage; exit 0 ;;
    *) echo "Unknown arg: $1" >&2; print_usage; exit 2 ;;
  esac
done

echo "================================================"
echo "Billing Platform Migration Runner"
echo "================================================"
echo ""

# Check if DATABASE_URL is set
if [ -z "${DATABASE_URL:-}" ]; then
  echo "❌ ERROR: DATABASE_URL environment variable not set"
  echo "Please set DATABASE_URL before running migrations"
  echo "Example: export DATABASE_URL=postgresql://user:pass@localhost:5432/apexmediation"
  exit 1
fi

echo "✓ DATABASE_URL is set"
echo ""

cd "$BACKEND_DIR"

# Discover billing-related migrations automatically to avoid manual updates
IFS=',' read -r -a KEYWORDS <<< "$KEYWORD_SOURCE"
FILTERED_KEYWORDS=()
for kw in "${KEYWORDS[@]}"; do
  kw_trimmed="${kw// /}"
  [[ -z "$kw_trimmed" ]] && continue
  FILTERED_KEYWORDS+=("$kw_trimmed")
done
if [[ ${#FILTERED_KEYWORDS[@]} -eq 0 ]]; then
  FILTERED_KEYWORDS+=("billing")
fi
KEYWORD_REGEX=$(printf '%s|' "${FILTERED_KEYWORDS[@]}")
KEYWORD_REGEX="${KEYWORD_REGEX%|}"

mapfile -t BILLING_MIGRATIONS < <(find "$MIGRATIONS_DIR" -maxdepth 1 -type f -name '*.sql' \
  | grep -Ei "(${KEYWORD_REGEX})" \
  | LC_COLLATE=C sort)

if [[ ${#BILLING_MIGRATIONS[@]} -eq 0 ]]; then
  echo "❌ ERROR: No billing migrations found under $MIGRATIONS_DIR" >&2
  exit 1
fi

# Optional range filtering
if [[ -n "$FROM_NAME" || -n "$TO_NAME" ]]; then
  start_idx=0
  end_idx=$((${#BILLING_MIGRATIONS[@]} - 1))
  if [[ -n "$FROM_NAME" ]]; then
    for i in "${!BILLING_MIGRATIONS[@]}"; do
      base="$(basename "${BILLING_MIGRATIONS[$i]}")"
      if [[ "$base" == *"$FROM_NAME"* ]]; then start_idx=$i; break; fi
    done
  fi
  if [[ -n "$TO_NAME" ]]; then
    for i in "${!BILLING_MIGRATIONS[@]}"; do
      base="$(basename "${BILLING_MIGRATIONS[$i]}")"
      if [[ "$base" == *"$TO_NAME"* ]]; then end_idx=$i; break; fi
    done
  fi
  BILLING_MIGRATIONS=("${BILLING_MIGRATIONS[@]:$start_idx:$((end_idx-start_idx+1))}")
fi

echo "Keyword filter: ${FILTERED_KEYWORDS[*]}"

echo "Found ${#BILLING_MIGRATIONS[@]} billing migration(s):"
printf '  - %s\n' "${BILLING_MIGRATIONS[@]}"
echo ""

if [[ "$PLAN" -eq 1 ]]; then
  echo "Plan only — no migrations executed."
  exit 0
fi

for migration in "${BILLING_MIGRATIONS[@]}"; do
  fname="$(basename "$migration")"
  echo "Running $fname"
  echo "-----------------------------------------------"
  psql "$DATABASE_URL" -f "$migration"
  echo "✓ $fname completed"
  echo ""
done

echo "================================================"
echo "✓ All billing migrations completed successfully"
echo "================================================"
echo ""

# Verify tables were created
echo "Verifying tables..."
psql "$DATABASE_URL" -c "\dt billing_*"
psql "$DATABASE_URL" -c "\dt stripe_webhook_events"
echo ""

echo "✓ Billing platform database setup complete"
echo ""
echo "Next steps:"
echo "1. Set BILLING_ENABLED=true in backend .env"
echo "2. Set NEXT_PUBLIC_BILLING_ENABLED=true in console .env"
echo "3. Configure Stripe webhook endpoint"
echo "4. Restart backend and console services"
