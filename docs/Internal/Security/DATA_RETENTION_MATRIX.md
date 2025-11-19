# Data Retention & Deletion SLAs

> **VERIFY-FIRST:** Part 0 requires dataset-specific retention and deletion guarantees. This matrix maps every major dataset to its retention window, deletion SLA, enforcement mechanism, and evidence.

| Dataset / Table | Retention Window | Deletion SLA | Enforcement Mechanism | Owner | Evidence |
| --- | --- | --- | --- | --- | --- |
| Usage events (`postgres.billing_usage_events`) | 18 months (configurable) | 7 days from request | Nightly cron `scripts/cron-jobs.ts` purges partitions; migration `20251112_023000_usage_retention_indexes.up.sql`. | Billing Eng | `backend/scripts/cron-jobs.ts`, `backend/migrations/postgres/20251112_023000_usage_retention_indexes.up.sql` |
| Transparency receipts (`clickhouse.transparency_receipts`) | 365 days | 48 hours (GDPR delete) | ClickHouse TTL clauses; deletion worker replays hash references to redact request IDs. | Privacy Eng | `docs/Transparency/VERIFY.md`, `backend/src/utils/clickhouse.schema.ts` |
| Auction logs (`clickhouse.auction_logs`, Loki traces) | 30 days raw, 180 days aggregated | 72 hours | Loki retention config + ClickHouse TTL; `monitoring/loki-config.yml`, `monitoring/prometheus.yml`. | SRE | `monitoring/loki-config.yml`, `monitoring/prometheus.yml` |
| SDK telemetry + paid events (`analytics.sdk_events`) | 90 days raw, 1 year aggregated | 7 days | ClickHouse TTL defined in `data/schemas/clickhouse_migration.sql`; redaction + aggregation workflow documented in `docs/Internal/Development/ANALYTICS_IMPLEMENTATION.md`. | Data Eng | `data/schemas/clickhouse_migration.sql`, `docs/Internal/Development/ANALYTICS_IMPLEMENTATION.md` |
| Billing documents (`financial_documents` S3 bucket) | 7 years (Estonian Accounting Act §13) | 30 days (manual correction) | S3 Object Lock (COMPLIANCE mode) via Terraform; tracked in `docs/Internal/Deployment/ACCOUNTING_IMPLEMENTATION_STATUS.md`. | Finance Ops | `docs/Internal/Deployment/ACCOUNTING_IMPLEMENTATION_STATUS.md` |
| Privacy exports (`privacy-exports/*`) | 30 days | 24 hours | Expiry enforced by lifecycle policy + worker job `backend/src/queues/processors/privacy.ts`. | Privacy Eng | `backend/src/queues/processors/privacy.ts` |
| Support logs (`logs/*.log`, `monitoring/loki`) | 14 days | 24 hours | `monitoring/loki-config.yml` retention + logrotate config in `scripts/logrotate.conf`. | SRE | `monitoring/loki-config.yml`, `scripts/logrotate.conf` |

## Deletion Workflow Summary

1. **User/tenant submits request** via `/api/v1/privacy/delete`.
2. **Privacy worker** enqueues the delete job, removing PII from Postgres/ClickHouse and requesting S3 object deletes where applicable.
3. **Audit log** entry recorded in `billing_audit` with timestamp + operator.
4. **Verification**: run `npm run privacy:audit -- --tenant <id>` to confirm datasets comply; attach output to ticket.

Retention configs are version-controlled; any changes require updating this matrix plus `docs/Internal/Security/DATA_MAP.md`.
