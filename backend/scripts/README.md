# Backend Scripts — Operations and Safety

This directory contains operational scripts. Read carefully before running in any environment.

## Data retention and purging

- `scripts/cron-jobs.ts` runs scheduled jobs including a daily purge at 02:30 that deletes usage/audit data older than `USAGE_RETENTION_MONTHS` (default 18).
- `scripts/purge-old-usage.ts` is a manual utility to inspect and optionally delete usage data older than `RETENTION_MONTHS`.

Environment flags:
- `USAGE_RETENTION_MONTHS` — months to retain (cron purge). Default: `18`.
- `RETENTION_MONTHS` — months to retain (manual purge script). Default: `18`.
- `CONFIRM=1` — required to execute destructive deletes in `purge-old-usage.ts` (otherwise dry-run).
- `DATABASE_URL` — Postgres connection string.

Indexes supporting purges:
- See migration `backend/migrations/postgres/20251112_023000_usage_retention_indexes.up.sql`, which adds indexes on `usage_events.created_at` and `billing_audit.created_at` to speed up purges.

Safety:
- Always run in dry-run (without `CONFIRM`) first and review counts.
- Consider off-peak windows for large deletions.

## Privacy exports

Privacy/GDPR export/delete jobs are processed by workers under `src/queues/processors/privacy.ts`. Configure via:
- `PRIVACY_EXPORT_PROVIDER` — `local` | `s3` | `gcs` (default `local`)
- `PRIVACY_EXPORT_BUCKET` — bucket name (S3 or GCS)
- `PRIVACY_EXPIRY_DAYS` — retention before exports expire (default 30)

Exports are stored:
- Local: `logs/exports/...`
- S3: `s3://${PRIVACY_EXPORT_BUCKET}/privacy-exports/<tenant>/<user>/<ts>.jsonl`
- GCS: `gs://${PRIVACY_EXPORT_BUCKET}/privacy-exports/<tenant>/<user>/<ts>.jsonl`

## Stripe usage sync and dunning

- Daily Stripe usage sync and dunning retries are scheduled in `cron-jobs.ts` at 02:00 and 03:00.
- Ensure Stripe credentials are configured via secret store (Infisical/GitHub Environments). Refer to `docs/Internal/Operations/STRIPE_KEYS_ROTATION.md` for rotation guidance.
