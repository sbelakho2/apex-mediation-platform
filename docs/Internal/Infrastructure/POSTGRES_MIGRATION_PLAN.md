# Postgres Migration Plan (ClickHouse Removal)

Goal: remove every ClickHouse dependency across the monorepo (backend, console, website, ML, monitoring, infra) and rely exclusively on PostgreSQL (plus Redis/S3/etc). Below are the concrete workstreams and implementation notes captured from the repository-wide inventory.

## Postgres Scalability Guardrails

All current and future changes to this plan must satisfy the following non-negotiable requirements so the Postgres control plane scales for decades and leaves room to reintroduce ClickHouse (or other OLAP systems) later when analytics volume warrants it.

### Architecture principles
- **Separation of planes:** keep Postgres-based control-plane metadata/auth/config separate from the high-volume data-plane, even if both start out co-located; treat cross-plane coupling as temporary.
- **CQRS boundaries:** writes land in lean, minimally indexed tables while reads come from purpose-built materialized views/read models to avoid complex joins on hot paths.
- **Cache-first design:** Redis/KeyDB own hot-path lookups, rate limiting, and routing; cache hit rates become an explicit SLO.

### Data modeling & schema evolution
- **Strict versioned schemas:** each migration ships with version manifests, rollback steps, and zero ad-hoc production DDL.
- **Append-only patterns:** rely on event sourcing or append-only fact tables, with downstream projections building read models.
- **Controlled JSONB usage:** keep filter columns typed; JSONB only for sparse metadata and never with volatile GIN indexes.

### Write path & ingestion
- **Idempotent pipelines:** every ingress key is deduplicated so batches can replay safely.
- **Bulk-friendly staging:** use UNLOGGED staging + COPY, then `INSERT ... SELECT` into partitioned targets with minimal constraints.
- **Key design:** favor monotonic IDs (UUIDv7/ULID) to keep index pages hot.
- **Backpressure controls:** define queue depth SLOs and circuit breakers when autovacuum or replicas lag.

### Read path & query performance
- **Workload isolation:** heavy analytics use read replicas only—never the primary.
- **Precomputed aggregations:** incremental materialized views or rollup tables refreshed by partition-aware workers.
- **Index discipline:** BRIN on time-series scans, partial indexes for selective filters, and covering indexes for index-only reads.
- **Query SLOs:** 90th percentile operational reads stay under 200 ms with saved `EXPLAIN ANALYZE` plans to auto-ticket regressions.

### Storage, partitioning & retention
- **Hierarchical partitioning:** daily partitions for ultra-hot, monthly for warm; automate attach/detach via pg_partman/Timescale.
- **Compression strategy:** compress cold chunks (Timescale) or export to Parquet+ZSTD before dropping from Postgres.
- **Archive queryability:** expose Parquet archives via FDW/DuckDB gateways with enforced cost caps.

### Replication, HA & multi-region
- **HA baseline:** synchronous standby per region for durability, async replicas for reads.
- **Failover automation:** Patroni/Stolon/managed HA with regular game-day drills.
- **Multi-region reads:** route read traffic to local replicas; writes remain single-region until shardable.
- **Disaster recovery:** base backups + WAL archiving with PITR tests every quarter.

### Operational tuning & maintenance
- **Autovacuum tuning:** per-table settings that match write volume (lower scale factors on hot partitions).
- **Bloat management:** use `pg_repack`/`REINDEX CONCURRENTLY` and track bloat percentages.
- **WAL/IO optimization:** enable `wal_compression`, dedicate WAL disks, disable synchronous commit for non-critical ingest.
- **Connection economy:** PgBouncer in transaction mode everywhere with server-side prepared statements.

### Observability & performance budgets
- **Golden signals:** dashboards must show QPS, p95 latency, buffer hit ratio, checkpoint time, autovacuum lag, bloat %, and replica lag.
- **Plan visibility:** keep `pg_stat_statements` enabled and archive top-N plans monthly.
- **Error budgets:** define SLOs per workload and gate new features if latency/lag budgets are exhausted.
- **Capacity planning:** load-test quarterly at 10× volume and record scaling curves.

### Cost optimization & tiering
- **Hot/warm/cold tiers:** Postgres primary keeps 30–90 days, replicas/compressed chunks hold 6–12 months, object storage handles anything older.
- **Compute right-sizing:** prefer multiple smaller nodes over a single giant box; tune `work_mem` per role.
- **Storage discipline:** cap index size relative to RAM and enforce retention SLAs with alerts when partitions bloat.

### Migration pathways beyond Postgres
- **Analytics outgrowth:** when scans near billions of rows, mirror partitions to ClickHouse/BigQuery/Snowflake via CDC while keeping Postgres as the control plane.
- **Horizontal scale:** adopt Citus or split domains into micro-databases when single-region writes saturate.
- **Safe cutovers:** dual-write + compare, run checksums, and enforce read-only windows before traffic flips.

## 1. Backend APIs & Services

_Guardrail alignment:_ keep control-plane APIs on typed, versioned schemas; use append-only facts for data-plane writes; reserve Redis/queues for cache-first flows; and ensure CQRS boundaries by feeding read models/materialized views.

### 1.1 Transparency pipeline
- **Writers**: `src/services/transparencyWriter.ts` currently inserts into ClickHouse tables `auctions` and `auction_candidates` using the shared client.
- **Readers**: `src/controllers/transparency.controller.ts` plus validation/spec tests read from the same tables via `executeQuery`.
- **Scripts**: `backend/scripts/vra*.js` previously bootstrapped ClickHouse connections for transparency, and `initClickHouseSchema.ts` handled schema creation. The latter has now been removed as part of the Postgres cutover.
- **Plan**:
  1. Create PostgreSQL tables `transparency_auctions` and `transparency_auction_candidates` with equivalent columns + indexes (`publisher_id`, `timestamp desc`, `auction_id`). Partition daily to respect hot/warm tiers and prefer UUIDv7 keys when practical. **Status:** ✅ `20251201_090000_transparency_tables` created the base tables and `20251201_134500_partition_transparency_tables` upgraded them to daily range partitions with composite keys that keep `auction_id` dedupe guarantees.
  2. Replace `getClickHouseClient` usage inside `transparencyWriter` with `utils/postgres.insertMany` and transactional inserts (auctions first, then candidates). Keep breaker/metrics semantics but rename ops alerts/metrics away from ClickHouse. **Status:** ✅ `transparencyWriter` now stages writes through the UNLOGGED tables added in `20251201_135600_transparency_staging_tables`, merges into the partitioned parents with `ON CONFLICT` dedupe, and exposes the `transparency_ingest_stage_size` gauge for backpressure visibility.
  3. Update `transparency.controller` (and associated tests) to query Postgres via `utils/postgres.query` and adjust SQL to use `ORDER BY`/`LIMIT/OFFSET` with bind params. **Status:** ✅ controller queries already point at Postgres and now route through the replica pool (`replicaQuery(...)`) so heavy publisher reads stay off the primary.
  4. Remove ClickHouse-specific scripts/tests (or rework them to call Postgres).
  - **Guardrails:** migrations remain versioned with rollback steps, writes stay append-only, and materialized views/read-model tables backfill the query plane instead of ad-hoc joins on primaries.

### 1.2 Analytics ingest & reporting
- **Services**: `analyticsService`, `reportingService`, `qualityMonitoringService`, `dataExportService`, `bidLandscapeService`, `qualityMonitoringService`, `UsageMeteringService`, `rtbTracking.controller`, queue processors under `src/queues/processors/analytics*` all rely on ClickHouse tables (`impressions`, `clicks`, `revenue_events`, `creative_scans`, `sdk_telemetry`, etc.).
- **Plan**:
  1. Introduce Postgres analytics tables (`analytics_impressions`, `analytics_clicks`, `analytics_revenue_events`, `analytics_performance_metrics`, `creative_scans`, `creative_compliance`, `sdk_telemetry`, `quality_alerts`). Align columns with what services query (viewability fields, risk scores, ANR metrics) and add indexes (publisher_id+timestamp, adapter filters). Partition by day with BRIN indexes for long scans and stage bulk loads through UNLOGGED tables + COPY before merging. **Status:** ✅ `20251201_103000_analytics_tables` migration adds the fact tables + indexes and `20251201_131500_partition_analytics_tables` converts them to daily range partitions with default partitions for legacy data.
  2. Update `analyticsService` batching logic to insert into these tables via `insertMany`/COPY semantics and ensure `record*` methods talk to Postgres. **Status:** ✅ `src/services/analyticsService.ts` now writes through UNLOGGED staging tables (`analytics_*_stage`) defined in `20251201_132600_analytics_staging_tables`, then merges into the partitioned facts with ON CONFLICT dedupe semantics; Jest coverage (`analyticsService.test.ts`) validates the new flow.
  3. Rework `reportingService`/`qualityMonitoringService` queries to use Postgres SQL functions (e.g., `DATE_TRUNC`, `COUNT(*) FILTER (WHERE ...)`). Replace `executeQuery` with `query` and adjust tests. **Status:** ✅ Both services now source data from the `analytics_*` tables via the shared Postgres helper, and their Jest suites (`reportingService.test.ts`, `qualityMonitoringService.test.ts`) mock `utils/postgres.query` instead of ClickHouse.
  4. Update queue processors (`analyticsIngest`, `analyticsAggregation`, `dataExport`) and controllers to reference the new Postgres services. Apply idempotent dedupe keys, enforce queue depth SLOs, and route heavy analytics reads to replicas. **Status:** ✅ `analyticsAggregation` now upserts into the partitioned rollup tables added in `20251201_150500_analytics_rollup_tables` (`analytics_*_rollups`) using `ON CONFLICT` dedupe, and the data export worker reads from `analytics_metrics_rollups` through the replica pool so heavy exports never hit the primary. Queue depth logging remains unchanged and `rtbTracking.controller` still writes exclusively to Postgres.
  5. Remove `utils/clickhouse.ts`, `clickhouse.schema.ts`, and any helper exports.
  - **Guardrails:** append-only staging + COPY, BRIN/partial indexes only where justified, cached hot metrics via Redis, `pg_stat_statements` tracking for every new query surface, and the new rollup tables partition data daily with `ON CONFLICT` idempotency while replica-only exports keep workload isolation intact.

### 1.3 Billing / Usage
- `services/billing/UsageMeteringService.ts` dual-writes to Postgres + ClickHouse and analytics UIs read from ClickHouse via `getUsageAnalytics`.
- **Plan**:
  - Drop ClickHouse client usage; rely solely on `usage_records` / `usage_events` tables in Postgres. **Status:** ✅ `UsageMeteringService` now routes every write through the shared Postgres helper with per-query labels, preserving idempotent inserts while removing the ClickHouse client dependency entirely.
  - Rewrite analytics query to aggregate via Postgres CTE grouping by `DATE_TRUNC('day', recorded_at)`. **Status:** ✅ `getUsageAnalytics` now runs on the read replica (`replicaQuery`) with a bounded lookback window, daily `DATE_TRUNC` rollups, and deterministic ordering so the workload-isolation and query-SLO guardrails stay enforced.
  - Update docs/tests referencing ClickHouse-specific expectations. **Status:** ✅ Console + backend billing docs now call out Postgres replicas as the sole usage data source, deployment/manifest guides were updated, and Jest test suites that already run on Postgres (e.g., billing routes, VRA services) removed the stale ClickHouse commentary/mocks.
  - **Guardrails:** usage writes stay idempotent via append-only facts, analytics reads run exclusively on replicas with capped scan windows, and retention tiers auto-expire beyond 12 months.

### 1.4 Health checks + metrics
- `HealthCheckController` readiness now relies exclusively on Postgres/Redis guardrails, and Prometheus counters (`vra_query_fail_total`, etc.) no longer mention ClickHouse.
- **Plan**:
  1. Remove health-check dependency on ClickHouse client; base readiness purely on Postgres/Redis or new analytics tables. **Status:** ✅ `HealthCheckController` now issues direct Postgres probes (latency, replica lag via `pg_stat_replication`, staging pressure, cache hit ratio) and never instantiates the ClickHouse client; Redis remains a soft dependency.
  2. Rename metrics to `vra_query_fail_total` or similar to remove explicit ClickHouse terminology. **Status:** ✅ `backend/src/utils/prometheus.ts`, `monitoring/alerts/vra-alerts.yml`, Grafana dashboards, and the VRA runbook/summary docs now reference `vra_query_fail_total` while keeping the same alert thresholds.
  3. Backfill dashboards/runbooks so Postgres replica lag, queue depth, cache hit rate, and staging pressure are graphed next to health-check status. **Status:** Pending — health dashboards still need the new panels surfaced alongside `/ready`; runbook anchors capture the expectations but Grafana wiring is still outstanding.
  - **Guardrails:** health probes must measure replica lag, queue depth, and cache hit SLIs in addition to base connectivity; alerts cannot rely on single-node signals and must prove replica isolation remains intact.

### 1.5 Scripts/tests/workers
- Scripts under `backend/scripts` (transparency, VRA, clickhouse migrations) import ClickHouse helpers.
- Integration tests under `backend/tests/integration` spin up ClickHouse containers.
- **Plan**: delete ClickHouse bootstrap scripts/tests or port them to Postgres equivalents; update CI/workflow/Make targets accordingly.
  1. Remove ClickHouse bootstrap scripts (`initClickHouseSchema.ts`, `scripts/vra*.js`) or swap them to Postgres migrations + seeders. **Status:** ✅ `initClickHouseSchema.ts` and `runClickHouseMigrations.js` were deleted; remaining VRA scripts continue to exist until their Postgres rewrites land.
  2. Update integration tests to seed/query Postgres partitions instead of relying on a ClickHouse service in CI. **Status:** ✅ Both analytics (`backend/src/__tests__/integration/analytics.integration.test.ts`) and reporting (`backend/src/__tests__/integration/reporting.integration.test.ts`) suites now boot entirely against the Postgres fixtures, so CI no longer needs the ClickHouse container for these flows.
  3. Strip ClickHouse services from local/CI Compose stacks once all code/tests migrate. **Status:** Pending — `docker-compose.yml` and GitHub Actions continue to provision ClickHouse images.
  - **Guardrails:** run migrations through the versioned pipeline only, enforce PgBouncer usage in scripts/tests, keep sandbox fixtures append-only, and ensure CI verifies replica-only read paths before removing the ClickHouse container.

## 2. Infrastructure & Tooling

_Guardrail alignment:_ enforce HA+replica requirements, automate partition/retention workflows, and keep cost tiers visible inside Compose/Helm/Terraform.

- **Docker Compose / Make / start-dev**: remove `clickhouse` service (and the `clickhouse-data` volume) from root `docker-compose*.yml`, `scripts/dev-transparency-metrics.sh`, etc.
- **Helm charts / Terraform / Fly.toml**: drop `CLICKHOUSE_URL` secrets/envs and network policies referencing port 8123.
- **Monitoring stack**: update Prometheus scrape configs, Grafana datasources/dashboards, and alert rules to eliminate ClickHouse jobs/metrics. Replace runbook links.
- **CI workflows**: `.github/workflows/ci*.yml` currently spin up ClickHouse services; remove these and any env secrets (`STAGING_CLICKHOUSE_URL`, etc.).

## 3. Application layers beyond backend

_Guardrail alignment:_ console/website/ML layers must read from dedicated replicas or archived Parquet via gateways; when analytics scale out again, prefer CDC mirroring into ClickHouse/BigQuery instead of direct coupling.

- **Console app**: docs mention ClickHouse data sources; update to note Postgres analytics.
- **Website**: marketing copy references ClickHouse Cloud as a sub-processor; replace with Postgres (or remove).
- **ML**: `ML/scripts/etl_clickhouse.py` + tests need to switch to Postgres (likely via psycopg) or be deprecated.
- **Data schemas**: remove `data/schemas/clickhouse*.sql` and replace with Postgres schema files if needed.

## 4. Dependencies & Configuration

_Guardrail alignment:_ keep `@clickhouse/client` removed, introduce PgBouncer requirements, and ensure `.env` templates codify connection caps, WAL settings, and cache-first toggles.

- Remove `@clickhouse/client` from `package.json` (backend + repo root) and delete any Go module packages referencing ClickHouse clients.
- Update `.env.example`, README, CHANGELOG, PRODUCTION readiness docs to reflect the Postgres-only stack.
- Introduce `REPLICA_DATABASE_URL`, `REPLICA_DB_POOL_SIZE`, and `REPORTING_SLOW_QUERY_MS`/`QUALITY_SLOW_QUERY_MS` knobs in `.env` scaffolding so services can target read replicas and set guardrail-trigger thresholds. Document the new Prometheus metrics (`db_query_duration_seconds{replica="true"}` and `analytics_ingest_buffer_size`).
- Audit code for `CLICKHOUSE_` env vars and delete them (or map them to new Postgres settings when absolutely required).

## 5. Validation checklist

_Guardrail alignment:_ validation now checks replica lag, autovacuum health, partition management, cache hit ratios, and SLO adherence—not just "tests pass"—so we know the guardrails hold.

1. Database migrations apply cleanly (including new analytics tables) and backfill scripts run without ClickHouse.
2. All Jest/Playwright/Go tests pass without mocking/stubbing ClickHouse.
3. `npm run lint`, `npm test`, backend integration tests succeed in environments without ClickHouse containers.
4. Monitoring dashboards/alerts have no dangling ClickHouse queries.
5. Documentation (internal & public) no longer instructs operators to provision ClickHouse.
6. CHANGELOG & production-readiness checklist updated to call out the Postgres migration.

This plan covers every observed ClickHouse touch-point; implementation will proceed workstream-by-workstream until the dependency is entirely removed.
