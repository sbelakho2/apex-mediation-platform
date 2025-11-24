import request from 'supertest';
import express from 'express';

// Mock auth to inject a user and bypass real auth
jest.mock('../../middleware/auth', () => ({
  authenticate: jest.fn((req, _res, next) => {
    (req as any).user = { userId: 'u1', publisherId: 'pub-1' };
    next();
  }),
}));

// Mock ClickHouse helpers: executeQuery returns empty; insertBatch records calls
jest.mock('../../utils/clickhouse', () => ({
  executeQuery: jest.fn(async () => []),
  insertBatch: jest.fn(async () => {}),
}));

import vraRoutes from '../../routes/vra.routes';

describe('VRA Controllers — RBAC/logs spot-check', () => {
  let app: express.Application;

  beforeEach(() => {
    jest.clearAllMocks();
    app = express();
    app.use(express.json());
    process.env.VRA_ENABLED = 'true';
    // Start in SHADOW mode true to ensure no writes on disputes
    process.env.VRA_SHADOW_ONLY = 'true';
    app.use('/api/v1', vraRoutes);
  });

  it('disputes in shadow mode do not write; logs can accept PII-like strings without throwing', async () => {
    const { insertBatch } = jest.requireMock('../../utils/clickhouse');
    // Perform a shadow disputes call with PII-like content in body to exercise log paths
    await request(app)
      .post('/api/v1/recon/disputes')
      .send({ delta_ids: ['ev1'], network: 'unity', contact: 'ops@example.com' })
      .expect(202);
    expect(insertBatch).not.toHaveBeenCalled();
  });
});
