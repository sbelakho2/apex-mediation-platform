# ClickHouse Analytics Integration *(Legacy)*

> **Note:** The ClickHouse bootstrap scripts were removed as part of the Postgres migration plan. This document is retained for archival reference only. If you still operate a ClickHouse cluster, seed schemas manually using the statements in `backend/src/utils/clickhouse.schema.ts`.

## Overview

The ApexMediation backend now includes a comprehensive ClickHouse integration for high-performance analytics and reporting. This document covers the implementation details, API endpoints, and usage instructions.

## Architecture

### Components

1. **ClickHouse Client** (`utils/clickhouse.ts`)
   - Connection management with pooling
   - Health checks
   - Parameterized query execution
   - Batch insertion for performance

2. **Database Schema** (`utils/clickhouse.schema.ts`)
   - `impressions` table - Ad impression events
   - `clicks` table - Click events
   - `revenue_events` table - Revenue tracking
   - `performance_metrics` table - Adapter performance data
   - Materialized views for aggregations

3. **Analytics Service** (`services/analyticsService.ts`)
   - Event buffering (100 events or 5 seconds)
   - Automatic batch flushing
   - Retry logic for failed insertions

4. **Reporting Service** (`services/reportingService.ts`)
   - Complex aggregation queries
   - Time-series data generation
   - Performance analytics

## API Endpoints

### Event Ingestion (No Authentication Required)

These endpoints are designed for SDK integration and do not require authentication.

#### POST /api/v1/analytics/events/impressions

Record ad impression events.

**Request Body:**
```json
{
  "events": [
    {
      "event_id": "550e8400-e29b-41d4-a716-446655440000",
      "timestamp": "2025-11-03T13:00:00.000Z",
      "publisher_id": "123e4567-e89b-12d3-a456-426614174000",
      "app_id": "223e4567-e89b-12d3-a456-426614174000",
      "placement_id": "323e4567-e89b-12d3-a456-426614174000",
      "adapter_id": "423e4567-e89b-12d3-a456-426614174000",
      "adapter_name": "AdMob",
      "ad_unit_id": "ca-app-pub-123456",
      "ad_format": "banner",
      "country_code": "US",
      "device_type": "phone",
      "os": "ios",
      "os_version": "16.0",
      "app_version": "1.0.0",
      "sdk_version": "2.0.0",
      "session_id": "523e4567-e89b-12d3-a456-426614174000",
      "user_id": "user123",
      "request_id": "623e4567-e89b-12d3-a456-426614174000",
      "bid_price_usd": 2.5,
      "ecpm_usd": 3.0,
      "latency_ms": 150,
      "is_test_mode": false
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "message": "Queued 1 impression events",
  "count": 1
}
```

#### POST /api/v1/analytics/events/clicks

Record click events.

**Request Body:**
```json
{
  "events": [
    {
      "event_id": "650e8400-e29b-41d4-a716-446655440000",
      "timestamp": "2025-11-03T13:00:05.000Z",
      "impression_id": "550e8400-e29b-41d4-a716-446655440000",
      "publisher_id": "123e4567-e89b-12d3-a456-426614174000",
      "app_id": "223e4567-e89b-12d3-a456-426614174000",
      "placement_id": "323e4567-e89b-12d3-a456-426614174000",
      "adapter_id": "423e4567-e89b-12d3-a456-426614174000",
      "adapter_name": "AdMob",
      "click_url": "https://example.com/click",
      "country_code": "US",
      "device_type": "phone",
      "os": "ios",
      "session_id": "523e4567-e89b-12d3-a456-426614174000",
      "user_id": "user123",
      "request_id": "623e4567-e89b-12d3-a456-426614174000",
      "time_to_click_ms": 2500,
      "is_verified": true,
      "is_test_mode": false
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "message": "Queued 1 click events",
  "count": 1
}
```

#### POST /api/v1/analytics/events/revenue

Record revenue events.

**Request Body:**
```json
{
  "events": [
    {
      "event_id": "750e8400-e29b-41d4-a716-446655440000",
      "timestamp": "2025-11-03T13:00:00.000Z",
      "publisher_id": "123e4567-e89b-12d3-a456-426614174000",
      "app_id": "223e4567-e89b-12d3-a456-426614174000",
      "placement_id": "323e4567-e89b-12d3-a456-426614174000",
      "adapter_id": "423e4567-e89b-12d3-a456-426614174000",
      "adapter_name": "AdMob",
      "impression_id": "550e8400-e29b-41d4-a716-446655440000",
      "revenue_type": "impression",
      "revenue_usd": 2.5,
      "revenue_currency": "USD",
      "revenue_original": 2.5,
      "exchange_rate": 1.0,
      "ecpm_usd": 3.0,
      "country_code": "US",
      "ad_format": "banner",
      "os": "ios",
      "is_test_mode": false,
      "reconciliation_status": "pending"
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "message": "Queued 1 revenue events",
  "count": 1
}
```

### Reporting Endpoints (Authentication Required)

All reporting endpoints require Bearer token authentication.

#### GET /api/v1/reporting/overview

Get revenue overview statistics.

**Query Parameters:**
- `startDate` (optional): ISO 8601 datetime (default: 7 days ago)
- `endDate` (optional): ISO 8601 datetime (default: now)

**Example:**
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  "https://api.example.com/api/v1/reporting/overview?startDate=2025-10-27T00:00:00Z&endDate=2025-11-03T23:59:59Z"
```

**Response:**
```json
{
  "success": true,
  "data": {
    "totalRevenue": 12345.67,
    "totalImpressions": 1000000,
    "totalClicks": 5000,
    "avgEcpm": 12.35,
    "avgCtr": 0.5,
    "period": {
      "startDate": "2025-10-27T00:00:00.000Z",
      "endDate": "2025-11-03T23:59:59.000Z"
    }
  }
}
```

#### GET /api/v1/reporting/timeseries

Get time-series data for charts.

**Query Parameters:**
- `startDate` (optional): ISO 8601 datetime
- `endDate` (optional): ISO 8601 datetime
- `granularity` (optional): `hour` or `day` (default: `day`)

**Response:**
```json
{
  "success": true,
  "data": {
    "series": [
      {
        "timestamp": "2025-11-01T00:00:00.000Z",
        "revenue": 1234.56,
        "impressions": 100000,
        "clicks": 500,
        "ecpm": 12.35,
        "ctr": 0.5
      }
    ],
    "granularity": "day",
    "period": {
      "startDate": "2025-10-27T00:00:00.000Z",
      "endDate": "2025-11-03T23:59:59.000Z"
    }
  }
}
```

#### GET /api/v1/reporting/adapters

Get performance breakdown by adapter.

**Query Parameters:**
- `startDate` (optional): ISO 8601 datetime
- `endDate` (optional): ISO 8601 datetime

**Response:**
```json
{
  "success": true,
  "data": {
    "adapters": [
      {
        "adapterId": "423e4567-e89b-12d3-a456-426614174000",
        "adapterName": "AdMob",
        "revenue": 5000.00,
        "impressions": 500000,
        "clicks": 2500,
        "ecpm": 10.00,
        "ctr": 0.5,
        "avgLatency": 150
      }
    ],
    "period": {
      "startDate": "2025-10-27T00:00:00.000Z",
      "endDate": "2025-11-03T23:59:59.000Z"
    }
  }
}
```

#### GET /api/v1/reporting/countries

Get revenue breakdown by country.

**Query Parameters:**
- `startDate` (optional): ISO 8601 datetime
- `endDate` (optional): ISO 8601 datetime
- `limit` (optional): Number of countries (1-50, default: 10)

**Response:**
```json
{
  "success": true,
  "data": {
    "countries": [
      {
        "countryCode": "US",
        "revenue": 8000.00,
        "impressions": 600000,
        "clicks": 3000,
        "ecpm": 13.33
      }
    ],
    "period": {
      "startDate": "2025-10-27T00:00:00.000Z",
      "endDate": "2025-11-03T23:59:59.000Z"
    }
  }
}
```

#### GET /api/v1/reporting/top-apps

Get top performing apps.

**Query Parameters:**
- `startDate` (optional): ISO 8601 datetime
- `endDate` (optional): ISO 8601 datetime
- `limit` (optional): Number of apps (1-50, default: 10)

**Response:**
```json
{
  "success": true,
  "data": {
    "apps": [
      {
        "appId": "com.example.app",
        "revenue": 3000.00,
        "impressions": 300000,
        "clicks": 1500,
        "ecpm": 10.00
      }
    ],
    "period": {
      "startDate": "2025-10-27T00:00:00.000Z",
      "endDate": "2025-11-03T23:59:59.000Z"
    }
  }
}
```

#### GET /api/v1/reporting/realtime

Get real-time statistics (last hour).

**Response:**
```json
{
  "success": true,
  "data": {
    "impressions": 5000,
    "clicks": 25,
    "revenue": 50.00,
    "activeAdapters": 5,
    "timestamp": "2025-11-03T13:30:00.000Z"
  }
}
```

## Setup Instructions

### Prerequisites

- ClickHouse 23.x or later
- Node.js 18.x or later

### Installation

1. **Install ClickHouse**

```bash
# macOS
brew install clickhouse

# Ubuntu/Debian
sudo apt-get install clickhouse-server clickhouse-client

# Docker
docker run -d --name clickhouse -p 8123:8123 -p 9000:9000 clickhouse/clickhouse-server
```

2. **Configure Environment Variables**

Add to your `.env` file:

```env
CLICKHOUSE_URL=http://localhost:8123
CLICKHOUSE_DATABASE=apexmediation
CLICKHOUSE_USER=default
CLICKHOUSE_PASSWORD=
CLICKHOUSE_MAX_CONNECTIONS=10
```

3. **Initialize Schema**

The previous helper script (`npm run clickhouse:init`) has been removed. To provision a legacy ClickHouse cluster, run the DDL statements from `backend/src/utils/clickhouse.schema.ts` manually (e.g., via `clickhouse-client` or your preferred migration tool). This step is no longer automated.

### Verification

Check ClickHouse health:

```bash
curl http://localhost:4000/health
```

Response should include ClickHouse status:

```json
{
  "status": "healthy",
  "services": {
    "postgres": "up",
    "clickhouse": "up"
  }
}
```

## Performance Considerations

### Event Buffering

Events are buffered in memory before being inserted into ClickHouse:
- **Batch Size**: 100 events
- **Flush Interval**: 5 seconds
- **Retry Logic**: Failed batches are re-queued

### Query Optimization

- **Materialized Views**: Pre-aggregated data for common queries
- **Partitioning**: Monthly partitions on timestamp
- **TTL Policies**: 
  - Event data: 90 days
  - Revenue data: 365 days
- **Skip Indexes**: Bloom filters on frequently filtered columns

### Scalability

- Connection pooling (configurable via `CLICKHOUSE_MAX_CONNECTIONS`)
- Horizontal scaling via ClickHouse replication
- Read replicas for reporting queries

## Monitoring

### Buffer Stats

Monitor event buffer status:

```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:4000/api/v1/analytics/buffer-stats
```

Response:

```json
{
  "success": true,
  "data": {
    "impressions": 45,
    "clicks": 12,
    "revenue": 8,
    "total": 65
  }
}
```

### Query Performance

Monitor ClickHouse query performance:

```sql
SELECT 
  query,
  elapsed,
  read_rows,
  read_bytes
FROM system.query_log
WHERE type = 'QueryFinish'
ORDER BY event_time DESC
LIMIT 10;
```

## Testing

### Unit Tests

```bash
npm test
```

### Integration Tests

Analytics event ingestion tests: `src/__tests__/integration/analytics.integration.test.ts`
Reporting API tests: `src/__tests__/integration/reporting.integration.test.ts`

**Note**: Reporting tests require ClickHouse to be running and will be skipped if unavailable.

## Troubleshooting

### ClickHouse Connection Fails

Check if ClickHouse is running:

```bash
curl http://localhost:8123/ping
```

Verify connection settings in `.env` file.

### Buffer Not Flushing

Check logs for errors:

```bash
tail -f logs/app.log | grep "Failed to flush"
```

### Query Performance Issues

1. Check table statistics:
   ```sql
   SELECT * FROM system.tables WHERE database = 'apexmediation';
   ```

2. Analyze query execution:
   ```sql
   EXPLAIN SELECT * FROM impressions WHERE publisher_id = '...';
   ```

3. Rebuild materialized views:
   ```sql
   DETACH TABLE hourly_revenue_mv;
   ATTACH TABLE hourly_revenue_mv;
   ```

## Migration

When upgrading schema:

1. Backup existing data
2. Test migration on staging environment
3. Run schema updates during low-traffic period
4. Verify data integrity post-migration

## Additional Resources

- [ClickHouse Documentation](https://clickhouse.com/docs)
- [Node.js ClickHouse Client](https://github.com/ClickHouse/clickhouse-js)
- [MergeTree Engine](https://clickhouse.com/docs/en/engines/table-engines/mergetree-family/mergetree/)
- [Materialized Views](https://clickhouse.com/docs/en/sql-reference/statements/create/view/#materialized-view)

> DEPRECATION NOTICE (2025-11-25)
>
> ClickHouse analytics is deprecated per `docs/Internal/Infrastructure/INFRASTRUCTURE_MIGRATION_PLAN.md`.
> The production posture is Postgres‑first with self‑hosted Redis. This document is retained for
> historical reference only and must not be used for new work. Prefer Postgres rollups and views.
