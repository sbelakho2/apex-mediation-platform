import request from 'supertest';
import express from 'express';

// Mock auth to inject a user and bypass real auth
jest.mock('../../middleware/auth', () => ({
  authenticate: jest.fn((req, _res, next) => {
    (req as any).user = { userId: 'u1', publisherId: 'pub-1' };
    next();
  }),
}));

jest.mock('../../utils/postgres');
jest.mock('../../services/vra/vraService');

import vraRoutes from '../../routes/vra.routes';

describe('VRA Disputes — request validation', () => {
  let app: express.Application;

  beforeEach(() => {
    jest.clearAllMocks();
    app = express();
    app.use(express.json());
    process.env.VRA_ENABLED = 'true';
    process.env.VRA_SHADOW_ONLY = 'true';
    app.use('/api/v1', vraRoutes);
  });

  it('returns 400 when body is missing delta_ids or network is not a string', async () => {
    await request(app)
      .post('/api/v1/recon/disputes')
      .send({ delta_ids: 'not-an-array', network: 123 })
      .expect(400);

    await request(app)
      .post('/api/v1/recon/disputes')
      .send({ network: 'unity' })
      .expect(400);
  });
});
