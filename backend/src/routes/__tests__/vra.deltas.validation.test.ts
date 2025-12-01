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

describe('VRA Deltas — JSON validation', () => {
  let app: express.Application;

  beforeEach(() => {
    jest.clearAllMocks();
    app = express();
    app.use(express.json());
    process.env.VRA_ENABLED = 'true';
    app.use('/api/v1', vraRoutes);
  });

  it('returns 400 on invalid min_conf (out of range)', async () => {
    const res = await request(app)
      .get('/api/v1/recon/deltas?min_conf=-0.1')
      .expect(400);
    expect(res.body).toHaveProperty('success', false);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 200 on valid params (empty list OK)', async () => {
    const res = await request(app)
      .get('/api/v1/recon/deltas?from=2025-11-01T00:00:00Z&to=2025-11-02T00:00:00Z&page=1&page_size=100')
      .expect(200);
    expect(res.body).toHaveProperty('success', true);
    expect(res.body).toHaveProperty('items');
    expect(Array.isArray(res.body.items)).toBe(true);
  });
});
