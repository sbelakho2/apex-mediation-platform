import dotenv from 'dotenv';
import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import logger from './logger';

dotenv.config();

const defaultTestConnection = 'postgresql://postgres:postgres@localhost:5432/apexmediation_test';
const connectionString = process.env.DATABASE_URL ?? (process.env.NODE_ENV === 'test' ? defaultTestConnection : undefined);

if (!connectionString) {
  throw new Error('DATABASE_URL environment variable is not configured.');
}

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = connectionString;
}

if (!process.env.TEST_DATABASE_URL && process.env.NODE_ENV === 'test') {
  process.env.TEST_DATABASE_URL = connectionString;
}

const useSsl = process.env.DATABASE_SSL === 'true';
const poolMax = parseInt(process.env.DATABASE_POOL_MAX || '20', 10); // Increased from 10 to 20
const poolMin = parseInt(process.env.DATABASE_POOL_MIN || '2', 10); // Minimum connections
const idleTimeout = parseInt(process.env.DATABASE_POOL_IDLE_MS || '30000', 10);
const connectionTimeout = parseInt(process.env.DATABASE_CONNECTION_TIMEOUT_MS || '5000', 10);
const statementTimeout = parseInt(process.env.DATABASE_STATEMENT_TIMEOUT_MS || '30000', 10); // 30 second query timeout

const pool = new Pool({
  connectionString,
  ssl: useSsl ? { rejectUnauthorized: false } : undefined,
  max: poolMax, // Maximum pool size (default: 20)
  min: poolMin, // Minimum pool size (default: 2)
  idleTimeoutMillis: idleTimeout, // How long idle clients stay in pool (default: 30s)
  connectionTimeoutMillis: connectionTimeout, // How long to wait for connection (default: 5s)
  statement_timeout: statementTimeout, // Query timeout in ms (default: 30s)
});

pool.on('error', (error: Error) => {
  logger.error('Unexpected database error', {
    error: error.message,
    stack: error.stack,
  });
});

pool.on('connect', () => {
  logger.debug('New database connection established');
});

pool.on('acquire', () => {
  logger.debug('Connection acquired from pool');
});

pool.on('remove', () => {
  logger.debug('Connection removed from pool');
});

export const query = <T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: ReadonlyArray<unknown>
): Promise<QueryResult<T>> => {
  // Add query timeout wrapper
  const timeoutMs = parseInt(process.env.DATABASE_STATEMENT_TIMEOUT_MS || '30000', 10);
  
  const queryPromise = params && params.length > 0
    ? pool.query<T>(text, [...params])
    : pool.query<T>(text);

  // Wrap with timeout
  return Promise.race([
    queryPromise,
    new Promise<QueryResult<T>>((_, reject) => 
      setTimeout(() => reject(new Error(`Query timeout after ${timeoutMs}ms`)), timeoutMs)
    )
  ]);
};

export const getClient = (): Promise<PoolClient> => pool.connect();

export const initializeDatabase = async (): Promise<void> => {
  const client = await pool.connect();

  try {
    await client.query('SELECT 1');
    logger.info('Successfully connected to PostgreSQL');
  } finally {
    client.release();
  }
};

export default pool;
