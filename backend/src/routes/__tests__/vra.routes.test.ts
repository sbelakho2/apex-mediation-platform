import request from 'supertest';
import express from 'express';

// Mock auth to inject a user and bypass real auth
jest.mock('../../middleware/auth', () => ({
  authenticate: jest.fn((req, _res, next) => {
    (req as any).user = { userId: 'u1', publisherId: 'pub-1' };
    next();
  }),
}));

// Mock CH client usage in executeQuery/insertBatch
jest.mock('../../utils/clickhouse', () => ({
  executeQuery: jest.fn(async () => []),
  insertBatch: jest.fn(async () => {}),
}));

import vraRoutes from '../../routes/vra.routes';

describe('VRA Routes', () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    // Reset env flags each test
    delete process.env.VRA_ENABLED;
    delete process.env.VRA_SHADOW_ONLY;
    app.use('/api/v1', vraRoutes);
  });

  it('returns 404 when VRA feature disabled', async () => {
    process.env.VRA_ENABLED = 'false';
    await request(app).get('/api/v1/recon/overview').expect(404);
  });

  it('returns overview payload when enabled (CH empty)', async () => {
    process.env.VRA_ENABLED = 'true';
    const res = await request(app).get('/api/v1/recon/overview').expect(200);
    expect(res.body).toHaveProperty('success', true);
    expect(res.body.data).toHaveProperty('coveragePercent');
    expect(res.body.data).toHaveProperty('totals');
  });

  it('POST /recon/disputes responds with 202 in shadow mode', async () => {
    process.env.VRA_ENABLED = 'true';
    process.env.VRA_SHADOW_ONLY = 'true';
    const res = await request(app)
      .post('/api/v1/recon/disputes')
      .send({ delta_ids: ['e1','e2'], network: 'unity', contact: 'ops@example.com' })
      .expect(202);
    expect(res.body).toHaveProperty('success', true);
    expect(res.body.data).toHaveProperty('shadow', true);
  });

  it('GET /proofs/revenue_digest with bad month returns 400', async () => {
    process.env.VRA_ENABLED = 'true';
    const res = await request(app)
      .get('/api/v1/proofs/revenue_digest?month=202511')
      .expect(400);
    expect(res.body).toHaveProperty('success', false);
  });
});
