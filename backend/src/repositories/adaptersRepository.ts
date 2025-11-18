import { QueryResult } from 'pg';
import { query } from '../utils/postgres';

/**
 * Lightweight repository for adapters table lookups.
 */
export interface AdapterRow {
  id: string;
  name: string;
  enabled?: boolean;
}

/**
 * Fetch adapter name by its UUID. Returns null if not found.
 */
export const getNameById = async (adapterId: string): Promise<string | null> => {
  const sql = `SELECT name FROM adapters WHERE id = $1 LIMIT 1`;
  const res: QueryResult<{ name: string }> = await query(sql, [adapterId]);
  return res.rows[0]?.name || null;
};
