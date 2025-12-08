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

const BASE_SELECT = `
  SELECT p.id, p.app_id, p.name, p.type, p.status, p.created_at,
         COALESCE(p.config, '{}'::jsonb) as config
  FROM placements p
  JOIN apps a ON a.id = p.app_id
`;

export async function list(publisherId: string, limit = 50, offset = 0): Promise<PlacementRow[]> {
  const sql = `
    ${BASE_SELECT}
    WHERE a.publisher_id = $3
    ORDER BY p.created_at DESC
    LIMIT $1 OFFSET $2
  `;
  const res = await query<PlacementRow>(sql, [limit, offset, publisherId]);
  return res.rows;
}

export async function listAll(publisherId: string): Promise<PlacementRow[]> {
  const sql = `
    ${BASE_SELECT}
    WHERE a.publisher_id = $1
    ORDER BY p.created_at DESC
  `;
  const res = await query<PlacementRow>(sql, [publisherId]);
  return res.rows;
}

export async function getById(publisherId: string, id: string): Promise<PlacementRow | null> {
  const sql = `
    ${BASE_SELECT}
    WHERE p.id = $1 AND a.publisher_id = $2
  `;
  const res = await query<PlacementRow>(sql, [id, publisherId]);
  return res.rows[0] || null;
}

export async function create(
  publisherId: string,
  input: { appId: string; name: string; type: string; status?: string; config?: any }
): Promise<PlacementRow | null> {
  const sql = `
    INSERT INTO placements (app_id, name, type, status, config)
    SELECT $1, $2, $3, COALESCE($4, 'active'), COALESCE($5, '{}'::jsonb)
    WHERE EXISTS (
      SELECT 1 FROM apps WHERE id = $1 AND publisher_id = $6
    )
    RETURNING id, app_id, name, type, status, created_at, COALESCE(config, '{}'::jsonb) as config
  `;
  const res = await query<PlacementRow>(sql, [
    input.appId,
    input.name,
    input.type,
    input.status ?? null,
    input.config ?? null,
    publisherId,
  ]);
  return res.rows[0] || null;
}

export async function update(
  publisherId: string,
  id: string,
  patch: Partial<PlacementRow>
): Promise<PlacementRow | null> {
  const fields: string[] = [];
  const values: any[] = [];
  let i = 1;
  if (typeof patch.name === 'string') { fields.push(`name = $${i++}`); values.push(patch.name); }
  if (typeof patch.status === 'string') { fields.push(`status = $${i++}`); values.push(patch.status); }
  if (typeof patch.type === 'string') { fields.push(`type = $${i++}`); values.push(patch.type); }
  if (fields.length === 0) return await getById(publisherId, id);

  const sql = `
    UPDATE placements p
    SET ${fields.join(', ')}
    FROM apps a
    WHERE p.id = $${i} AND a.id = p.app_id AND a.publisher_id = $${i + 1}
    RETURNING p.id, p.app_id, p.name, p.type, p.status, p.created_at, COALESCE(p.config, '{}'::jsonb) as config
  `;
  values.push(id, publisherId);
  const res = await query<PlacementRow>(sql, values);
  return res.rows[0] || null;
}

export async function patchConfig(
  publisherId: string,
  id: string,
  incoming: any
): Promise<PlacementRow | null> {
  const existing = await getById(publisherId, id);
  if (!existing) return null;
  const currentConfig = existing.config ?? {};
  const merged = deepMerge(currentConfig, incoming ?? {});
  const sql = `
    UPDATE placements p
    SET config = $3
    FROM apps a
    WHERE p.id = $1 AND a.id = p.app_id AND a.publisher_id = $2
    RETURNING p.id, p.app_id, p.name, p.type, p.status, p.created_at, COALESCE(p.config, '{}'::jsonb) as config
  `;
  const res = await query<PlacementRow>(sql, [id, publisherId, JSON.stringify(merged)]);
  return res.rows[0] || null;
}

export async function deleteById(publisherId: string, id: string): Promise<boolean> {
  const sql = `
    DELETE FROM placements p
    USING apps a
    WHERE p.id = $1 AND a.id = p.app_id AND a.publisher_id = $2
  `;
  const res = await query(sql, [id, publisherId]);
  return (res.rowCount ?? 0) > 0;
}
