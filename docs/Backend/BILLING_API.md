# Billing API — Endpoints and Examples

Last updated: 2025-11-12
Owner: Backend/Billing

## Authentication
- All endpoints require JWT Bearer auth unless explicitly stated.
- Include `Authorization: Bearer <token>` and CSRF headers for mutating requests.

## Base URL
- Default local: `http://localhost:4000/api/v1`

---

## GET /billing/usage/current
Returns current period usage, subscription limits, and projected overages.

Example:
```bash
curl -s \
  -H "Authorization: Bearer $TOKEN" \
  "$BASE/api/v1/billing/usage/current" | jq
```

Response (200):
```json
{
  "current_period": {
    "start": "2025-10-01T00:00:00.000Z",
    "end": "2025-10-31T23:59:59.999Z",
    "impressions": 123456,
    "api_calls": 98765,
    "data_transfer_gb": 12.34
  },
  "overages": {
    "impressions": { "amount": 3456, "cost": 12.34 },
    "api_calls": { "amount": 0, "cost": 0 },
    "data_transfer": { "amount": 0, "cost": 0 },
    "total_overage_cost": 12.34
  },
  "subscription": {
    "plan_type": "studio",
    "included_impressions": 100000,
    "included_api_calls": 100000,
    "included_data_transfer_gb": 10
  }
}
```

---

## GET /billing/invoices
List invoices with pagination and filters.

Query params:
- `page` (default 1), `limit` (1–100)
- `status` in `draft|open|paid|void|uncollectible`
- `start_date`, `end_date` (ISO-8601)

Example:
```bash
curl -s \
  -H "Authorization: Bearer $TOKEN" \
  "$BASE/api/v1/billing/invoices?status=paid&page=1&limit=20" | jq
```

Response (200):
```json
{
  "invoices": [
    {
      "id": "inv_1",
      "invoice_number": "2025-0001",
      "amount": 4999,
      "currency": "USD",
      "status": "paid",
      "period_start": "2025-10-01T00:00:00.000Z",
      "period_end": "2025-10-31T23:59:59.999Z",
      "due_date": "2025-11-15T00:00:00.000Z",
      "paid_at": "2025-11-01T12:00:00.000Z"
    }
  ],
  "pagination": { "page": 1, "limit": 20, "total": 1, "total_pages": 1 }
}
```

---

## GET /billing/invoices/:id/pdf
Streams a PDF. Supports `ETag` and `If-None-Match` for 304 caching.

Example (first request):
```bash
curl -i \
  -H "Authorization: Bearer $TOKEN" \
  "$BASE/api/v1/billing/invoices/inv_1/pdf" -o invoice.pdf
```

Example (with ETag):
```bash
ETAG=$(curl -si -H "Authorization: Bearer $TOKEN" "$BASE/api/v1/billing/invoices/inv_1/pdf" | awk '/ETag:/ {print $2}')
curl -i \
  -H "Authorization: Bearer $TOKEN" \
  -H "If-None-Match: $ETAG" \
  "$BASE/api/v1/billing/invoices/inv_1/pdf"
# Expect HTTP/1.1 304 Not Modified
```

---

## POST /billing/reconcile
Triggers reconciliation. Requires admin role and an idempotency key.

Headers:
- `Authorization: Bearer <token>`
- `Idempotency-Key: <unique-key>`
- `X-CSRF-Token: <token>` (when applicable)

Example:
```bash
curl -s -X POST \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Idempotency-Key: admin-reconcile-$(date +%s)" \
  -H "Content-Type: application/json" \
  "$BASE/api/v1/billing/reconcile" | jq
```

Response (200):
```json
{
  "success": true,
  "discrepancies": [],
  "total_discrepancy_amount": 0,
  "reconciliation_id": "recon_123",
  "timestamp": "2025-11-12T00:00:00.000Z"
}
```

---

## OpenAPI
A full OpenAPI spec is available at `backend/src/openapi/billing.yaml` and (in dev) under `/api-docs`.
