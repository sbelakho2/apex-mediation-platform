import { query } from '../utils/postgres';
import deepMerge from '../utils/deepMerge';

export type PlacementRow = {
  id: string;
  app_id: string;
  name: string;
  type: string;
  status: string;
  created_at: string;
  config?: any;
};

export async function list(limit = 50, offset = 0): Promise<PlacementRow[]> {
  // Use COALESCE to be safe in non-migrated envs
  const sql = `
    SELECT id, app_id, name, type, status, created_at,
           COALESCE(config, '{}'::jsonb) as config
    FROM placements
    ORDER BY created_at DESC
    LIMIT $1 OFFSET $2
  `;
  const res = await query<PlacementRow>(sql, [limit, offset]);
  return res.rows;
}

export async function getById(id: string): Promise<PlacementRow | null> {
  const sql = `
    SELECT id, app_id, name, type, status, created_at,
           COALESCE(config, '{}'::jsonb) as config
    FROM placements
    WHERE id = $1
  `;
  const res = await query<PlacementRow>(sql, [id]);
  return res.rows[0] || null;
}

export async function create(input: { appId: string; name: string; type: string; status?: string; config?: any }): Promise<PlacementRow> {
  const sql = `
    INSERT INTO placements (app_id, name, type, status, config)
    VALUES ($1, $2, $3, COALESCE($4, 'active'), COALESCE($5, '{}'::jsonb))
    RETURNING id, app_id, name, type, status, created_at, COALESCE(config, '{}'::jsonb) as config
  `;
  const res = await query<PlacementRow>(sql, [input.appId, input.name, input.type, input.status ?? null, input.config ?? null]);
  return res.rows[0];
}

export async function update(id: string, patch: Partial<PlacementRow>): Promise<PlacementRow | null> {
  // Only allow updating name/status/type in this helper; use patchConfig for config.
  const fields: string[] = [];
  const values: any[] = [];
  let i = 1;
  if (typeof patch.name === 'string') { fields.push(`name = $${i++}`); values.push(patch.name); }
  if (typeof patch.status === 'string') { fields.push(`status = $${i++}`); values.push(patch.status); }
  if (typeof patch.type === 'string') { fields.push(`type = $${i++}`); values.push(patch.type); }
  if (fields.length === 0) return await getById(id);
  const sql = `
    UPDATE placements
    SET ${fields.join(', ')}
    WHERE id = $${i}
    RETURNING id, app_id, name, type, status, created_at, COALESCE(config, '{}'::jsonb) as config
  `;
  values.push(id);
  const res = await query<PlacementRow>(sql, values);
  return res.rows[0] || null;
}

export async function patchConfig(id: string, incoming: any): Promise<PlacementRow | null> {
  // Read existing, deep-merge, and write back
  const existing = await getById(id);
  if (!existing) return null;
  const currentConfig = existing.config ?? {};
  const merged = deepMerge(currentConfig, incoming ?? {});
  const sql = `
    UPDATE placements
    SET config = $2
    WHERE id = $1
    RETURNING id, app_id, name, type, status, created_at, COALESCE(config, '{}'::jsonb) as config
  `;
  const res = await query<PlacementRow>(sql, [id, JSON.stringify(merged)]);
  return res.rows[0] || null;
}
