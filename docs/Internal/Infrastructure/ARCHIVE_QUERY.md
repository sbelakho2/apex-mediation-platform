# Archive Query Runbook (DuckDB / Parquet)

## Purpose
Legacy ClickHouse readers are gone, so detached analytics partitions must remain queryable without putting load back on Postgres. This runbook explains how operators export historical slices via the Postgres-backed Data Export APIs and query the resulting Parquet objects with DuckDB (locally or in a jump box) while keeping costs deterministic.

## Export workflow
1. Request a Parquet export via the backend API (Console also wraps this flow). The payload mirrors `backend/src/services/dataExportService.ts`:

```bash
curl -X POST https://api.example.com/api/v1/data-export/jobs \
  -H "Authorization: Bearer <publisher-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "dataType": "impressions",
    "format": "parquet",
    "destination": {
      "type": "s3",
      "bucket": "apex-analytics-archive",
      "path": "detached/2024-11/impressions_%Y%m%d.parquet"
    },
    "startDate": "2024-11-01",
    "endDate": "2024-11-30"
  }'
```

2. Poll `GET /api/v1/data-export/jobs/{jobId}` until `status` becomes `completed`. Jobs surface in Console → Exports as well.
3. Download the Parquet object from S3/GCS (or let warehouse sync deliver it to BigQuery/Snowflake). Example for S3:

```bash
aws s3 cp s3://apex-analytics-archive/detached/2024-11/impressions_20241101.parquet ./archive/
```

Exports inherit the warehouse retention policy (90 days hot in S3 Standard, then Glacier Deep Archive). Files land under `/tmp/ad-exports` before upload; the worker removes them on success to avoid leaking disk.

## Querying with DuckDB
DuckDB reads the Parquet file with zero extra services:

```bash
cd archive
cat <<'SQL' > query.duckdb
INSTALL httpfs;
LOAD httpfs;
-- Set credentials only when querying directly from object storage
-- SET s3_region='us-east-1';
-- SET s3_access_key_id='<access-key>';
-- SET s3_secret_access_key='<secret>';
CREATE OR REPLACE TABLE impressions AS
  SELECT * FROM read_parquet('impressions_20241101.parquet');
SELECT publisher_id, SUM(revenue) AS usd_revenue
FROM impressions
GROUP BY 1
ORDER BY usd_revenue DESC
LIMIT 20;
SQL

duckdb --batch < query.duckdb
```

Tips:
- DuckDB can read directly from `s3://` URLs once `httpfs` is installed and credentials/environment variables are set. Keep IAM policies read-only.
- If analysts prefer Postgres access, mount DuckDB as a foreign table via `parquet_fdw` using the same Parquet artifacts (documented in `docs/Internal/Infrastructure/POSTGRES_MIGRATION_PLAN.md`).

## Operational guardrails
- **Who runs it:** Data Platform on-call (same rotation that owned ClickHouse).
- **When to use:** auditors requesting >90 day lookbacks, debugging historical regressions, or recomputing ML features outside Postgres retention windows.
- **Cost control:** exports stream from the read replica using `streamQuery` cursors, keeping primary load flat. Large exports must set a bounded `startDate`/`endDate`; the service enforces `DATA_EXPORT_MAX_ROWS` (default 1M rows).
- **Auditability:** every job, download URL, and warehouse sync event is stored in `data_export_jobs` / `data_export_warehouse_syncs` tables and surfaced via the API so security can review who accessed long-term archives.

This satisfies Step 7 of the Post-Migration 12-Step Checklist: cold data flows to Parquet, and teams can interrogate it through DuckDB/FDW gateways without reintroducing ClickHouse.
