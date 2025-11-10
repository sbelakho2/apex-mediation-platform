import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { Client } from 'pg';

// Allow lightweight suites (e.g., pure HTTP contract tests) to skip
// full database initialization by exporting SKIP_DB_SETUP=true before
// invoking Jest. This keeps legacy integration tests unchanged while
// enabling fast CORS/health-check coverage without a running Postgres.
const skipDbSetup = process.env.SKIP_DB_SETUP === 'true';

let dbPool: import('pg').Pool | null = null;

const ensureDatabaseExists = async (connectionString: string): Promise<void> => {
  const dbUrl = new URL(connectionString);
  const databaseName = dbUrl.pathname.replace('/', '');

  if (!databaseName) {
    throw new Error('Unable to determine database name from connection string.');
  }

  if (!/^[A-Za-z0-9_]+$/.test(databaseName)) {
    throw new Error(`Refusing to create database with unsafe name: ${databaseName}`);
  }

  const adminUrl = new URL(connectionString);
  adminUrl.pathname = '/postgres';

  const client = new Client({ connectionString: adminUrl.toString() });

  try {
    await client.connect();
    const result = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [databaseName]);
    if (result.rowCount === 0) {
      await client.query(`CREATE DATABASE "${databaseName}"`);
    }
  } finally {
    await client.end();
  }
};

// Initialize database connection before all tests
beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  if (!process.env.JWT_SECRET) {
    process.env.JWT_SECRET = 'test-access-secret';
  }
  if (!process.env.JWT_REFRESH_SECRET) {
    process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
  }
  if (!process.env.JWT_EXPIRES_IN) {
    process.env.JWT_EXPIRES_IN = '1h';
  }
  if (!process.env.REFRESH_TOKEN_EXPIRES_IN) {
    process.env.REFRESH_TOKEN_EXPIRES_IN = '7d';
  }
  if (skipDbSetup) {
    return;
  }

  // Ensure both DATABASE_URL and TEST_DATABASE_URL are present before importing the pool
  const resolvedDbUrl =
    process.env.DATABASE_URL ||
    process.env.TEST_DATABASE_URL ||
    'postgresql://postgres:postgres@localhost:5432/apexmediation_test';
  await ensureDatabaseExists(resolvedDbUrl);
  process.env.DATABASE_URL = resolvedDbUrl;
  process.env.TEST_DATABASE_URL = resolvedDbUrl;

  const postgres = await import('../utils/postgres');

  // Initialize the database connection pool
  await postgres.initializeDatabase();
  dbPool = postgres.default;
  const projectRoot = path.resolve(__dirname, '..', '..');
  // Apply database migrations to ensure schema is up to date for tests
  execFileSync('node', ['scripts/runMigrations.js'], {
    stdio: 'inherit',
    cwd: projectRoot,
    env: process.env,
  });
}, 30000); // 30 second timeout for database initialization

// Close database connection after all tests complete
afterAll(async () => {
  if (skipDbSetup || !dbPool) {
    return;
  }
  await dbPool.end();
}, 10000);


