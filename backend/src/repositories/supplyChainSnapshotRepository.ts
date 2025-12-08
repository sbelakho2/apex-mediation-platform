import { query } from '../utils/postgres'

export type SupplyChainSnapshotRow = {
  id: string
  publisher_id: string
  summary: any
  generated_at: string
  created_at: string
}

export async function insertSnapshot(publisherId: string, summary: any, generatedAt?: string): Promise<SupplyChainSnapshotRow> {
  const sql = `
    INSERT INTO supply_chain_snapshots (publisher_id, summary, generated_at)
    VALUES ($1, $2, COALESCE($3, NOW()))
    RETURNING id, publisher_id, summary, generated_at, created_at
  `
  const res = await query<SupplyChainSnapshotRow>(sql, [publisherId, JSON.stringify(summary), generatedAt ?? null])
  return res.rows[0]
}

export async function getLatestSnapshot(publisherId: string): Promise<SupplyChainSnapshotRow | null> {
  const sql = `
    SELECT id, publisher_id, summary, generated_at, created_at
    FROM supply_chain_snapshots
    WHERE publisher_id = $1
    ORDER BY generated_at DESC
    LIMIT 1
  `
  const res = await query<SupplyChainSnapshotRow>(sql, [publisherId])
  return res.rows[0] || null
}
