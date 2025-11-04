// Jest setup for integration tests
import { initializeDatabase } from '../utils/postgres';
import pool from '../utils/postgres';
import { execSync } from 'node:child_process';

// Initialize database connection before all tests
beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  // Ensure both DATABASE_URL and TEST_DATABASE_URL point to the same test database
  const testDbUrl = process.env.TEST_DATABASE_URL || 'postgresql://localhost:5432/apexmediation_test';
  process.env.DATABASE_URL = testDbUrl;
  process.env.TEST_DATABASE_URL = testDbUrl;
  
  // Initialize the database connection pool
  await initializeDatabase();
  // Apply database migrations to ensure schema is up to date for tests
  execSync('node scripts/runMigrations.js', { stdio: 'inherit', cwd: process.cwd() });
}, 30000); // 30 second timeout for database initialization

// Close database connection after all tests complete
afterAll(async () => {
  await pool.end();
}, 10000);


