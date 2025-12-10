# Supply Chain Snapshots

Purpose: persist per-publisher app-ads/sellers summaries for Console and auditing without re-running corpus evaluation every time.

## Storage
- Table: `supply_chain_snapshots` (migration `030_supply_chain_snapshots.sql`)
- Columns: `id` (uuid), `publisher_id` (uuid, FK), `summary` (jsonb), `generated_at` (timestamptz), `created_at` (timestamptz)
- Index: `(publisher_id, generated_at DESC)` for latest lookup
- Filesystem parity: JSON written to `data/weak-supervision/supply-chain/snapshots/{publisherId}.json` for weak-supervision tooling

## API
- Endpoint: `GET /api/v1/tools/supply-chain/summary`
  - Default: regenerates a summary from current placements, persists to DB + file, returns `{ summary, snapshotPath, snapshotId, persistedAt }`
  - `latestOnly=true`: returns the latest stored summary without recomputing; falls back to regeneration when none exist.
- Authorization: standard Console publisher auth

## Implementation notes
- Builder: `src/services/supplyChainSnapshotService.ts#buildSupplyChainSummary`
- Persistence: `src/repositories/supplyChainSnapshotRepository.ts` and `persistSupplyChainSummary`
- Consumers: Console Supply Chain tab via `toolsApi.getSupplyChainSummary`
- Cron/backfill: existing corpus refresh runs every 6h; this endpoint can be called post-refresh to lock a DB snapshot if needed.

## Operational
- Run migrations: `cd backend && npm run migrate` (or deploy pipeline equivalent)
- Inspect latest snapshot for a publisher: `SELECT summary, generated_at FROM supply_chain_snapshots WHERE publisher_id = '<pub_id>' ORDER BY generated_at DESC LIMIT 1;`
- File parity check: `jq '.publisherId,.generatedAt' data/weak-supervision/supply-chain/snapshots/<pub>.json`
