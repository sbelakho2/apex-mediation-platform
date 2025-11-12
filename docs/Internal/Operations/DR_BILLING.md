Disaster Recovery — Billing

Objectives
- RPO ≤ 24 hours, RTO ≤ 4 hours for billing-critical data and services.

Scope
- Postgres billing tables: usage_events, billing_audit, reconciliation artifacts.
- ClickHouse usage aggregates used for billing.
- Object storage for privacy export bundles (non-critical for DR objectives).

Backups
- Postgres: automated daily snapshots (retain 14–30 days depending on environment). Point-in-time recovery (PITR) enabled if supported by provider.
- ClickHouse: daily backups of partitions used for billing windows; schema-as-code in repo; migration runners.
- Object storage: versioning enabled where supported.

Restore Procedures
1) Postgres
   - Identify restore point (last good snapshot ≤ 24h old).
   - Restore to new instance; run migrations to current; flip application `DATABASE_URL` via environment.
   - Verify health checks and targeted queries (counts per day, sample invoices).
2) ClickHouse
   - Restore partitions for affected windows; verify rollups and materialized views.
   - Re-run aggregation backfills if required.

Quarterly DR Drill
- Runbook validation every quarter: simulate accidental deletion of a subset and perform full restore.
- Record timings; ensure RTO ≤ 4h; update this doc with findings.

Contacts & Ownership
- Primary: Backend Billing Owner
- Secondary: SRE On-call

References
- Terraform/IaC: infrastructure/terraform/* (DB snapshots/retention, IAM, storage classes)
- Migrations: backend/scripts/runMigrationsV2.js
