# Billing Module

## Overview

The billing module provides usage tracking, invoice management, and reconciliation features for the ApexMediation console.

## Features

### 1. Usage Tracking (`/billing/usage`)
- Real-time usage metrics (impressions, API calls, data transfer)
- Visual progress bars showing plan limit consumption
- Overage detection and cost calculation
- Support for multiple plan types (indie, studio, enterprise)

### 2. Invoice Management (`/billing/invoices`)
- Paginated invoice list with filtering by status
- Individual invoice detail pages
- PDF invoice download
- Line item breakdown
- Payment status tracking

### 3. Feature Flags
- Billing features can be enabled/disabled via `NEXT_PUBLIC_BILLING_ENABLED` environment variable
- Navigation menu automatically shows/hides billing link based on flag
- Backend feature flags exposed via `/api/v1/meta/features` endpoint

### 4. Reconciliation (Admin Only)
- Compare internal usage records with Stripe billing data
- Identify discrepancies with configurable tolerance thresholds
- Idempotent reconciliation operations
- Audit trail for all reconciliation activities

## API Endpoints

### Usage
- `GET /api/v1/billing/usage/current` - Get current period usage and overages

### Invoices
- `GET /api/v1/billing/invoices` - List invoices with pagination and filters
- `GET /api/v1/billing/invoices/:id` - Get single invoice
- `GET /api/v1/billing/invoices/:id/pdf` - Download invoice PDF

### Reconciliation
- `POST /api/v1/billing/reconcile` - Trigger reconciliation (admin only)

### Feature Flags
- `GET /api/v1/meta/features` - Get feature flags (public)

## Environment Variables

### Backend
```bash
BILLING_ENABLED=true
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

### Console
```bash
NEXT_PUBLIC_BILLING_ENABLED=true
NEXT_PUBLIC_API_URL=http://localhost:4000/api/v1
```

## Architecture

### Frontend (`console/src`)
```
app/billing/
  layout.tsx              # Sub-navigation for billing pages
  page.tsx                # Root redirect to usage page
  usage/
    page.tsx              # Usage tracking page
  invoices/
    page.tsx              # Invoice list page
    [id]/
      page.tsx            # Invoice detail page

lib/
  billing.ts              # Billing API client
  __tests__/
    billing.test.ts       # API client tests

components/
  Navigation.tsx          # Updated with billing link
```

### Backend (`backend/src`)
```
routes/
  billing.routes.ts       # Billing API routes
  webhooks.routes.ts      # Stripe webhook handler
  meta.routes.ts          # Feature flag endpoint

controllers/
  billing.controller.ts   # Billing business logic

services/
  billing/
    UsageMeteringService.ts  # Usage tracking
  invoiceService.ts          # Invoice management
  reconciliationService.ts   # Reconciliation logic

utils/
  featureFlags.ts         # Feature flag utilities
```

## Database Schema

### Tables Created
- `billing_audit` - Audit trail for all billing operations
- `billing_idempotency` - Idempotency key tracking for reconciliation
- `usage_alerts` - Usage threshold alerts
- `stripe_webhook_events` - Webhook event deduplication
- `events` - Async event queue

### Existing Tables Used
- `subscriptions` - Customer subscription details
- `usage_records` - Usage tracking data
- `invoices` - Invoice records

## Usage Examples

### Fetch Current Usage
```typescript
import { getCurrentUsage } from '@/lib/billing'

const usage = await getCurrentUsage()
console.log(usage.current_period.impressions)
console.log(usage.overages.total_overage_cost)
```

### List Invoices
```typescript
import { listInvoices } from '@/lib/billing'

const { invoices, pagination } = await listInvoices({
  page: 1,
  limit: 20,
  status: 'paid',
})
```

### Download Invoice PDF
```typescript
import { downloadInvoicePDF } from '@/lib/billing'

const blobUrl = await downloadInvoicePDF('inv_123')
window.open(blobUrl, '_blank')
```

### Trigger Reconciliation (Admin)
```typescript
import { reconcileBilling } from '@/lib/billing'

const result = await reconcileBilling('idem_key_123')
console.log(result.discrepancies)
```

## Testing

### Run Unit Tests
```bash
cd console
npm test -- billing.test.ts
```

### Run Backend Tests
```bash
cd backend
npm test -- billing.controller.test.ts
```

### Integration Tests
```bash
cd backend
npm test -- integration/billing.test.ts
```

## Stripe Webhook Configuration

1. Create webhook endpoint in Stripe Dashboard
2. Point to: `https://yourdomain.com/api/v1/webhooks/stripe`
3. Select events:
   - `invoice.created`
   - `invoice.finalized`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
   - `charge.refunded`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
4. Copy webhook signing secret to `STRIPE_WEBHOOK_SECRET` env var

## Security

- All billing endpoints require authentication via JWT cookies
- Reconciliation endpoint requires admin role
- Webhook signature verification prevents unauthorized events
- Idempotency keys prevent duplicate processing
- CSRF tokens required for mutating operations
- ETag caching for PDF downloads reduces bandwidth

## Performance

- Usage data cached for 1 hour
- Invoice PDFs cached with ETag headers (304 Not Modified support)
- Pagination limits: 1-100 invoices per page
- Database indexes on: customer_id, status, created_at, stripe_event_id

## Monitoring

- All billing operations logged to `billing_audit` table
- Webhook events tracked in `stripe_webhook_events`
- Reconciliation discrepancies logged with alert thresholds
- Usage alerts emitted to `usage_alerts` table

## Troubleshooting

### Billing features not appearing
- Check `NEXT_PUBLIC_BILLING_ENABLED` is set to `true`
- Verify backend `BILLING_ENABLED` environment variable
- Check `/api/v1/meta/features` returns `billingEnabled: true`

### Usage data not updating
- Verify ClickHouse connection for real-time analytics
- Check `usage_records` table for recent entries
- Review cron job logs for usage sync tasks

### Invoices not syncing from Stripe
- Verify `STRIPE_SECRET_KEY` is correct
- Check webhook events are being received
- Review `stripe_webhook_events` table for failed events
- Check webhook signature verification

### Reconciliation failing
- Ensure Stripe API key has permissions for `subscriptionItems.usage.listUsageRecordSummaries`
- Check tolerance threshold configuration (default 0.5%)
- Review `billing_audit` for reconciliation errors
- Verify idempotency key is unique

## Roadmap

### Phase 1 (Complete)
- ✅ Usage tracking and overage calculation
- ✅ Invoice list and detail pages
- ✅ PDF invoice generation
- ✅ Stripe webhook integration
- ✅ Reconciliation service

### Phase 2 (Planned)
- ⏳ Payment method management
- ⏳ Subscription plan upgrades/downgrades
- ⏳ Usage forecast and budgeting
- ⏳ Multi-currency support
- ⏳ Tax calculation integration

### Phase 3 (Future)
- ⏳ Dunning management for failed payments
- ⏳ Credit management and refunds
- ⏳ Custom billing schedules
- ⏳ Usage-based pricing tiers
- ⏳ Billing analytics dashboard

## Support

For issues or questions:
1. Check backend logs: `backend/logs/`
2. Review audit trail: `billing_audit` table
3. Check Stripe Dashboard for payment status
4. Contact platform team via support channel
