#!/bin/bash

# Billing Platform Migration Script
# Runs database migrations for billing infrastructure (017, 018)

set -e

echo "================================================"
echo "Billing Platform Migration Runner"
echo "================================================"
echo ""

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
  echo "❌ ERROR: DATABASE_URL environment variable not set"
  echo "Please set DATABASE_URL before running migrations"
  echo "Example: export DATABASE_URL=postgresql://user:pass@localhost:5432/apexmediation"
  exit 1
fi

echo "✓ DATABASE_URL is set"
echo ""

# Change to backend directory
cd "$(dirname "$0")/../backend"

echo "Running migration 017: Billing Audit and Idempotency"
echo "-----------------------------------------------"
psql "$DATABASE_URL" -f migrations/017_billing_audit_and_idempotency.sql
echo "✓ Migration 017 completed"
echo ""

echo "Running migration 018: Stripe Webhook Events"
echo "-----------------------------------------------"
psql "$DATABASE_URL" -f migrations/018_stripe_webhook_events.sql
echo "✓ Migration 018 completed"
echo ""

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
