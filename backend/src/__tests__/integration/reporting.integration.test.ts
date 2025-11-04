/**
 * Reporting Integration Tests
 * 
 * Tests reporting endpoints for ClickHouse analytics dashboard
 * 
 * Note: These tests require ClickHouse to be running and initialized.
 * They will be skipped if ClickHouse is not available.
 */

import request from 'supertest';
import { Pool } from 'pg';
import { Application } from 'express';
import { createTestApp } from '../helpers/testApp';
import {
  setupTestDatabase,
  teardownTestDatabase,
  cleanDatabase,
} from '../helpers/testDatabase';
import {
  createTestPublisher,
  createTestUser,
} from '../helpers/testFixtures';
import { checkClickHouseHealth } from '../../utils/clickhouse';

describe('Reporting API', () => {
  let pool: Pool;
  let app: Application;
  let authToken: string;
  let publisherId: string;
  let clickhouseAvailable = false;

  beforeAll(async () => {
    pool = await setupTestDatabase();
    app = createTestApp();
    
    // Check if ClickHouse is available
    try {
      clickhouseAvailable = await checkClickHouseHealth();
    } catch (error) {
      clickhouseAvailable = false;
    }
  });

  afterAll(async () => {
    await teardownTestDatabase();
  });

  beforeEach(async () => {
    if (!clickhouseAvailable) {
      // Skip all tests in this suite if ClickHouse not available
      return;
    }

    await cleanDatabase(pool);

    // Setup test data and authenticate
    const publisher = await createTestPublisher(pool);
    publisherId = publisher.id;

    const user = await createTestUser(pool, publisherId, {
      password: 'password123',
    });

    // Login to get auth token
    const loginResponse = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: user.email,
        password: user.password,
      });

    authToken = loginResponse.body.data.token;
  });

  // Skip entire suite if ClickHouse not available
  (clickhouseAvailable ? describe : describe.skip)('ClickHouse-dependent tests', () => {

  describe('GET /api/v1/reporting/overview', () => {
    it('should return revenue overview stats', async () => {
      const response = await request(app)
        .get('/api/v1/reporting/overview')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('totalRevenue');
      expect(response.body.data).toHaveProperty('totalImpressions');
      expect(response.body.data).toHaveProperty('totalClicks');
      expect(response.body.data).toHaveProperty('avgEcpm');
      expect(response.body.data).toHaveProperty('avgCtr');
      expect(response.body.data).toHaveProperty('period');
    });

    it('should accept date range parameters', async () => {
      const startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const endDate = new Date().toISOString();

      const response = await request(app)
        .get('/api/v1/reporting/overview')
        .query({ startDate, endDate })
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.data.period.startDate).toBe(startDate);
      expect(response.body.data.period.endDate).toBe(endDate);
    });

    it('should require authentication', async () => {
      await request(app)
        .get('/api/v1/reporting/overview')
        .expect(401);
    });
  });

  describe('GET /api/v1/reporting/timeseries', () => {
    it('should return time series data', async () => {
      const response = await request(app)
        .get('/api/v1/reporting/timeseries')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('series');
      expect(response.body.data).toHaveProperty('granularity');
      expect(Array.isArray(response.body.data.series)).toBe(true);
    });

    it('should support granularity parameter', async () => {
      const response = await request(app)
        .get('/api/v1/reporting/timeseries')
        .query({ granularity: 'hour' })
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.data.granularity).toBe('hour');
    });

    it('should reject invalid granularity', async () => {
      await request(app)
        .get('/api/v1/reporting/timeseries')
        .query({ granularity: 'invalid' })
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);
    });
  });

  describe('GET /api/v1/reporting/adapters', () => {
    it('should return adapter performance breakdown', async () => {
      const response = await request(app)
        .get('/api/v1/reporting/adapters')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('adapters');
      expect(Array.isArray(response.body.data.adapters)).toBe(true);
    });
  });

  describe('GET /api/v1/reporting/countries', () => {
    it('should return country breakdown', async () => {
      const response = await request(app)
        .get('/api/v1/reporting/countries')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('countries');
      expect(Array.isArray(response.body.data.countries)).toBe(true);
    });

    it('should support limit parameter', async () => {
      const response = await request(app)
        .get('/api/v1/reporting/countries')
        .query({ limit: 5 })
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.data.countries.length).toBeLessThanOrEqual(5);
    });

    it('should reject invalid limit', async () => {
      await request(app)
        .get('/api/v1/reporting/countries')
        .query({ limit: 100 }) // Max is 50
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);
    });
  });

  describe('GET /api/v1/reporting/top-apps', () => {
    it('should return top performing apps', async () => {
      const response = await request(app)
        .get('/api/v1/reporting/top-apps')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('apps');
      expect(Array.isArray(response.body.data.apps)).toBe(true);
    });
  });

  describe('GET /api/v1/reporting/realtime', () => {
    it('should return real-time statistics', async () => {
      const response = await request(app)
        .get('/api/v1/reporting/realtime')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('impressions');
      expect(response.body.data).toHaveProperty('clicks');
      expect(response.body.data).toHaveProperty('revenue');
      expect(response.body.data).toHaveProperty('activeAdapters');
      expect(response.body.data).toHaveProperty('timestamp');
    });
  });
  }); // End ClickHouse-dependent tests
});
