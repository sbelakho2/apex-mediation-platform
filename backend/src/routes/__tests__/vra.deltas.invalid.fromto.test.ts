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

describe('VRA Deltas — invalid from/to timestamps', () => {
  let app: express.Application;

  beforeEach(() => {
    jest.clearAllMocks();
    app = express();
    app.use(express.json());
    process.env.VRA_ENABLED = 'true';
    app.use('/api/v1', vraRoutes);
  });

  it('JSON: returns 400 on invalid from timestamp', async () => {
    await request(app)
      .get('/api/v1/recon/deltas?from=not-a-date&to=2025-11-02T00:00:00Z')
      .expect(400);
  });

  it('CSV: returns 400 on invalid to timestamp', async () => {
    await request(app)
      .get('/api/v1/recon/deltas.csv?from=2025-11-01T00:00:00Z&to=not-a-date')
      .expect(400);
  });
});
