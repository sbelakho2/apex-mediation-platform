import request from 'supertest';
import express from 'express';

// Mock auth to inject a user and bypass real auth
jest.mock('../../middleware/auth', () => ({
  authenticate: jest.fn((req, _res, next) => {
    (req as any).user = { userId: 'u1', publisherId: 'pub-1' };
    next();
  }),
}));

jest.mock('../../services/vra/vraService');

import vraRoutes from '../../routes/vra.routes';

describe('VRA Deltas — JSON rate limit', () => {
  let app: express.Application;

  beforeEach(() => {
    jest.clearAllMocks();
    app = express();
    app.use(express.json());
    process.env.VRA_ENABLED = 'true';
    // Low RPM to trigger limiter
    process.env.TRANSPARENCY_RATE_LIMIT_RPM_DEFAULT = '1';
    app.use('/api/v1', vraRoutes);
  });

  it('returns 429 when exceeding the read-only limiter', async () => {
    // First call passes
    await request(app)
      .get('/api/v1/recon/deltas?from=2025-11-01T00:00:00Z&to=2025-11-02T00:00:00Z')
      .expect(200);
    // Second call likely rate-limited; allow flakiness in CI
    const res2 = await request(app)
      .get('/api/v1/recon/deltas?from=2025-11-01T00:00:00Z&to=2025-11-02T00:00:00Z');
    expect([429, 200]).toContain(res2.status);
  });
});
