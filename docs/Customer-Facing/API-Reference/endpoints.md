# REST API Endpoints Reference

Complete reference for all ApexMediation REST API endpoints.

---

## Base URL

```
Production: https://api.apexmediation.ee/v1
Staging:    https://api-staging.apexmediation.ee/v1
```

---

## Authentication

All API requests require authentication. See [authentication.md](./authentication.md) for details.

**Headers:**
```http
Authorization: Bearer YOUR_JWT_TOKEN
Content-Type: application/json
```

---

## Ad Requests

### Request Ad

Request an ad for display in your app.

**Endpoint:** `POST /ads/request`

**Request Body:**
```json
{
  "placement_id": "banner_main_menu",
  "device": {
    "platform": "ios",
    "os_version": "16.2",
    "device_model": "iPhone14,2",
    "screen_width": 1170,
    "screen_height": 2532,
    "advertising_id": "IDFA_OR_GAID",
    "limit_ad_tracking": false
  },
  "app": {
    "bundle_id": "com.yourapp.game",
    "version": "1.2.3"
  },
  "user": {
    "user_id": "user_12345",
    "country": "US",
    "language": "en",
    "gdpr_consent": true,
    "coppa_compliant": false
  }
}
```

**Response (200 OK):**
```json
{
  "ad_id": "ad_abc123xyz",
  "placement_id": "banner_main_menu",
  "ad_type": "banner",
  "creative": {
    "image_url": "https://cdn.apexmediation.ee/creatives/abc123.png",
    "width": 320,
    "height": 50,
    "click_url": "https://click.apexmediation.ee/abc123"
  },
  "tracking": {
    "impression_url": "https://track.apexmediation.ee/impression/abc123",
    "click_url": "https://track.apexmediation.ee/click/abc123",
    "viewability_url": "https://track.apexmediation.ee/viewability/abc123"
  },
  "bid": {
    "cpm": 2.50,
    "currency": "USD",
    "network": "google_admob"
  }
}
```

**Error Responses:**
- `204 No Content` - No ad available (low fill rate)
- `400 Bad Request` - Invalid request parameters
- `401 Unauthorized` - Missing or invalid API key
- `429 Too Many Requests` - Rate limit exceeded

---

### Track Impression

Track when an ad is displayed to the user.

**Endpoint:** `POST /ads/impression`

**Request Body:**
```json
{
  "ad_id": "ad_abc123xyz",
  "timestamp": "2025-11-04T10:30:00Z",
  "viewability": {
    "visible_pixels": 16000,
    "total_pixels": 16000,
    "visible_duration_ms": 1500
  }
}
```

**Response (200 OK):**
```json
{
  "tracked": true,
  "impression_id": "imp_xyz789"
}
```

---

### Track Click

Track when a user clicks on an ad.

**Endpoint:** `POST /ads/click`

**Request Body:**
```json
{
  "ad_id": "ad_abc123xyz",
  "impression_id": "imp_xyz789",
  "timestamp": "2025-11-04T10:31:00Z"
}
```

**Response (200 OK):**
```json
{
  "tracked": true,
  "click_id": "clk_abc456",
  "redirect_url": "https://advertiser.com/landing-page"
}
```

---

## Analytics

### Get Dashboard Statistics

Retrieve aggregated statistics for your dashboard.

**Endpoint:** `GET /analytics/dashboard`

**Query Parameters:**
- `start_date` (required): ISO 8601 date (e.g., `2025-11-01`)
- `end_date` (required): ISO 8601 date (e.g., `2025-11-30`)
- `timezone` (optional): IANA timezone (default: `UTC`)

**Example:**
```http
GET /analytics/dashboard?start_date=2025-11-01&end_date=2025-11-30&timezone=America/New_York
```

**Response (200 OK):**
```json
{
  "date_range": {
    "start": "2025-11-01",
    "end": "2025-11-30"
  },
  "metrics": {
    "impressions": 1250000,
    "clicks": 15000,
    "ctr": 1.2,
    "revenue": 3125.50,
    "ecpm": 2.50,
    "fill_rate": 98.5
  },
  "by_format": {
    "banner": {
      "impressions": 750000,
      "revenue": 1250.00,
      "ecpm": 1.67
    },
    "interstitial": {
      "impressions": 250000,
      "revenue": 1250.00,
      "ecpm": 5.00
    },
    "rewarded": {
      "impressions": 250000,
      "revenue": 625.50,
      "ecpm": 2.50
    }
  },
  "top_countries": [
    { "country": "US", "impressions": 500000, "revenue": 1500.00 },
    { "country": "UK", "impressions": 200000, "revenue": 600.00 },
    { "country": "CA", "impressions": 150000, "revenue": 400.00 }
  ]
}
```

---

### Get Custom Report

Generate a custom analytics report.

**Endpoint:** `POST /analytics/reports`

**Request Body:**
```json
{
  "name": "October Performance Report",
  "date_range": {
    "start": "2025-10-01",
    "end": "2025-10-31"
  },
  "dimensions": ["date", "country", "ad_format", "network"],
  "metrics": ["impressions", "clicks", "revenue", "ecpm"],
  "filters": {
    "country": ["US", "UK", "CA"],
    "ad_format": ["banner", "interstitial"]
  },
  "format": "json"
}
```

**Response (200 OK):**
```json
{
  "report_id": "report_abc123",
  "status": "processing",
  "download_url": null,
  "estimated_completion": "2025-11-04T10:35:00Z"
}
```

**Poll for completion:**
```http
GET /analytics/reports/report_abc123
```

**Response when complete:**
```json
{
  "report_id": "report_abc123",
  "status": "completed",
  "download_url": "https://reports.apexmediation.ee/report_abc123.json",
  "expires_at": "2025-11-11T10:35:00Z"
}
```

---

## Payouts

### Get Payout History

Retrieve your payout history.

**Endpoint:** `GET /payouts`

**Query Parameters:**
- `page` (optional): Page number (default: `1`)
- `per_page` (optional): Results per page (default: `20`, max: `100`)
- `status` (optional): Filter by status (`pending`, `processing`, `completed`, `failed`)

**Example:**
```http
GET /payouts?page=1&per_page=20&status=completed
```

**Response (200 OK):**
```json
{
  "payouts": [
    {
      "id": "payout_abc123",
      "amount": 1250.00,
      "currency": "EUR",
      "status": "completed",
      "method": "bank_transfer",
      "period": {
        "start": "2025-10-01",
        "end": "2025-10-31"
      },
      "processed_at": "2025-11-05T10:00:00Z",
      "recipient": {
        "iban": "EE**************1234",
        "name": "Your Company OÜ"
      }
    }
  ],
  "pagination": {
    "page": 1,
    "per_page": 20,
    "total": 45,
    "total_pages": 3
  }
}
```

---

### Request Payout

Request an early payout (if eligible).

**Endpoint:** `POST /payouts/request`

**Request Body:**
```json
{
  "amount": 500.00,
  "currency": "EUR",
  "method": "bank_transfer"
}
```

**Response (200 OK):**
```json
{
  "payout_id": "payout_xyz789",
  "amount": 500.00,
  "currency": "EUR",
  "status": "pending",
  "estimated_processing_time": "2-3 business days"
}
```

**Error Responses:**
- `400 Bad Request` - Below minimum payout threshold
- `403 Forbidden` - Payout not eligible (insufficient balance, account on hold)

---

## Mediation

### Get Waterfall Configuration

Retrieve your current mediation waterfall setup.

**Endpoint:** `GET /mediation/waterfall`

**Response (200 OK):**
```json
{
  "placements": [
    {
      "placement_id": "banner_main",
      "ad_format": "banner",
      "networks": [
        {
          "network": "google_admob",
          "priority": 1,
          "floor_price": 2.00,
          "enabled": true
        },
        {
          "network": "meta_audience_network",
          "priority": 2,
          "floor_price": 1.80,
          "enabled": true
        },
        {
          "network": "unity_ads",
          "priority": 3,
          "floor_price": 1.50,
          "enabled": true
        }
      ]
    }
  ]
}
```

---

### Update Waterfall Configuration

Update your mediation waterfall.

**Endpoint:** `PUT /mediation/waterfall/{placement_id}`

**Request Body:**
```json
{
  "networks": [
    {
      "network": "google_admob",
      "priority": 1,
      "floor_price": 2.50,
      "enabled": true
    },
    {
      "network": "meta_audience_network",
      "priority": 2,
      "floor_price": 2.00,
      "enabled": true
    }
  ]
}
```

**Response (200 OK):**
```json
{
  "updated": true,
  "placement_id": "banner_main",
  "networks_count": 2
}
```

---

## Fraud Detection

### Get Fraud Report

Retrieve fraud detection report for your traffic.

**Endpoint:** `GET /fraud/report`

**Query Parameters:**
- `start_date` (required): ISO 8601 date
- `end_date` (required): ISO 8601 date

**Response (200 OK):**
```json
{
  "date_range": {
    "start": "2025-11-01",
    "end": "2025-11-30"
  },
  "summary": {
    "total_requests": 1000000,
    "blocked_requests": 5000,
    "block_rate": 0.5,
    "estimated_saved": 150.00
  },
  "fraud_types": {
    "click_fraud": 2000,
    "install_fraud": 1500,
    "vpn_detected": 1000,
    "bot_traffic": 500
  },
  "top_blocked_ips": [
    { "ip": "192.168.1.1", "requests": 250, "reason": "click_fraud" },
    { "ip": "10.0.0.1", "requests": 200, "reason": "bot_traffic" }
  ]
}
```

---

## User Management

### Get Current User

Get details about the authenticated user.

**Endpoint:** `GET /users/me`

**Response (200 OK):**
```json
{
  "id": "user_abc123",
  "email": "developer@yourcompany.com",
  "first_name": "John",
  "last_name": "Doe",
  "company": "Your Company OÜ",
  "role": "admin",
  "account": {
    "publisher_id": "pub_xyz789",
    "tier": "premium",
    "revenue_share": 0.12,
    "balance": 1250.50,
    "currency": "EUR"
  },
  "created_at": "2024-06-15T10:00:00Z"
}
```

---

### Update User Profile

Update user profile information.

**Endpoint:** `PUT /users/me`

**Request Body:**
```json
{
  "first_name": "John",
  "last_name": "Doe",
  "company": "Your Company OÜ",
  "phone": "+372 5555 5555"
}
```

**Response (200 OK):**
```json
{
  "updated": true,
  "user": {
    "id": "user_abc123",
    "email": "developer@yourcompany.com",
    "first_name": "John",
    "last_name": "Doe",
    "company": "Your Company OÜ",
    "phone": "+372 5555 5555"
  }
}
```

---

## Webhooks

### Register Webhook

Register a webhook endpoint to receive real-time events.

**Endpoint:** `POST /webhooks`

**Request Body:**
```json
{
  "url": "https://yourapp.com/webhooks/apexmediation",
  "events": [
    "payout.succeeded",
    "payout.failed",
    "fraud.detected",
    "threshold.reached"
  ],
  "secret": "your_webhook_secret"
}
```

**Response (200 OK):**
```json
{
  "webhook_id": "webhook_abc123",
  "url": "https://yourapp.com/webhooks/apexmediation",
  "events": [
    "payout.succeeded",
    "payout.failed",
    "fraud.detected",
    "threshold.reached"
  ],
  "status": "active",
  "created_at": "2025-11-04T10:00:00Z"
}
```

---

### List Webhooks

Get all registered webhooks.

**Endpoint:** `GET /webhooks`

**Response (200 OK):**
```json
{
  "webhooks": [
    {
      "webhook_id": "webhook_abc123",
      "url": "https://yourapp.com/webhooks/apexmediation",
      "events": ["payout.succeeded", "payout.failed"],
      "status": "active",
      "last_triggered": "2025-11-03T15:30:00Z"
    }
  ]
}
```

---

### Delete Webhook

Delete a webhook.

**Endpoint:** `DELETE /webhooks/{webhook_id}`

**Response (200 OK):**
```json
{
  "deleted": true,
  "webhook_id": "webhook_abc123"
}
```

---

## Rate Limits

All endpoints are rate limited to prevent abuse:

- **Authentication endpoints**: 5 requests per minute
- **Ad request endpoints**: 1000 requests per minute
- **Analytics endpoints**: 60 requests per minute
- **Management endpoints**: 100 requests per minute

**Rate limit headers:**
```http
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 950
X-RateLimit-Reset: 1699099200
```

When rate limited, you'll receive:
```http
HTTP/1.1 429 Too Many Requests
Retry-After: 60

{
  "error": "rate_limit_exceeded",
  "message": "Too many requests. Please retry after 60 seconds."
}
```

---

## Error Codes

| Code | Status | Description |
|------|--------|-------------|
| `invalid_request` | 400 | Invalid request parameters |
| `unauthorized` | 401 | Missing or invalid authentication |
| `forbidden` | 403 | Insufficient permissions |
| `not_found` | 404 | Resource not found |
| `rate_limit_exceeded` | 429 | Too many requests |
| `internal_error` | 500 | Internal server error |
| `service_unavailable` | 503 | Service temporarily unavailable |

**Error Response Format:**
```json
{
  "error": "invalid_request",
  "message": "Missing required field: placement_id",
  "field": "placement_id",
  "request_id": "req_abc123"
}
```

---

## Pagination

Endpoints that return lists use cursor-based pagination:

**Request:**
```http
GET /analytics/events?limit=100&cursor=abc123xyz
```

**Response:**
```json
{
  "data": [...],
  "pagination": {
    "next_cursor": "xyz789abc",
    "has_more": true,
    "limit": 100
  }
}
```

---

## SDK vs REST API

**When to use SDK:**
- Mobile apps (Unity, iOS, Android)
- Web games
- Quick integration

**When to use REST API:**
- Server-side integrations
- Custom reporting dashboards
- Advanced mediation management
- Webhook integrations

---

## Support

- **Documentation**: [docs.apexmediation.ee](https://docs.apexmediation.ee)
- **Email**: support@bel-consulting.ee
- **Discord**: [discord.gg/apexmediation](https://discord.gg/apexmediation)
- **API Status**: [status.apexmediation.ee](https://status.apexmediation.ee)

---

**Last Updated**: November 2025
**API Version**: v1
**Spec**: OpenAPI 3.0 (available at [api.apexmediation.ee/openapi.json](https://api.apexmediation.ee/openapi.json))
