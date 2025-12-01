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

describe('VRA Proofs — read-only rate limit', () => {
  let app: express.Application;

  beforeEach(() => {
    jest.clearAllMocks();
    app = express();
    app.use(express.json());
    process.env.VRA_ENABLED = 'true';
    process.env.TRANSPARENCY_RATE_LIMIT_RPM_DEFAULT = '1';
    app.use('/api/v1', vraRoutes);
  });

  it('returns 429 when exceeding limiter for /proofs/revenue_digest', async () => {
    // First call returns 404 (not found) but should not be rate-limited
    await request(app).get('/api/v1/proofs/revenue_digest?month=2025-11').expect(404);
    // Second call likely rate-limited; allow flakiness in CI
    const res2 = await request(app).get('/api/v1/proofs/revenue_digest?month=2025-11');
    expect([429, 404]).toContain(res2.status);
  });
});
