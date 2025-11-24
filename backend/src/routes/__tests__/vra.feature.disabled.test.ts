import request from 'supertest';
import express from 'express';

// Mock auth to inject a user and bypass real auth
jest.mock('../../middleware/auth', () => ({
  authenticate: jest.fn((req, _res, next) => {
    (req as any).user = { userId: 'u1', publisherId: 'pub-1' };
    next();
  }),
}));

import vraRoutes from '../../routes/vra.routes';

describe('VRA routes — feature disabled returns 404', () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    process.env.VRA_ENABLED = 'false';
    app.use('/api/v1', vraRoutes);
  });

  it('overview 404', async () => {
    await request(app).get('/api/v1/recon/overview').expect(404);
  });

  it('deltas JSON 404', async () => {
    await request(app).get('/api/v1/recon/deltas').expect(404);
  });

  it('deltas CSV 404', async () => {
    await request(app).get('/api/v1/recon/deltas.csv').expect(404);
  });

  it('proofs digest 404', async () => {
    await request(app).get('/api/v1/proofs/revenue_digest?month=2025-11').expect(404);
  });
});
