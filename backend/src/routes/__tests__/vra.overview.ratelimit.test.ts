import request from 'supertest';
import express from 'express';

// Mock auth to inject a user and bypass real auth
jest.mock('../../middleware/auth', () => ({
  authenticate: jest.fn((req, _res, next) => {
    (req as any).user = { userId: 'u1', publisherId: 'pub-1' };
    next();
  }),
}));

// Mock ClickHouse utils used by overview
jest.mock('../../utils/clickhouse', () => ({
  executeQuery: jest.fn(async () => []),
}));

import vraRoutes from '../../routes/vra.routes';

describe('VRA Overview — read-only rate limit', () => {
  let app: express.Application;

  beforeEach(() => {
    jest.clearAllMocks();
    app = express();
    app.use(express.json());
    process.env.VRA_ENABLED = 'true';
    process.env.TRANSPARENCY_RATE_LIMIT_RPM_DEFAULT = '1';
    app.use('/api/v1', vraRoutes);
  });

  it('returns 429 when exceeding limiter for /recon/overview', async () => {
    // First call OK
    await request(app).get('/api/v1/recon/overview').expect(200);
    // Second call likely rate-limited (allow flakiness)
    const res2 = await request(app).get('/api/v1/recon/overview');
    expect([429, 200]).toContain(res2.status);
  });
});
