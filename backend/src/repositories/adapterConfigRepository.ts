import { QueryResult } from 'pg';
import { query } from '../utils/postgres';

export interface AdapterConfigRecord {
  id: string;
  publisher_id: string;
  adapter_id: string;
  config: Record<string, unknown>;
  updated_at: Date;
}

export interface AdapterConfigWithDetails extends AdapterConfigRecord {
  adapter_name: string;
  adapter_enabled: boolean;
}

export interface CreateAdapterConfigInput {
  publisher_id: string;
  adapter_id: string;
  config: Record<string, unknown>;
}

export interface UpdateAdapterConfigInput {
  config: Record<string, unknown>;
}

/**
 * Find all adapter configs for a publisher
 */
export const findByPublisherId = async (
  publisherId: string
): Promise<AdapterConfigWithDetails[]> => {
  const result: QueryResult<AdapterConfigWithDetails> = await query<AdapterConfigWithDetails>(
    `SELECT 
      ac.id,
      ac.publisher_id,
      ac.adapter_id,
      ac.config,
      ac.updated_at,
      a.name as adapter_name,
      a.enabled as adapter_enabled
     FROM adapter_configs ac
     JOIN adapters a ON a.id = ac.adapter_id
     WHERE ac.publisher_id = $1
     ORDER BY a.name ASC`,
    [publisherId]
  );

  return result.rows;
};

/**
 * Find a specific adapter config by ID
 */
export const findById = async (
  id: string,
  publisherId: string
): Promise<AdapterConfigWithDetails | null> => {
  const result: QueryResult<AdapterConfigWithDetails> = await query<AdapterConfigWithDetails>(
    `SELECT 
      ac.id,
      ac.publisher_id,
      ac.adapter_id,
      ac.config,
      ac.updated_at,
      a.name as adapter_name,
      a.enabled as adapter_enabled
     FROM adapter_configs ac
     JOIN adapters a ON a.id = ac.adapter_id
     WHERE ac.id = $1 AND ac.publisher_id = $2`,
    [id, publisherId]
  );

  return result.rows[0] || null;
};

/**
 * Find adapter config by publisher and adapter
 */
export const findByPublisherAndAdapter = async (
  publisherId: string,
  adapterId: string
): Promise<AdapterConfigWithDetails | null> => {
  const result: QueryResult<AdapterConfigWithDetails> = await query<AdapterConfigWithDetails>(
    `SELECT 
      ac.id,
      ac.publisher_id,
      ac.adapter_id,
      ac.config,
      ac.updated_at,
      a.name as adapter_name,
      a.enabled as adapter_enabled
     FROM adapter_configs ac
     JOIN adapters a ON a.id = ac.adapter_id
     WHERE ac.publisher_id = $1 AND ac.adapter_id = $2`,
    [publisherId, adapterId]
  );

  return result.rows[0] || null;
};

/**
 * Create a new adapter config
 */
export const create = async (
  input: CreateAdapterConfigInput
): Promise<AdapterConfigRecord> => {
  const result: QueryResult<AdapterConfigRecord> = await query<AdapterConfigRecord>(
    `INSERT INTO adapter_configs (publisher_id, adapter_id, config)
     VALUES ($1, $2, $3)
     RETURNING id, publisher_id, adapter_id, config, updated_at`,
    [input.publisher_id, input.adapter_id, JSON.stringify(input.config)]
  );

  return result.rows[0];
};

/**
 * Update an existing adapter config
 */
export const update = async (
  id: string,
  publisherId: string,
  input: UpdateAdapterConfigInput
): Promise<AdapterConfigRecord | null> => {
  const result: QueryResult<AdapterConfigRecord> = await query<AdapterConfigRecord>(
    `UPDATE adapter_configs
     SET config = $1, updated_at = NOW()
     WHERE id = $2 AND publisher_id = $3
     RETURNING id, publisher_id, adapter_id, config, updated_at`,
    [JSON.stringify(input.config), id, publisherId]
  );

  return result.rows[0] || null;
};

/**
 * Delete an adapter config
 */
export const deleteById = async (
  id: string,
  publisherId: string
): Promise<boolean> => {
  const result = await query(
    `DELETE FROM adapter_configs
     WHERE id = $1 AND publisher_id = $2`,
    [id, publisherId]
  );

  return (result.rowCount ?? 0) > 0;
};
