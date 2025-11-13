/**
 * Unit tests for meta routes
 * Tests feature flag API endpoint
 */

import request from 'supertest';
import express, { Application } from 'express';
import metaRoutes from '../../routes/meta.routes';

// Mock feature flags
jest.mock('../../utils/featureFlags', () => ({
  getFeatureFlags: jest.fn(() => ({
    transparencyEnabled: true,
    billingEnabled: true,
    fraudDetectionEnabled: true,
    abTestingEnabled: false,
    migrationStudioEnabled: true,
  })),
}));

describe('Meta Routes', () => {
  let app: Application;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api/v1/meta', metaRoutes);
  });

  describe('GET /api/v1/meta/features', () => {
    it('should return feature flags', async () => {
      const response = await request(app)
        .get('/api/v1/meta/features')
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('data');
      expect(response.body.data).toHaveProperty('billing');
      expect(response.body.data).toHaveProperty('transparency');
    });

    it('should include timestamp', async () => {
      const response = await request(app)
        .get('/api/v1/meta/features')
        .expect(200);

      expect(response.body).toHaveProperty('timestamp');
      expect(new Date(response.body.timestamp)).toBeInstanceOf(Date);
    });

    it('should return correct flag values', async () => {
      const response = await request(app)
        .get('/api/v1/meta/features')
        .expect(200);

      expect(response.body.data.billing).toBe(true);
      expect(response.body.data.transparency).toBe(true);
      expect(response.body.data.fraudDetection).toBe(true);
      expect(response.body.data.abTesting).toBe(false);
      expect(response.body.data.migrationStudio).toBe(true);
    });
  });

  describe('GET /api/v1/meta/info', () => {
    it('should return API metadata', async () => {
      const response = await request(app)
        .get('/api/v1/meta/info')
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('data');
      expect(response.body.data).toHaveProperty('name');
      expect(response.body.data).toHaveProperty('version');
      expect(response.body.data).toHaveProperty('environment');
    });
  });
});
