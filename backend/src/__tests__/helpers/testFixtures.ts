import { Pool } from 'pg';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';

export interface TestPublisher {
  id: string;
  companyName: string;
}

export interface TestUser {
  id: string;
  email: string;
  password: string;
  publisherId: string;
}

export interface TestAdapter {
  id: string;
  name: string;
  enabled: boolean;
}

/**
 * Create a test publisher
 */
export const createTestPublisher = async (
  pool: Pool,
  data: Partial<TestPublisher> = {}
): Promise<TestPublisher> => {
  const publisher = {
    id: data.id || randomUUID(),
    companyName: data.companyName || `Test Publisher Co ${randomUUID().slice(0, 8)}`,
  };

  await pool.query(
    `INSERT INTO publishers (id, company_name) VALUES ($1, $2)`,
    [publisher.id, publisher.companyName]
  );

  return publisher;
};

/**
 * Create a test user
 */
export const createTestUser = async (
  pool: Pool,
  publisherId: string,
  data: Partial<TestUser> = {}
): Promise<TestUser> => {
  const password = data.password || 'password123';
  const passwordHash = await bcrypt.hash(password, 10);

  const user = {
    id: data.id || randomUUID(),
    email: data.email || `test-${randomUUID()}@example.com`,
    password,
    publisherId,
  };

  await pool.query(
    `INSERT INTO users (id, publisher_id, email, password_hash) VALUES ($1, $2, $3, $4)`,
    [user.id, publisherId, user.email, passwordHash]
  );

  return user;
};

/**
 * Create a test adapter
 */
export const createTestAdapter = async (
  pool: Pool,
  data: Partial<TestAdapter> = {}
): Promise<TestAdapter> => {
  const adapter = {
    id: data.id || randomUUID(),
    name: data.name || `Test Adapter ${randomUUID().slice(0, 8)}`,
    enabled: data.enabled ?? true,
  };

  await pool.query(
    `INSERT INTO adapters (id, name, enabled) VALUES ($1, $2, $3)`,
    [adapter.id, adapter.name, adapter.enabled]
  );

  return adapter;
};

/**
 * Create a test app
 */
export const createTestApp = async (
  pool: Pool,
  publisherId: string,
  appId?: string
): Promise<string> => {
  const id = appId || randomUUID();

  await pool.query(
    `INSERT INTO apps (id, publisher_id, name, platform) VALUES ($1, $2, $3, $4)`,
    [id, publisherId, 'Test App', 'ios']
  );

  return id;
};

/**
 * Create a test placement
 */
export const createTestPlacement = async (
  pool: Pool,
  appId: string,
  placementId?: string
): Promise<string> => {
  const id = placementId || randomUUID();

  await pool.query(
    `INSERT INTO placements (id, app_id, name, ad_type) VALUES ($1, $2, $3, $4)`,
    [id, appId, 'Test Placement', 'banner']
  );

  return id;
};

/**
 * Create a test adapter config
 */
export const createTestAdapterConfig = async (
  pool: Pool,
  publisherId: string,
  adapterId: string,
  config: Record<string, unknown> = {}
): Promise<string> => {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO adapter_configs (publisher_id, adapter_id, config) 
     VALUES ($1, $2, $3) 
     RETURNING id`,
    [publisherId, adapterId, JSON.stringify(config)]
  );

  return result.rows[0].id;
};
