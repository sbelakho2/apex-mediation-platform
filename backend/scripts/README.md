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

## Sandbox bootstrap + Fake Networks

- `setupSandboxNetworks.js` backfills Apex Sandbox Studio logins (owner/dev/finance), adapter configs, waterfalls, and Stripe test customer/payment sources for FakeNetworkA/B/C.
- Run with `npm run sandbox:bootstrap --workspace backend` once `DATABASE_URL` (managed Postgres) and `STRIPE_SECRET_KEY` are set in `backend/.env`.
- The script is idempotent. It upserts adapters/configs before wiping/recreating waterfall configs for every sandbox placement; avoid running during active staging demos to prevent minute-long waterfall resets.
- Stripe provisioning requires the latest test secret (shared in the staging vault / owner handoff). ACH + SEPA bank tokens (`btok_us_verified`, `btok_sepa_debit`) are attached automatically.

## Sandbox revenue scenarios (Starter/Growth/Scale)

- `generateSandboxRevenue.js` synthesizes 30-day revenue for FakeNetworkA/B/C so Tier 0/1/2 demos show predictable totals (~$3k, ~$50k, ~$150k).
- Commands:
	- Starter: `npm run sandbox:revenue:starter --workspace backend -- --days=30`
	- Growth: `npm run sandbox:revenue:growth --workspace backend`
	- Scale: `npm run sandbox:revenue:scale --workspace backend`
- Flags:
	- `--days <N>` adjusts the backfill window (default 30 days).
	- `--start YYYY-MM-DD` pins the first event date instead of “today - (days-1)”.
	- `--dry-run` prints row counts/amounts without writing to Postgres.
	- `--keep-history` skips the safety delete (otherwise the targeted date range for the sandbox publisher is cleared before inserts).
- Always run `setupSandboxNetworks` first so placements/adapters exist. The revenue script only touches `revenue_events` for publisher `138f62be-5cee-4c73-aba4-ba78ea77ab44`.
