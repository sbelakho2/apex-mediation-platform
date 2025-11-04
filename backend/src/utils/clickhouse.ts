/**
 * ClickHouse Connection Utility
 * 
 * Manages connection to ClickHouse for high-volume analytics data:
 * - Ad impressions and clicks
 * - Revenue events
 * - Performance metrics
 * - Real-time reporting
 */

import { createClient, ClickHouseClient } from '@clickhouse/client';
import logger from './logger';

let client: ClickHouseClient | null = null;

interface ClickHouseConfig {
  host: string;
  username?: string;
  password?: string;
  database?: string;
  application?: string;
  max_open_connections?: number;
}

/**
 * Initialize ClickHouse client connection
 */
export const initializeClickHouse = async (): Promise<void> => {
  try {
    const config: ClickHouseConfig = {
      host: process.env.CLICKHOUSE_URL || 'http://localhost:8123',
      username: process.env.CLICKHOUSE_USER || 'default',
      password: process.env.CLICKHOUSE_PASSWORD || '',
      database: process.env.CLICKHOUSE_DATABASE || 'apexmediation',
      application: 'apexmediation-api',
      max_open_connections: parseInt(process.env.CLICKHOUSE_MAX_CONNECTIONS || '10'),
    };

    client = createClient(config);

    // Test connection
    const result = await client.query({
      query: 'SELECT 1 as test',
      format: 'JSONEachRow',
    });

    await result.json();
    logger.info('Successfully connected to ClickHouse', { 
      database: config.database,
      host: config.host 
    });
  } catch (error) {
    logger.error('Failed to connect to ClickHouse', { error });
    throw error;
  }
};

/**
 * Get ClickHouse client instance
 * @throws Error if client not initialized
 */
export const getClickHouseClient = (): ClickHouseClient => {
  if (!client) {
    throw new Error('ClickHouse client not initialized. Call initializeClickHouse() first.');
  }
  return client;
};

/**
 * Check if ClickHouse is healthy
 */
export const checkClickHouseHealth = async (): Promise<boolean> => {
  try {
    if (!client) {
      return false;
    }

    const result = await client.query({
      query: 'SELECT 1',
      format: 'JSONEachRow',
    });

    await result.json();
    return true;
  } catch (error) {
    logger.error('ClickHouse health check failed', { error });
    return false;
  }
};

/**
 * Execute a query with error handling
 */
export const executeQuery = async <T = unknown>(
  query: string,
  params?: Record<string, unknown>
): Promise<T[]> => {
  try {
    const clickhouse = getClickHouseClient();
    
    const result = await clickhouse.query({
      query,
      query_params: params,
      format: 'JSONEachRow',
    });

  return await result.json<T>();
  } catch (error) {
    logger.error('ClickHouse query failed', { query, error });
    throw error;
  }
};

/**
 * Insert data in batch
 */
export const insertBatch = async (
  table: string,
  data: unknown[]
): Promise<void> => {
  if (data.length === 0) {
    return;
  }

  try {
    const clickhouse = getClickHouseClient();
    
    await clickhouse.insert({
      table,
      values: data,
      format: 'JSONEachRow',
    });

    logger.debug('Batch insert successful', { 
      table, 
      rows: data.length 
    });
  } catch (error) {
    logger.error('ClickHouse batch insert failed', { 
      table, 
      rows: data.length,
      error 
    });
    throw error;
  }
};

/**
 * Close ClickHouse connection
 */
export const closeClickHouse = async (): Promise<void> => {
  if (client) {
    await client.close();
    client = null;
    logger.info('ClickHouse connection closed');
  }
};

export default {
  initializeClickHouse,
  getClickHouseClient,
  checkClickHouseHealth,
  executeQuery,
  insertBatch,
  closeClickHouse,
};
