# ClickHouse Integration Plan

> **Status:** Archived. The platform no longer provisions or depends on ClickHouse. This document is retained for historical context only—follow `docs/Internal/Infrastructure/POSTGRES_MIGRATION_PLAN.md` for the current Postgres-only analytics stack and ignore any implementation steps below unless explicitly reintroducing ClickHouse in the future.

## Overview

ClickHouse is a columnar OLAP database optimized for real-time analytics queries on large datasets. This integration will move high-cardinality, time-series analytics from PostgreSQL to ClickHouse for better performance at scale.

## Rationale

### Why ClickHouse?

1. **High-Cardinality Analytics**: Efficiently handles millions of events with many dimensions
2. **Fast Aggregations**: Orders of magnitude faster than PostgreSQL for OLAP queries
3. **Compression**: 10x better compression than traditional row-based databases
4. **Time-Series Native**: Built-in support for time-series data and rollups
5. **Real-Time Ingestion**: Handles high-throughput event streams

### Current PostgreSQL Limitations

- `revenue_events` table will grow to billions of rows
- Aggregation queries slow down as data grows (GROUP BY date, placement, adapter)
- Indexes become large and expensive to maintain
- Per-placement, per-hour analytics impractical at scale

## Data Model

### Events to Migrate

#### Revenue Events (High Priority)

Move from `revenue_events` table to ClickHouse:

```sql
CREATE TABLE revenue_events_ch (
    event_id UInt64,
    publisher_id UUID,
    placement_id UUID,
    adapter_id UUID,
    app_id UUID,
    event_timestamp DateTime,
    event_date Date,
    impressions UInt64,
    clicks UInt64,
    revenue Decimal(12, 2),
    country_code String,
    device_type LowCardinality(String),
    os LowCardinality(String),
    ad_format LowCardinality(String)
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(event_date)
ORDER BY (publisher_id, event_date, placement_id, adapter_id, event_timestamp)
TTL event_date + INTERVAL 2 YEAR;
```

**Partitioning Strategy**: Monthly partitions for efficient data management and pruning

**Ordering**: Optimized for common query patterns (by publisher, date range, placement)

**TTL**: Auto-delete data older than 2 years to manage storage

#### Click Events (Future)

Raw click-level data for fraud detection:

```sql
CREATE TABLE click_events (
    click_id UUID,
    publisher_id UUID,
    placement_id UUID,
    adapter_id UUID,
    timestamp DateTime64(3),
    ip_address IPv4,
    user_agent String,
    referrer String,
    country_code String,
    device_id String,
    click_value Decimal(12, 4)
) ENGINE = MergeTree()
PARTITION BY toYYYYMMDD(timestamp)
ORDER BY (publisher_id, timestamp, placement_id)
TTL timestamp + INTERVAL 90 DAY;
```

### Materialized Views for Rollups

Create pre-aggregated views for common queries:

#### Daily Rollup

```sql
CREATE MATERIALIZED VIEW revenue_daily_mv
ENGINE = SummingMergeTree()
PARTITION BY toYYYYMM(event_date)
ORDER BY (publisher_id, event_date, placement_id, adapter_id)
AS SELECT
    publisher_id,
    placement_id,
    adapter_id,
    event_date,
    sum(impressions) as impressions,
    sum(clicks) as clicks,
    sum(revenue) as revenue
FROM revenue_events_ch
GROUP BY publisher_id, placement_id, adapter_id, event_date;
```

#### Hourly Rollup

```sql
CREATE MATERIALIZED VIEW revenue_hourly_mv
ENGINE = SummingMergeTree()
PARTITION BY toYYYYMM(event_hour)
ORDER BY (publisher_id, event_hour, placement_id, adapter_id)
AS SELECT
    publisher_id,
    placement_id,
    adapter_id,
    toStartOfHour(event_timestamp) as event_hour,
    sum(impressions) as impressions,
    sum(clicks) as clicks,
    sum(revenue) as revenue
FROM revenue_events_ch
GROUP BY publisher_id, placement_id, adapter_id, event_hour;
```

## Hybrid Architecture

### Dual-Write Strategy

**Phase 1**: Write to both PostgreSQL and ClickHouse
- Maintain backward compatibility
- Gradual migration of read queries
- Fallback to PostgreSQL if ClickHouse unavailable

**Phase 2**: ClickHouse-primary
- Analytics queries read from ClickHouse
- PostgreSQL stores only recent aggregates (7-30 days)
- Historical data archived to ClickHouse

**Phase 3**: ClickHouse-only
- All analytics from ClickHouse
- PostgreSQL only for transactional data (users, settings, configs)

### Query Routing

```typescript
// Service layer determines data source
async function getRevenue(publisherId: string, dateRange: DateRange) {
  const daysSince = dateDiff(dateRange.start, new Date());
  
  // Recent data (< 7 days): PostgreSQL (fresher, transactional)
  if (daysSince < 7) {
    return await postgresAnalyticsRepo.getRevenue(publisherId, dateRange);
  }
  
  // Historical data: ClickHouse (faster, optimized)
  return await clickhouseAnalyticsRepo.getRevenue(publisherId, dateRange);
}
```

## Data Ingestion

### Real-Time Ingestion

Use ClickHouse HTTP interface or native TCP protocol:

```typescript
// repository/clickhouseIngestion.ts
import { ClickHouse } from 'clickhouse';

export async function ingestRevenueEvent(event: RevenueEvent) {
  await clickhouse.insert('revenue_events_ch', {
    event_id: event.id,
    publisher_id: event.publisherId,
    placement_id: event.placementId,
    adapter_id: event.adapterId,
    event_timestamp: event.timestamp,
    event_date: event.date,
    impressions: event.impressions,
    clicks: event.clicks,
    revenue: event.revenue,
    country_code: event.countryCode,
    device_type: event.deviceType,
    os: event.os,
    ad_format: event.adFormat,
  });
}
```

### Batch Ingestion

For backfilling historical data:

```typescript
// scripts/backfillClickHouse.js
async function backfillRevenue(startDate, endDate) {
  const batchSize = 10000;
  let offset = 0;
  
  while (true) {
    const events = await postgresPool.query(`
      SELECT * FROM revenue_events
      WHERE event_date >= $1 AND event_date < $2
      ORDER BY event_date
      LIMIT $3 OFFSET $4
    `, [startDate, endDate, batchSize, offset]);
    
    if (events.rows.length === 0) break;
    
    await clickhouse.insertMany('revenue_events_ch', events.rows);
    
    offset += batchSize;
    console.log(`Backfilled ${offset} events`);
  }
}
```

## Migration Strategy

### Phase 1: Setup (Week 1)

1. Install ClickHouse server (Docker or managed service)
2. Create schema and materialized views
3. Implement ClickHouse repository layer
4. Add dual-write to event ingestion pipeline
5. Backfill last 90 days of data

### Phase 2: Validation (Week 2)

1. Run queries against both PostgreSQL and ClickHouse
2. Validate data consistency
3. Compare query performance metrics
4. Fix any discrepancies in data or queries

### Phase 3: Migration (Week 3-4)

1. Update analytics service to read from ClickHouse
2. Monitor error rates and query latency
3. Gradually increase ClickHouse traffic (10% → 50% → 100%)
4. Keep PostgreSQL as fallback

### Phase 4: Optimization (Week 5+)

1. Archive old PostgreSQL data (keep recent 30 days only)
2. Tune ClickHouse settings (compression, merge parameters)
3. Add more materialized views as needed
4. Implement data retention policies

## Query Examples

### Time-Series Revenue

```sql
-- ClickHouse query for daily revenue trend
SELECT 
    event_date,
    sum(revenue) as total_revenue,
    sum(impressions) as total_impressions,
    sum(clicks) as total_clicks
FROM revenue_events_ch
WHERE publisher_id = '11111111-1111-1111-1111-111111111111'
  AND event_date >= today() - 30
GROUP BY event_date
ORDER BY event_date;
```

### Top Placements

```sql
-- Fastest placements by revenue (last 7 days)
SELECT 
    placement_id,
    sum(revenue) as total_revenue,
    sum(impressions) as total_impressions,
    sum(clicks) / sum(impressions) as ctr
FROM revenue_events_ch
WHERE publisher_id = '11111111-1111-1111-1111-111111111111'
  AND event_date >= today() - 7
GROUP BY placement_id
ORDER BY total_revenue DESC
LIMIT 10;
```

### Hourly Breakdown

```sql
-- Hourly revenue pattern using materialized view
SELECT 
    toHour(event_hour) as hour_of_day,
    avg(revenue) as avg_revenue,
    avg(impressions) as avg_impressions
FROM revenue_hourly_mv
WHERE publisher_id = '11111111-1111-1111-1111-111111111111'
  AND event_hour >= now() - INTERVAL 7 DAY
GROUP BY hour_of_day
ORDER BY hour_of_day;
```

## Infrastructure

### Docker Compose (Development)

```yaml
services:
  clickhouse:
    image: clickhouse/clickhouse-server:latest
    container_name: apexmediation-clickhouse
    ports:
      - "8123:8123"  # HTTP interface
      - "9000:9000"  # Native TCP
    environment:
      CLICKHOUSE_DB: apexmediation
      CLICKHOUSE_USER: apexmediation_user
      CLICKHOUSE_PASSWORD: changeme
    volumes:
      - clickhouse_data:/var/lib/clickhouse
      - ./clickhouse/migrations:/docker-entrypoint-initdb.d

volumes:
  clickhouse_data:
```

### Production (Managed Service)

Consider managed ClickHouse services:
- **ClickHouse Cloud** (Official managed service)
- **Altinity.Cloud** (Managed ClickHouse on AWS/GCP)
- **DoubleCloud** (Managed ClickHouse + Kafka)

Benefits:
- Auto-scaling
- High availability / replication
- Automatic backups
- Monitoring and alerting

## Configuration

### Environment Variables

```bash
# ClickHouse connection
CLICKHOUSE_HOST=localhost
CLICKHOUSE_PORT=8123
CLICKHOUSE_DATABASE=apexmediation
CLICKHOUSE_USER=apexmediation_user
CLICKHOUSE_PASSWORD=changeme

# Feature flags
CLICKHOUSE_ENABLED=true
CLICKHOUSE_WRITE_ENABLED=true
CLICKHOUSE_READ_RATIO=0.5  # Percentage of read traffic to ClickHouse
```

## Client Library

Use official ClickHouse Node.js client:

```typescript
// utils/clickhouse.ts
import { ClickHouse } from 'clickhouse';

export const clickhouse = new ClickHouse({
  url: process.env.CLICKHOUSE_HOST || 'http://localhost',
  port: parseInt(process.env.CLICKHOUSE_PORT || '8123'),
  database: process.env.CLICKHOUSE_DATABASE || 'apexmediation',
  basicAuth: {
    username: process.env.CLICKHOUSE_USER || 'default',
    password: process.env.CLICKHOUSE_PASSWORD || '',
  },
  format: 'json',
});
```

## Monitoring

### Key Metrics

- **Query latency**: P50, P95, P99 for analytics queries
- **Ingestion rate**: Events/second written to ClickHouse
- **Data freshness**: Lag between event time and availability
- **Storage usage**: Compressed vs uncompressed size
- **Query errors**: Failed queries and reasons

### Dashboards

Create Grafana dashboards for:
1. Query performance comparison (PostgreSQL vs ClickHouse)
2. Data ingestion throughput
3. Storage and compression ratios
4. Most expensive queries

## Risks and Mitigation

### Risk: Data Inconsistency

**Mitigation**: 
- Dual-write with transaction safety
- Reconciliation jobs to detect and fix discrepancies
- Checksums on aggregated metrics

### Risk: ClickHouse Downtime

**Mitigation**:
- Automatic fallback to PostgreSQL for reads
- Buffer writes in message queue (Redis/Kafka)
- Monitor availability with health checks

### Risk: Query Incompatibility

**Mitigation**:
- Abstract queries behind repository interface
- Version query templates
- Test queries in both systems during migration

## Next Steps

1. **Spike**: Set up local ClickHouse instance and test basic queries (1 day)
2. **Schema Design**: Finalize table schemas and materialized views (2 days)
3. **Repository Layer**: Implement ClickHouse repository with typed queries (3 days)
4. **Dual-Write**: Add parallel writes to ingestion pipeline (2 days)
5. **Backfill**: Script to migrate historical data (1 day)
6. **Testing**: Integration tests and performance benchmarks (3 days)
7. **Gradual Rollout**: Deploy with feature flags and monitoring (ongoing)

## Resources

- [ClickHouse Documentation](https://clickhouse.com/docs)
- [ClickHouse Best Practices](https://clickhouse.com/docs/en/guides/best-practices)
- [Node.js Client](https://github.com/TimonKK/clickhouse)
- [MergeTree Engine](https://clickhouse.com/docs/en/engines/table-engines/mergetree-family/mergetree)
- [Materialized Views](https://clickhouse.com/docs/en/guides/developer/cascading-materialized-views)

# ClickHouse Integration

> DEPRECATION NOTICE (2025-11-25)
>
> This document is deprecated. The production posture is Postgres‑first with self‑hosted Redis, per
> `docs/Internal/Infrastructure/INFRASTRUCTURE_MIGRATION_PLAN.md`. Do not implement new work against
> ClickHouse. Retained for historical reference only.
